import { describe, it, expect } from 'vitest';
import { buildForecasts, buildSeasonSimulation, loadDataset, prepareSeasonModel } from '../src/forecast.ts';
import { withParams } from '../src/model/params.ts';
import { outcomeProbs } from '../src/model/matrix.ts';
import { deriveStats } from '../src/model/derived.ts';
import type { SeasonSource } from '../src/data/openliga.ts';
import type { League, MatchRecord } from '../src/types.ts';
import type { MarketProbs } from '../src/market/odds.ts';
import { makeLeague, simulateSeasonRecords } from './helpers/synthetic.ts';

// Synthetische Welt: BL1 18 Teams, BL2 18 Teams, ein Aufsteiger (777) wechselt
// zur Saison 2026 von BL2 in BL1, ein Absteiger (117) faellt heraus.
const bl1 = makeLeague(100, 18);            // IDs 100..117
const bl2 = makeLeague(200, 18, 0.25, 200); // IDs 200..217 -- disjunkt zur BL1
const promotedId = 777;
bl2.truth.attack.set(promotedId, 0.35); bl2.truth.defense.set(promotedId, -0.15); // stark in BL2
bl1.truth.attack.set(promotedId, -0.3); bl1.truth.defense.set(promotedId, 0.25);  // schwach in BL1
const bl1IdsOld = bl1.teamIds;                                   // 100..117
const bl1IdsNew = [...bl1.teamIds.slice(0, 17), promotedId];    // 117 raus, 777 rein
const bl2Ids = [...bl2.teamIds.slice(0, 17), promotedId];

const seasons: Record<string, MatchRecord[]> = {
  'bl1-2024': simulateSeasonRecords(bl1, 2024, 1, 'bl1', bl1IdsOld),
  'bl1-2025': simulateSeasonRecords(bl1, 2025, 2, 'bl1', bl1IdsOld),
  'bl1-2026': simulateSeasonRecords(bl1, 2026, 3, 'bl1', bl1IdsNew),
  'bl2-2023': simulateSeasonRecords(bl2, 2023, 4, 'bl2', bl2Ids),
  'bl2-2024': simulateSeasonRecords(bl2, 2024, 5, 'bl2', bl2Ids),
  'bl2-2025': simulateSeasonRecords(bl2, 2025, 6, 'bl2', bl2Ids),
};

const fake: SeasonSource = {
  async loadSeason(league: League, season: number) {
    return structuredClone(seasons[`${league}-${season}`] ?? []);
  },
};

// Produktionsparameter -- der Konvergenztest unten soll die echte Konfiguration pruefen
const params = withParams();

