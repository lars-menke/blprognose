import { describe, it, expect } from 'vitest';
import { calcSingle, recalcMatches, MARKET_BLEND, type TeamStats } from './poisson';

const EVEN: TeamStats = { rank: 1, hGF: 1.3, hGA: 1.3, aGF: 1.1, aGA: 1.4 };
const EVEN_AWAY: TeamStats = { rank: 2, hGF: 1.3, hGA: 1.3, aGF: 1.1, aGA: 1.4 };

const FAV_HOME: TeamStats = { rank: 1, hGF: 2.6, hGA: 0.6, aGF: 2.2, aGA: 0.9 };
const DOG_AWAY: TeamStats = { rank: 18, hGF: 0.9, hGA: 1.8, aGF: 0.7, aGA: 2.0 };

describe('calcSingle — Draw-Boost', () => {
  it('hebt pD an, wenn Teams eng beieinander liegen', () => {
    const r = calcSingle(EVEN, EVEN_AWAY, null, null, null, null);
    // Ohne Boost waere Poisson bei diesen Lambdas strukturell zu niedrig fuer pD.
    expect(r.pD).toBeGreaterThan(0.26);
  });

  it('boostet kaum bei klarem Favoriten (lambdaDiff gross)', () => {
    const r = calcSingle(FAV_HOME, DOG_AWAY, null, null, null, null);
    expect(r.lambdaDiff).toBeGreaterThan(0.4);
    expect(r.wo).toBe('H');
  });
});

describe('calcSingle — Marktkorrektur (alpha-Blend statt vollem Sprung)', () => {
  it('MARKET_BLEND ist 0.4 (Startwert aus der WM-Migration)', () => {
    expect(MARKET_BLEND).toBe(0.4);
  });

  it('naehert sich dem Markt an, springt aber nicht voll auf ihn', () => {
    // Markt sieht den Aussenseiter deutlich staerker als das Modell.
    const noMarket = calcSingle(FAV_HOME, DOG_AWAY, null, null, null, null);
    const withMarket = calcSingle(FAV_HOME, DOG_AWAY, { h: 30, d: 30, a: 40 }, null, null, null);
    expect(withMarket.marketApplied).toBe(true);
    // Markteinfluss senkt pH gegenueber der reinen Modellsicht ...
    expect(withMarket.pH).toBeLessThan(noMarket.pH);
    // ... aber das Modell bleibt noch klar favorisiert, kein voller Sprung auf den Markt.
    expect(withMarket.pH).toBeGreaterThan(0.4);
  });

  it('pH_model/pD_model/pA_model bleiben von der Marktkorrektur unberuehrt', () => {
    const noMarket = calcSingle(FAV_HOME, DOG_AWAY, null, null, null, null);
    const withMarket = calcSingle(FAV_HOME, DOG_AWAY, { h: 30, d: 30, a: 40 }, null, null, null);
    expect(withMarket.pH_model).toBeCloseTo(noMarket.pH_model, 10);
    expect(withMarket.pD_model).toBeCloseTo(noMarket.pD_model, 10);
    expect(withMarket.pA_model).toBeCloseTo(noMarket.pA_model, 10);
  });
});

describe('calcSingle — Dissens-Signal (Modell und Markt uneins -> Remis-Boost)', () => {
  it('erkennt Dissens, wenn Modell und Markt unterschiedliche Seiten favorisieren', () => {
    // Modell favorisiert klar das Heimteam, Markt favorisiert den Gast.
    const dissens = calcSingle(FAV_HOME, DOG_AWAY, { h: 20, d: 25, a: 55 }, null, null, null);
    expect(dissens.dissens).toBe(true);
  });

  it('kein Dissens, wenn beide dieselbe Seite favorisieren', () => {
    const einig = calcSingle(FAV_HOME, DOG_AWAY, { h: 55, d: 25, a: 20 }, null, null, null);
    expect(einig.dissens).toBe(false);
  });

  it('Dissens hebt pD gegenueber dem reinen Marktfall ohne Dissens an', () => {
    const dissens = calcSingle(FAV_HOME, DOG_AWAY, { h: 20, d: 25, a: 55 }, null, null, null);
    const einig = calcSingle(FAV_HOME, DOG_AWAY, { h: 55, d: 20, a: 25 }, null, null, null);
    expect(dissens.dissens).toBe(true);
    expect(einig.dissens).toBe(false);
    // Bei gleicher lambdaDiff-Groessenordnung sollte der Dissens-Fall einen
    // zusaetzlichen strukturellen Boost auf pD erhalten.
    expect(dissens.pD).toBeGreaterThan(0.05);
  });
});

describe('recalcMatches — Monokultur-Schutz bleibt erhalten', () => {
  it('verteilt zu haeufig vergebene Tipps auf Alternativen um', () => {
    const stData: Record<string, TeamStats> = { AAA: FAV_HOME, BBB: FAV_HOME, CCC: FAV_HOME, DDD: DOG_AWAY };
    const matches = [
      { id: 'm1', home: 'AAA', away: 'DDD', p: null, hForm: null, aForm: null },
      { id: 'm2', home: 'BBB', away: 'DDD', p: null, hForm: null, aForm: null },
      { id: 'm3', home: 'CCC', away: 'DDD', p: null, hForm: null, aForm: null },
    ];
    const results = recalcMatches(matches, stData, {});
    const tipps = Object.values(results).map(r => r.tipp);
    const counts = new Map<string, number>();
    tipps.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1));
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
  });
});
