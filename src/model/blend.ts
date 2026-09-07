// Kalibrierung und Markt-Blend.
//
//   p_model  = norm(p_raw ^ (1/T_model))
//   p_market = norm(p_fair ^ (1/T_market))
//   p_final  = norm(p_model ^ (1-alpha) * p_market ^ alpha)
//
// Der Blend ist ein logarithmischer Pool (geometrisches Mittel), KEIN
// arithmetischer Durchschnitt und KEIN Lambda-Blend. Ohne Markt gilt
// p_final = p_model.
//
// Bekannte Grenze (Review 8.3): Die Temperaturen werden vor dem Blend
// angewendet; eine separat geschaetzte Kalibrierung fuer den bereits
// kombinierten Pfad gibt es nicht. Das ist eine offene Validierungsaufgabe,
// keine Implementierungsluecke -- sie braucht historische Quoten.

import type { Outcome, OutcomeProbs, ScoreMatrix } from '../types.ts';
import { outcomeOf } from './matrix.ts';

const OUTCOMES: readonly Outcome[] = ['H', 'D', 'A'];

export function normalizeProbs(p: OutcomeProbs): OutcomeProbs {
  const s = p.H + p.D + p.A;
  if (!(s > 0)) throw new Error('Wahrscheinlichkeiten ohne Masse');
  return { H: p.H / s, D: p.D / s, A: p.A / s };
}

/** Temperatur-Skalierung: T > 1 flacht ab, T < 1 schaerft. T = 1 ist die Identitaet. */
export function temper(p: OutcomeProbs, temperature: number): OutcomeProbs {
  if (!(temperature > 0)) throw new Error('Temperatur muss > 0 sein');
  if (temperature === 1) return normalizeProbs(p);
  const e = 1 / temperature;
  return normalizeProbs({ H: Math.pow(p.H, e), D: Math.pow(p.D, e), A: Math.pow(p.A, e) });
}

/** Logarithmischer Pool mit Marktgewicht alpha (0 = nur Modell, 1 = nur Markt). */
export function logPool(model: OutcomeProbs, market: OutcomeProbs, alpha: number): OutcomeProbs {
  if (alpha < 0 || alpha > 1) throw new Error('alpha muss in [0,1] liegen');
  const a = alpha, b = 1 - alpha;
  return normalizeProbs({
    H: Math.pow(model.H, b) * Math.pow(market.H, a),
    D: Math.pow(model.D, b) * Math.pow(market.D, a),
    A: Math.pow(model.A, b) * Math.pow(market.A, a),
  });
}

/**
 * Verteilt Ziel-Ausgangsmassen auf die Rohmatrix zurueck:
 *   P_final(i,j) = P_raw(i,j) * p_target[outcome(i,j)] / p_raw[outcome(i,j)]
 * Die drei Bloecke summieren danach exakt zu p_target; innerhalb eines Blocks
 * bleibt die Rangfolge der Scores erhalten. Reine 1X2-Information kann nicht
 * zwischen 2:0 und 3:1 unterscheiden -- das bleibt Sache der Rohmatrix.
 */
export function redistribute(raw: ScoreMatrix, target: OutcomeProbs): ScoreMatrix {
  const t = normalizeProbs(target);
  const factor: Record<Outcome, number> = {
    H: raw.probs.H > 0 ? t.H / raw.probs.H : 0,
    D: raw.probs.D > 0 ? t.D / raw.probs.D : 0,
    A: raw.probs.A > 0 ? t.A / raw.probs.A : 0,
  };
  const cells = raw.cells.map((row, i) => row.map((p, j) => p * factor[outcomeOf(i, j)]));
  // Numerische Restnormierung (Rundungsfehler), aendert die Blockverhaeltnisse nicht messbar.
  let s = 0;
  for (const row of cells) for (const p of row) s += p;
  const norm = cells.map(row => row.map(p => p / s));
  return { cells: norm, probs: { H: t.H, D: t.D, A: t.A } };
}

export function probsToArray(p: OutcomeProbs): [number, number, number] {
  return [p.H, p.D, p.A];
}

export { OUTCOMES };
