/**
 * Platt-Skalierung: Kalibriert Modell-Wahrscheinlichkeiten anhand
 * vergangener Ergebnisse. Lernt fuer jede der drei Ausgaenge (H/D/A)
 * eine Sigmoid-Funktion f(p_model) -> p_real.
 */

export type CalibParams = {
  aH: number; bH: number;
  aD: number; bD: number;
  aA: number; bA: number;
  n: number;
};

export type CalibSample = {
  pH: number; pD: number; pA: number;
  actual: 'H' | 'D' | 'A';
};

function clamp(p: number): number { return Math.max(0.001, Math.min(0.999, p)); }
function logit(p: number): number { const c = clamp(p); return Math.log(c / (1 - c)); }
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

/**
 * Gradient-Descent auf Log-Loss: sigmoid(a*logit(p) + b) vs. actual.
 * a < 1 -> shrink (handle over-confidence); b -> bias shift.
 */
function fitPlatt(
  samples: Array<{ p: number; hit: boolean }>,
  maxIter = 250,
  lr = 0.04,
): { a: number; b: number } {
  let a = 1, b = 0;
  const n = samples.length;
  for (let i = 0; i < maxIter; i++) {
    let da = 0, db = 0;
    for (const s of samples) {
      const x = logit(s.p);
      const err = sigmoid(a * x + b) - (s.hit ? 1 : 0);
      da += err * x;
      db += err;
    }
    a -= (lr / n) * da;
    b -= (lr / n) * db;
  }
  return { a, b };
}

/**
 * Erstellt Kalibrierungsparameter aus vergangenen Match-Ergebnissen.
 * Benoetigt mindestens minSamples Spiele (= Spieltage * 9).
 */
export function buildCalib(
  samples: CalibSample[],
  minSamples = 45,
): CalibParams | null {
  if (samples.length < minSamples) return null;
  const { a: aH, b: bH } = fitPlatt(samples.map(s => ({ p: s.pH, hit: s.actual === 'H' })));
  const { a: aD, b: bD } = fitPlatt(samples.map(s => ({ p: s.pD, hit: s.actual === 'D' })));
  const { a: aA, b: bA } = fitPlatt(samples.map(s => ({ p: s.pA, hit: s.actual === 'A' })));
  return { aH, bH, aD, bD, aA, bA, n: samples.length };
}

/**
 * Wendet Kalibrierung auf ein 1X2-Tripel an und normalisiert auf Summe 1.
 */
export function applyCalib(
  pH: number, pD: number, pA: number,
  params: CalibParams,
): { pH: number; pD: number; pA: number } {
  const cal = (p: number, a: number, b: number) => sigmoid(a * logit(p) + b);
  const cH = cal(pH, params.aH, params.bH);
  const cD = cal(pD, params.aD, params.bD);
  const cA = cal(pA, params.aA, params.bA);
  const tot = cH + cD + cA;
  return { pH: cH / tot, pD: cD / tot, pA: cA / tot };
}

/**
 * Regression zur Mitte als Fallback wenn noch zu wenig Kalibrierdaten.
 * Shrink-Faktor 0.88: 88% Modell, 12% Prior (1/3 je Ausgang).
 */
const SHRINK = 0.88;
export function shrinkToMean(
  pH: number, pD: number, pA: number,
): { pH: number; pD: number; pA: number } {
  const s = (p: number) => 1 / 3 + (p - 1 / 3) * SHRINK;
  return { pH: s(pH), pD: s(pD), pA: s(pA) };
}
