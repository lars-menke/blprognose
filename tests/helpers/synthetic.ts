// Synthetische Liga mit BEKANNTEN Parametern. Damit laesst sich pruefen, ob
// der Fit die Wahrheit zurueckgewinnt -- der einzige Test, der die Statistik
// selbst prueft, nicht nur Invarianten.

import type { FitMatch } from '../../src/model/fit.ts';
import type { MatchRecord, Ratings } from '../../src/types.ts';
import { buildMatrix } from '../../src/model/matrix.ts';
import { mulberry32 } from '../../src/model/random.ts';

export interface SyntheticLeague {
  truth: Ratings;
  teamIds: number[];
}

/** Standardnormal per Box-Muller. */
function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * @param idBase  Erste Team-ID. OpenLigaDB-IDs sind ligaweit eindeutig -- zwei
 *                Ligen einer Testwelt brauchen disjunkte ID-Raeume, sonst gelten
 *                Bundesligisten faelschlich als Aufsteiger aus der 2. Liga.
 */
export function makeLeague(seed: number, nTeams = 18, spread = 0.25, idBase = 100): SyntheticLeague {
  const rng = mulberry32(seed);
  const teamIds = Array.from({ length: nTeams }, (_, i) => idBase + i);
  const attack = new Map<number, number>();
  const defense = new Map<number, number>();
  let ma = 0, md = 0;
  for (const id of teamIds) { const a = gauss(rng) * spread, d = gauss(rng) * spread; attack.set(id, a); defense.set(id, d); ma += a; md += d; }
  ma /= nTeams; md /= nTeams;
  for (const id of teamIds) { attack.set(id, attack.get(id)! - ma); defense.set(id, defense.get(id)! - md); }
  return { truth: { mu: 0.30, home: 0.25, rho: -0.10, attack, defense }, teamIds };
}

/** Zieht (i,j) aus einer normierten Matrix per inverser CDF. */
export function sampleScore(cells: number[][], rng: () => number): { home: number; away: number } {
  let u = rng();
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells[i].length; j++) {
      u -= cells[i][j];
      if (u <= 0) return { home: i, away: j };
    }
  }
  return { home: cells.length - 1, away: cells.length - 1 };
}

/** Doppelte Runde (jeder gegen jeden, Heim und Auswaerts). */
export function roundRobin(teamIds: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const h of teamIds) for (const a of teamIds) if (h !== a) pairs.push([h, a]);
  return pairs;
}

export function simulateSeason(league: SyntheticLeague, seed: number): FitMatch[] {
  const rng = mulberry32(seed);
  const { truth } = league;
  return roundRobin(league.teamIds).map(([h, a]) => {
    const lH = Math.exp(truth.mu + truth.home + truth.attack.get(h)! + truth.defense.get(a)!);
    const lA = Math.exp(truth.mu + truth.attack.get(a)! + truth.defense.get(h)!);
    const m = buildMatrix(lH, lA, truth.rho);
    const s = sampleScore(m.cells, rng);
    return { homeId: h, awayId: a, homeGoals: s.home, awayGoals: s.away, weight: 1 };
  });
}

/** Vollstaendige MatchRecords mit Terminen (fuer Datenschicht/Orchestrator-Tests). */
export function simulateSeasonRecords(
  league: SyntheticLeague, season: number, seed: number, leagueKey: 'bl1' | 'bl2' = 'bl1', teamIds = league.teamIds,
): MatchRecord[] {
  const rng = mulberry32(seed);
  const { truth } = league;
  const pairs = roundRobin(teamIds);
  // 34 Spieltage a 9 Spiele: einfache Aufteilung, Kalender ab August, wochenweise
  const perDay = teamIds.length / 2;
  const start = Date.UTC(season, 7, 15, 13, 30);
  return pairs.map(([h, a], k) => {
    const matchday = Math.floor(k / perDay) + 1;
    const kickoff = new Date(start + (matchday - 1) * 7 * 86_400_000 + (k % perDay) * 3_600_000).toISOString();
    const lH = Math.exp(truth.mu + truth.home + (truth.attack.get(h) ?? 0) + (truth.defense.get(a) ?? 0));
    const lA = Math.exp(truth.mu + (truth.attack.get(a) ?? 0) + (truth.defense.get(h) ?? 0));
    const s = sampleScore(buildMatrix(lH, lA, truth.rho).cells, rng);
    return {
      id: season * 100_000 + k + 1, league: leagueKey, season, matchday, kickoff,
      homeId: h, awayId: a, homeName: `Team ${h}`, awayName: `Team ${a}`, homeShort: `T${h}`, awayShort: `T${a}`,
      finished: true, homeGoals: s.home, awayGoals: s.away,
    };
  });
}

export function correlation(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
}