describe('Orchestrator', () => {
  it('laedt sechs Saisonabrufe und prueft den aktuellen Spielplan', async () => {
    const data = await loadDataset(fake, 2026);
    expect(data.current).toHaveLength(306);
    expect(data.previousBl1).toHaveLength(2);
    expect(data.previousBl2).toHaveLength(3);
    expect(data.issues.filter(i => i.level === 'error')).toHaveLength(0);
  });

  it('wirft bei unbrauchbarem Spielplan statt still zu prognostizieren', async () => {
    const broken: SeasonSource = { async loadSeason(l, s) { const d = await fake.loadSeason(l, s); return l === 'bl1' && s === 2026 ? d.slice(0, 5) : d; } };
    await expect(loadDataset(broken, 2026)).rejects.toThrow(/unbrauchbar/);
  });

  it('trainiert ohne Look-ahead und erkennt den Aufsteiger mit Zweitliga-Prior', async () => {
    const data = await loadDataset(fake, 2026);
    // Stichtag: vor Spieltag 10 der laufenden Saison
    const md10 = data.current.filter(m => m.matchday === 10);
    const asOf = new Date(Math.min(...md10.map(m => Date.parse(m.kickoff))) - 60_000);
    const model = prepareSeasonModel(data, asOf, params);

    expect(model.promoted).toEqual([promotedId]);
    expect(model.priors.source.get(promotedId)).toBe('bl2-rating');
    expect(model.translation.observations).toBeGreaterThanOrEqual(0);
    expect(model.diagnostics.final.converged).toBe(true);
    // Trainingsspiele = 2 Vorsaisons + 9 gespielte Spieltage (9*9=81)
    expect(model.diagnostics.final.matches).toBe(612 + 81);
    expect(model.ratings.attack.has(promotedId)).toBe(true);
    expect(model.ratings.attack.has(117)).toBe(true); // Absteiger bleibt im Universum

    // Prior exakt nach Spezifikation: 0.60 x BL2-Rating + ln(Faktor). In dieser Welt gibt es
    // keine historischen Aufsteiger (BL1-Vorsaisons und BL2 ueberschneiden sich nicht) -> Fallback 0.85.
    expect(model.translation.source).toBe('fallback');
    const bl2Attack = model.bl2Ratings!.attack.get(promotedId)!;
    const prior = model.priors.attack.get(promotedId)!;
    expect(prior).toBeCloseTo(0.6 * bl2Attack + Math.log(0.85), 9);

    // Nach 9 Spielen dominiert der Prior (Ridge-Kruemmung 8 vs. Daten ~12): Rating liegt
    // naeher am Prior als an der in dieser Welt extremen BL1-Wahrheit (-0.3).
    const truth = -0.3;
    const r10 = model.ratings.attack.get(promotedId)!;
    expect(Math.abs(r10 - prior)).toBeLessThan(Math.abs(r10 - truth));

    // Nach 29 Spielen dominiert die Live-Statistik: das Rating wandert zur Wahrheit.
    const md30 = data.current.filter(m => m.matchday === 30);
    const asOf30 = new Date(Math.min(...md30.map(m => Date.parse(m.kickoff))) - 60_000);
    const model30 = prepareSeasonModel(data, asOf30, params);
    const r30 = model30.ratings.attack.get(promotedId)!;
    expect(model30.diagnostics.final.converged).toBe(true);
    expect(Math.abs(r30 - truth)).toBeLessThan(Math.abs(r10 - truth));
    expect(r30).toBeLessThan(0);
  });

  it('Prognoseobjekt: nur offene Spiele nach dem Stichtag, konsistente Matrix, Bloecke = probabilities', async () => {
    const data = await loadDataset(fake, 2026);
    const md10 = data.current.filter(m => m.matchday === 10);
    const asOf = new Date(Math.min(...md10.map(m => Date.parse(m.kickoff))) - 60_000);
    const model = prepareSeasonModel(data, asOf, params);
    const open = data.current.filter(m => m.matchday === 10).map(m => ({ ...m, finished: false, homeGoals: null, awayGoals: null }));
    const forecasts = buildForecasts(model, open);
    expect(forecasts).toHaveLength(9);
    for (const f of forecasts) {
      expect(f.path).toBe('model');
      expect(f.probabilities.H + f.probabilities.D + f.probabilities.A).toBeCloseTo(1, 12);
      const blocks = outcomeProbs(f.scoreMatrix.cells);
      expect(blocks.H).toBeCloseTo(f.probabilities.H, 10);
      expect(f.probs.H + f.probs.D + f.probs.A).toBe(100);
      // Spielprofil kommt aus der finalen Matrix
      expect(f.derived).toEqual(deriveStats(f.scoreMatrix));
      // Ohne Markt: finale = temperierte Modellmatrix
      expect(f.scoreMatrix.cells[1][1]).toBeCloseTo(f.modelScoreMatrix.cells[1][1], 12);
      expect(f.decisions.primaryRule).toBe('tipGame');
      expect(f.decisions.tipGame.expectedPoints).toBeGreaterThan(0);
      expect(f.modelVersion).toBe('4.2.0');
    }
    // Bereits gespielte Spiele bekommen keine Prognose
    expect(buildForecasts(model, data.current.filter(m => m.matchday === 3))).toHaveLength(0);
  });

  it('Markt-Blend: bewegt die Verteilung zum Markt, trennt Modell- und Finalmatrix, Simulation liest die Finalmatrix', async () => {
    const data = await loadDataset(fake, 2026);
    const md10 = data.current.filter(m => m.matchday === 10);
    const asOf = new Date(Math.min(...md10.map(m => Date.parse(m.kickoff))) - 60_000);
    const model = prepareSeasonModel(data, asOf, params);
    const open = md10.map(m => ({ ...m, finished: false, homeGoals: null, awayGoals: null }));
    const target = open[0];
    const market: MarketProbs = {
      probabilities: { H: 0.10, D: 0.15, A: 0.75 }, quotes: [], bookmakerCount: 3, averageOverround: 0.05,
      method: 'power', latestUpdate: asOf.toISOString(), oldestUpdate: asOf.toISOString(), eventId: 'e', commenceTime: target.kickoff,
    };
    const forecasts = buildForecasts(model, open, { markets: new Map([[target.id, market]]), primaryRule: 'conditional' });
    const f = forecasts.find(x => x.id === target.id)!;
    expect(f.path).toBe('blend');
    expect(f.probabilities.A).toBeGreaterThan(f.modelProbabilities.A);
    expect(f.probabilities.A).toBeLessThan(market.probabilities.A); // Blend, kein Sprung
    expect(f.scoreMatrix.cells[0][2]).not.toBeCloseTo(f.modelScoreMatrix.cells[0][2], 6);
    expect(f.decisions.primaryRule).toBe('conditional');

    // Simulation: gleiche Eingaben, einmal mit, einmal ohne Markt -> andere erwartete Punkte des Zielteams
    const seasonMatches = data.current.map(m => (m.matchday >= 10 ? { ...m, finished: false, homeGoals: null, awayGoals: null } : m));
    const withMarket = buildSeasonSimulation(model, forecasts, 300, seasonMatches);
    const withoutMarket = buildSeasonSimulation(model, buildForecasts(model, open), 300, seasonMatches);
    const away = (s: typeof withMarket) => s.teams.find(t => t.teamId === target.awayId)!.expectedPoints;
    expect(away(withMarket)).toBeGreaterThan(away(withoutMarket));
    // Offene Spiele spaeterer Spieltage ohne Prognose: reine Modellmatrix, gezaehlt
    expect(withMarket.modelOnlyMatches).toBe(seasonMatches.filter(m => !m.finished).length - 9);
  });

  it('bleibt deterministisch: gleicher Datensatz und Stichtag -> identische Prognosen', async () => {
    const data = await loadDataset(fake, 2026);
    const asOf = new Date('2026-09-01T00:00:00Z');
    const a = buildForecasts(prepareSeasonModel(data, asOf, params), data.current.filter(m => m.matchday === 5));
    const b = buildForecasts(prepareSeasonModel(data, asOf, params), data.current.filter(m => m.matchday === 5));
    expect(a.map(f => f.probabilities)).toEqual(b.map(f => f.probabilities));
  });
});
