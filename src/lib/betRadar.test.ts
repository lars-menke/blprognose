import { describe, it, expect } from 'vitest';
import { computeValueBets, evOf, kellyStake, MIN_EV } from './betRadar';
import type { MatchdayEntry } from './useMatchday';
import type { RawOdds } from './fetchOdds';
import type { MatchResult } from './poisson';

function mkResult(pH: number, pD: number, pA: number): MatchResult {
  return {
    pH, pD, pA,
    pH_model: pH, pD_model: pD, pA_model: pA,
    naturalTipp: '1:0', wo: pH >= pA ? 'H' : 'A', srt: [],
    lH: 1.2, lA: 1.0, lH_model: 1.2, lA_model: 1.0, market: null,
    fp: Math.max(pH, pD, pA), drawBlocked: false,
    goalRuleApplied: false, favScoreRuleApplied: false,
    lambdaDiff: 0.2, effectiveDrawThreshold: 0.2,
    marketApplied: false, calibrated: false, dissens: false,
    tipp: '1:0', adjusted: false,
  };
}

function mkMatch(id: string, home: string, away: string, result: MatchResult, opts: Partial<MatchdayEntry> = {}): MatchdayEntry {
  const kickoffISO = new Date(Date.now() + 3600_000).toISOString(); // in 1h
  return {
    id, home, away,
    kickoff: 'Sa 15:30',
    kickoffISO,
    result, actual: null,
    ...opts,
  };
}

describe('evOf / kellyStake', () => {
  it('EV = p*odds - 1', () => {
    expect(evOf(0.5, 2.4)).toBeCloseTo(0.2, 10);
    expect(evOf(0.4, 2.5)).toBeCloseTo(0, 10);
  });

  it('Kelly ist 0 ohne Edge und gedeckelt bei 10%', () => {
    expect(kellyStake(0.4, 2.5)).toBe(0);            // EV = 0
    expect(kellyStake(0.9, 5.0)).toBe(0.1);          // riesiger Edge -> Deckel
    const f = kellyStake(0.5, 2.4);                  // EV +20%, quarter-Kelly
    expect(f).toBeCloseTo(0.25 * 0.2 / 1.4, 10);
  });
});

describe('computeValueBets', () => {
  const odds: Record<string, RawOdds> = {
    'FCB-BVB': { h: 2.6, d: 3.4, a: 3.0 },
  };

  it('findet Value nur oberhalb der Schwelle', () => {
    // pH=0.5 @2.6 -> EV +30% (Value); pD=0.2 @3.4 -> -32%; pA=0.3 @3.0 -> -10%
    const m = mkMatch('m1', 'FCB', 'BVB', mkResult(0.5, 0.2, 0.3));
    const bets = computeValueBets([m], odds);
    expect(bets).toHaveLength(1);
    expect(bets[0].side).toBe('H');
    expect(bets[0].ev).toBeCloseTo(0.3, 10);
    expect(bets[0].odds).toBe(2.6);
  });

  it('ueberspringt gestartete und beendete Spiele', () => {
    const started = mkMatch('m1', 'FCB', 'BVB', mkResult(0.5, 0.2, 0.3), {
      kickoffISO: new Date(Date.now() - 1000).toISOString(),
    });
    const doneM = mkMatch('m3', 'FCB', 'BVB', mkResult(0.5, 0.2, 0.3), {
      actual: { g1: 2, g2: 1 },
    });
    expect(computeValueBets([started, doneM], odds)).toHaveLength(0);
  });

  it('nutzt gedrehte Quoten, wenn nur AWAY-HOME vorliegt', () => {
    const revOdds: Record<string, RawOdds> = { 'BVB-FCB': { h: 3.0, d: 3.4, a: 2.6 } };
    const m = mkMatch('m1', 'FCB', 'BVB', mkResult(0.5, 0.2, 0.3));
    const bets = computeValueBets([m], revOdds);
    expect(bets).toHaveLength(1);
    expect(bets[0].side).toBe('H');
    expect(bets[0].odds).toBe(2.6); // a-Quote der gedrehten Notierung
  });

  it('bietet Remis-Wetten an (kein K.o.-Ausschluss wie bei der WM)', () => {
    const m = mkMatch('m1', 'FCB', 'BVB', mkResult(0.25, 0.5, 0.25));
    const bets = computeValueBets([m], odds);
    expect(bets.some(b => b.side === 'D')).toBe(true);
  });

  it('sortiert nach EV absteigend und respektiert MIN_EV-Default', () => {
    const m1 = mkMatch('m1', 'FCB', 'BVB', mkResult(0.45, 0.25, 0.30)); // H: EV +17%
    const m2 = mkMatch('m2', 'FCB', 'BVB', mkResult(0.60, 0.20, 0.20)); // H: EV +56%
    const bets = computeValueBets([m1, m2], odds);
    expect(bets[0].ev).toBeGreaterThan(bets[1].ev);
    expect(bets.every(b => b.ev > MIN_EV)).toBe(true);
  });
});
