import { describe, it, expect } from 'vitest';
import { estimateTranslation, promotedPriors, promotedTeams, TRANSLATION_BOUNDS } from '../src/model/promoted.ts';
import { withParams } from '../src/model/params.ts';
import { makeLeague, simulateSeasonRecords } from './helpers/synthetic.ts';
import type { MatchRecord } from '../src/types.ts';

const params = withParams();

describe('Aufsteiger-Erkennung', () => {
  it('sind aktuelle Vereine, die im vorherigen BL1-Bestand fehlen', () => {
    const prev = makeLeague(1, 4), cur = makeLeague(2, 4);
    const prevMatches = simulateSeasonRecords(prev, 2025, 1);
    const curMatches = simulateSeasonRecords(cur, 2026, 2, 'bl1', [100, 101, 102, 555]);
    expect(promotedTeams(curMatches, prevMatches)).toEqual([555]);
  });
});

describe('Uebersetzungsfaktoren', () => {
  it('nutzt den Fallback unter vier Beobachtungen', () => {
    const t = estimateTranslation([], params);
    expect(t.source).toBe('fallback');
    expect(t.attackFactor).toBe(0.85);
    expect(t.defenseFactor).toBe(1.15);
  });

  it('schaetzt aus frueheren Aufsteigern und haelt die Grenzen ein', () => {
    // Konstruktion: 4 Aufsteiger, die in BL2 relativ stark, in BL1 relativ schwach waren.
    const pairs: Array<{ season: number; bl1: MatchRecord[]; bl2: MatchRecord[] }> = [];
    for (const season of [2024, 2025]) {
      // 12 Teams je Liga -> 22 Spiele je Team, ueber der 20-Spiele-Mindestgrenze
      const bl1League = makeLeague(season, 12, 0.05);
      const bl2League = makeLeague(season + 50, 12, 0.05);
      const promoted = [900 + season, 901 + season]; // zwei Aufsteiger je Saison
      const bl1Ids = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, ...promoted];
      const bl2Ids = [200, 201, 202, 203, 204, 205, 206, 207, 208, 209, ...promoted];
      // Aufsteiger in BL1 schwach, in BL2 stark
      for (const id of promoted) {
        bl1League.truth.attack.set(id, -0.4); bl1League.truth.defense.set(id, 0.3);
        bl2League.truth.attack.set(id, 0.3); bl2League.truth.defense.set(id, -0.2);
      }
      pairs.push({
        season,
        bl1: simulateSeasonRecords(bl1League, season, season * 3, 'bl1', bl1Ids),
        bl2: simulateSeasonRecords(bl2League, season - 1, season * 7, 'bl2', bl2Ids),
      });
    }
    const t = estimateTranslation(pairs, params);
    expect(t.source).toBe('estimated');
    expect(t.observations).toBe(4);
    expect(t.attackFactor).toBeGreaterThanOrEqual(TRANSLATION_BOUNDS.attack[0]);
    expect(t.attackFactor).toBeLessThanOrEqual(TRANSLATION_BOUNDS.attack[1]);
    expect(t.defenseFactor).toBeGreaterThanOrEqual(TRANSLATION_BOUNDS.defense[0]);
    expect(t.defenseFactor).toBeLessThanOrEqual(TRANSLATION_BOUNDS.defense[1]);
    expect(t.attackFactor).toBeLessThan(1);
    expect(t.defenseFactor).toBeGreaterThan(1);
  });

  it('ignoriert Vereine mit weniger als 20 Spielen je Saison', () => {
    const bl1 = simulateSeasonRecords(makeLeague(3, 4), 2025, 1, 'bl1', [1, 2, 3, 4]).slice(0, 6); // zu wenige Spiele
    const bl2 = simulateSeasonRecords(makeLeague(4, 4), 2024, 2, 'bl2', [1, 5, 6, 7]);
    const t = estimateTranslation([{ season: 2025, bl1, bl2 }], params);
    expect(t.observations).toBe(0);
    expect(t.source).toBe('fallback');
  });
});

describe('Aufsteiger-Priors', () => {
  it('kombiniert 0.60 x BL2-Rating mit ln(Faktor) und nutzt sonst den Log-Fallback', () => {
    const bl2 = { mu: 0.3, home: 0.2, rho: -0.1, attack: new Map([[555, 0.5]]), defense: new Map([[555, -0.2]]) };
    const t = { attackFactor: 0.85, defenseFactor: 1.15, observations: 4, source: 'estimated' as const, samples: [] };
    const p = promotedPriors([555, 777], bl2, t, params);
    expect(p.attack.get(555)).toBeCloseTo(0.6 * 0.5 + Math.log(0.85), 12);
    expect(p.defense.get(555)).toBeCloseTo(0.6 * -0.2 + Math.log(1.15), 12);
    expect(p.source.get(555)).toBe('bl2-rating');
    expect(p.attack.get(777)).toBe(-0.27);
    expect(p.defense.get(777)).toBe(0.17);
    expect(p.source.get(777)).toBe('log-fallback');
  });
});
