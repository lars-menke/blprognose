// Monte-Carlo-Saisonsimulation.
//
// Nachgelagerte Anwendung: sie erzeugt keinen Matchtipp und trainiert nichts.
// Sie zieht fuer jedes offene Spiel einen VOLLSTAENDIGEN Score aus dessen
// finaler Matrix -- derselben, die auch die Matchkarte zeigt. Damit ist die
// im Review benannte Inkonsistenz (Simulation lief ohne Markt-Blend, also
// als zweites Modell) strukturell ausgeschlossen: Es gibt nur eine Verteilung
// pro Spiel, und die kommt von aussen herein.
//
// Deterministisch: Seed aus Spiel-IDs und Ergebnissen. Gleiche Eingaben,
// gleiche Ziehungen.

import type { MatchRecord, ScoreMatrix } from '../types.ts';
import { hashSeed, mulberry32 } from './random.ts';

export interface TeamSimulation {
  teamId: number;
  champion: number;
  top4: number;
  /** Platz 16 bis 18 -- NICHT die Wahrscheinlichkeit des tatsaechlichen Abstiegs nach Relegation. */
  bottom3: number;
  averagePosition: number;
  /** Verteilung ueber Plaetze 1..n (Anteil der Laeufe). */
  positions: number[];
  expectedPoints: number;
}

export interface SeasonSimulation {
  runs: number;
  seed: number;
  teams: TeamSimulation[];
  /** Monte-Carlo-Ziehfehler der Meisterwahrscheinlichkeit des Favoriten. Kein Modell-Konfidenzintervall. */
  favoriteTitleStandardError: number;
  openMatches: number;
  finishedMatches: number;
}

interface Row { points: number; gf: number; ga: number }

/** Tabellen-Sortierung: Punkte, Tordifferenz, erzielte Tore, Team-ID (technischer Tiebreaker). */
export function compareRows(a: Row & { id: number }, b: Row & { id: number }): number {
  return (b.points - a.points)
    || ((b.gf - b.ga) - (a.gf - a.ga))
    || (b.gf - a.gf)
    || (a.id - b.id);
}

export function baseTable(teamIds: readonly number[], finished: readonly MatchRecord[]): Map<number, Row> {
  const table = new Map<number, Row>(teamIds.map(id => [id, { points: 0, gf: 0, ga: 0 }]));
  for (const m of finished) {
    if (!m.finished || m.homeGoals === null || m.awayGoals === null) continue;
    const h = table.get(m.homeId), a = table.get(m.awayId);
    if (!h || !a) continue;
    h.gf += m.homeGoals; h.ga += m.awayGoals; a.gf += m.awayGoals; a.ga += m.homeGoals;
    if (m.homeGoals > m.awayGoals) h.points += 3;
    else if (m.homeGoals < m.awayGoals) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  return table;
}

interface Flat { homeId: number; awayId: number; cdf: Float64Array; size: number }

function flatten(m: MatchRecord, matrix: ScoreMatrix): Flat {
  const size = matrix.cells.length;
  const cdf = new Float64Array(size * size);
  let acc = 0, k = 0;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) { acc += matrix.cells[i][j]; cdf[k++] = acc; }
  cdf[cdf.length - 1] = 1; // Rundungsschutz
  return { homeId: m.homeId, awayId: m.awayId, cdf, size };
}

function draw(f: Flat, u: number): { home: number; away: number } {
  let lo = 0, hi = f.cdf.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (f.cdf[mid] >= u) hi = mid; else lo = mid + 1; }
  return { home: Math.floor(lo / f.size), away: lo % f.size };
}

export function seedFor(matches: readonly MatchRecord[]): number {
  const key = matches.map(m => `${m.id}:${m.finished ? `${m.homeGoals}-${m.awayGoals}` : 'o'}`).join('|');
  return hashSeed(key);
}

export function simulateSeason(
  teamIds: readonly number[],
  seasonMatches: readonly MatchRecord[],
  finalMatrices: ReadonlyMap<number, ScoreMatrix>,
  runs: number,
  seed = seedFor(seasonMatches),
): SeasonSimulation {
  const finished = seasonMatches.filter(m => m.finished);
  const open = seasonMatches.filter(m => !m.finished);
  const flats: Flat[] = [];
  for (const m of open) {
    const matrix = finalMatrices.get(m.id);
    if (!matrix) throw new Error(`Keine finale Matrix fuer offenes Spiel ${m.id}`);
    flats.push(flatten(m, matrix));
  }

  const base = baseTable(teamIds, finished);
  const n = teamIds.length;
  const idx = new Map(teamIds.map((id, i) => [id, i]));
  const champion = new Float64Array(n), top4 = new Float64Array(n), bottom3 = new Float64Array(n);
  const posSum = new Float64Array(n), pointsSum = new Float64Array(n);
  const positions = teamIds.map(() => new Float64Array(n));
  const rng = mulberry32(seed);

  const rows = teamIds.map(id => ({ id, points: 0, gf: 0, ga: 0 }));

  for (let r = 0; r < runs; r++) {
    for (const row of rows) { const b = base.get(row.id)!; row.points = b.points; row.gf = b.gf; row.ga = b.ga; }
    for (const f of flats) {
      const s = draw(f, rng());
      const h = rows[idx.get(f.homeId)!], a = rows[idx.get(f.awayId)!];
      h.gf += s.home; h.ga += s.away; a.gf += s.away; a.ga += s.home;
      if (s.home > s.away) h.points += 3; else if (s.home < s.away) a.points += 3; else { h.points++; a.points++; }
    }
    const sorted = rows.slice().sort(compareRows);
    for (let pos = 0; pos < n; pos++) {
      const i = idx.get(sorted[pos].id)!;
      positions[i][pos]++;
      posSum[i] += pos + 1;
      pointsSum[i] += sorted[pos].points;
      if (pos === 0) champion[i]++;
      if (pos < 4) top4[i]++;
      if (pos >= n - 3) bottom3[i]++;
    }
  }

  const teams: TeamSimulation[] = teamIds.map((teamId, i) => ({
    teamId,
    champion: champion[i] / runs,
    top4: top4[i] / runs,
    bottom3: bottom3[i] / runs,
    averagePosition: posSum[i] / runs,
    positions: Array.from(positions[i], v => v / runs),
    expectedPoints: pointsSum[i] / runs,
  }));
  const pFav = Math.max(...teams.map(t => t.champion));
  return {
    runs, seed, teams,
    favoriteTitleStandardError: Math.sqrt(pFav * (1 - pFav) / runs),
    openMatches: open.length,
    finishedMatches: finished.length,
  };
}
