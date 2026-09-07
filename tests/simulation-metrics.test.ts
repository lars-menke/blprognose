import { describe, it, expect } from 'vitest';
import { simulateSeason, baseTable, compareRows } from '../src/model/simulation.ts';
import { buildMatrix } from '../src/model/matrix.ts';
import { redistribute } from '../src/model/blend.ts';
import { brier, compareOnSameSubset, currentMatchday, logLoss, rps, summarize, summarizeTips, type EvaluatedForecast } from '../src/evaluation/metrics.ts';
import { makeLeague, simulateSeasonRecords } from './helpers/synthetic.ts';
import type { MatchRecord, ScoreMatrix } from '../src/types.ts';

describe('Saisonsimulation', () => {
  const league = makeLeague(21, 6);
  const season = simulateSeasonRecords(league, 2026, 5);
  // Erste 15 Spiele beendet, Rest offen
  const matches: MatchRecord[] = season.map((m, i) => i < 15 ? m : { ...m, finished: false, homeGoals: null, awayGoals: null });
  const matrices = new Map<number, ScoreMatrix>();
  for (const m of matches) if (!m.finished) matrices.set(m.id, buildMatrix(1.5, 1.1, -0.1));

  it('ist deterministisch bei gleichen Eingaben', () => {
    const a = simulateSeason(league.teamIds, matches, matrices, 500);
    const b = simulateSeason(league.teamIds, matches, matrices, 500);
    expect(a.seed).toBe(b.seed);
    expect(a.teams.map(t => t.champion)).toEqual(b.teams.map(t => t.champion));
  });
  it('Wahrscheinlichkeiten summieren ueber die Teams zu 1 (Meister) bzw. 4 (Top 4) bzw. 3 (Platz 16-18)', () => {
    const s = simulateSeason(league.teamIds, matches, matrices, 500);
    const sum = (k: 'champion' | 'top4' | 'bottom3') => s.teams.reduce((acc, t) => acc + t[k], 0);
    expect(sum('champion')).toBeCloseTo(1, 9);
    expect(sum('top4')).toBeCloseTo(4, 9);
    expect(sum('bottom3')).toBeCloseTo(3, 9);
    for (const t of s.teams) expect(t.positions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(s.openMatches).toBe(matches.length - 15);
    expect(s.favoriteTitleStandardError).toBeGreaterThan(0);
  });
  it('verwendet die UEBERGEBENE finale Matrix -- ein Markt-Blend schlaegt auf die Simulation durch', () => {
    const raw = buildMatrix(1.5, 1.1, -0.1);
    const homeHeavy = new Map<number, ScoreMatrix>();
    const awayHeavy = new Map<number, ScoreMatrix>();
    for (const m of matches) if (!m.finished) {
      homeHeavy.set(m.id, redistribute(raw, { H: 0.85, D: 0.1, A: 0.05 }));
      awayHeavy.set(m.id, redistribute(raw, { H: 0.05, D: 0.1, A: 0.85 }));
    }
    const a = simulateSeason(league.teamIds, matches, homeHeavy, 800);
    const b = simulateSeason(league.teamIds, matches, awayHeavy, 800);
    // Gleicher Seed, andere Verteilung -> andere erwartete Punkte
    const ptsA = a.teams.map(t => t.expectedPoints), ptsB = b.teams.map(t => t.expectedPoints);
    expect(ptsA).not.toEqual(ptsB);
  });
  it('wirft, wenn fuer ein offenes Spiel keine Matrix uebergeben wurde (kein stilles Parallelmodell)', () => {
    expect(() => simulateSeason(league.teamIds, matches, new Map(), 10)).toThrow(/Keine finale Matrix/);
  });
  it('Tabellen-Tiebreak: Punkte, Tordifferenz, Tore, Team-ID', () => {
    const rows = [
      { id: 3, points: 10, gf: 8, ga: 5 },
      { id: 1, points: 10, gf: 9, ga: 6 },
      { id: 2, points: 10, gf: 8, ga: 5 },
    ];
    expect(rows.sort(compareRows).map(r => r.id)).toEqual([1, 2, 3]);
    const t = baseTable([1, 2], [{ ...matches[0], homeId: 1, awayId: 2, finished: true, homeGoals: 2, awayGoals: 2 }]);
    expect(t.get(1)!.points).toBe(1);
    expect(t.get(2)!.points).toBe(1);
  });
});

describe('Metriken', () => {
  const p = { H: 0.5, D: 0.3, A: 0.2 };
  it('Log-Loss, Brier, RPS (ungeteilt)', () => {
    expect(logLoss(p, 'H')).toBeCloseTo(-Math.log(0.5), 12);
    expect(brier(p, 'H')).toBeCloseTo(0.25 + 0.09 + 0.04, 12);
    // RPS ungeteilt: (0.5-1)^2 + (0.8-1)^2 = 0.25 + 0.04
    expect(rps(p, 'H')).toBeCloseTo(0.29, 12);
    expect(rps(p, 'A')).toBeCloseTo(0.25 + 0.64, 12);
  });
  it('summarize zaehlt Argmax-Treffer', () => {
    const s = summarize([{ p, actual: 'H' }, { p, actual: 'A' }]);
    expect(s.n).toBe(2);
    expect(s.outcomeAccuracy).toBe(0.5);
  });
  it('Tipp-Zusammenfassung: exakt und Punkte', () => {
    const s = summarizeTips([{ tip: { home: 2, away: 1 }, actual: { home: 2, away: 1 } }, { tip: { home: 2, away: 1 }, actual: { home: 0, away: 1 } }]);
    expect(s.exact).toBe(0.5);
    expect(s.averagePoints).toBe(2);
  });
  it('vergleicht Modell, Markt und Blend NUR auf der gemeinsamen Teilmenge (Review 12.2)', () => {
    const mk = (id: number, market: EvaluatedForecast['market']): EvaluatedForecast => ({
      matchId: id, season: 2026, matchday: 1, modelVersion: 'x',
      model: p, market, blend: p, score: { home: 2, away: 1 }, tipScore: { home: 2, away: 1 }, actual: { home: 1, away: 0 },
    });
    const c = compareOnSameSubset([mk(1, { H: 0.6, D: 0.25, A: 0.15 }), mk(2, null), mk(3, { H: 0.4, D: 0.3, A: 0.3 })]);
    expect(c.withMarket.n).toBe(2);
    expect(c.withMarket.model.n).toBe(2);
    expect(c.withMarket.market.n).toBe(2);
    expect(c.all.n).toBe(3);
  });
});

describe('Aktueller Spieltag je Saison (Review-Fehler 3)', () => {
  const mk = (season: number, matchday: number, finished: boolean): MatchRecord => ({
    id: season * 1000 + matchday, league: 'bl1', season, matchday, kickoff: '2026-01-01T00:00:00Z',
    homeId: 1, awayId: 2, homeName: 'a', awayName: 'b', homeShort: 'a', awayShort: 'b',
    finished, homeGoals: finished ? 1 : null, awayGoals: finished ? 0 : null,
  });
  it('Vorsaison-Spieltag 34 uebersteuert aktuellen Spieltag 2 nicht', () => {
    const all = [mk(2025, 34, true), mk(2026, 1, true), mk(2026, 2, false), mk(2026, 3, false)];
    expect(currentMatchday(all, 2026)).toBe(2);
    expect(currentMatchday(all, 2025)).toBe(34);
  });
  it('liefert den hoechsten Spieltag, wenn alles gespielt ist, und 1 ohne Daten', () => {
    expect(currentMatchday([mk(2026, 1, true), mk(2026, 2, true)], 2026)).toBe(2);
    expect(currentMatchday([], 2026)).toBe(1);
  });
});
