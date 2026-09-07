// Tor- und Ergebnismatrix: Poisson je Seite, Dixon-Coles-Korrektur auf den
// vier niedrigen Ergebnissen, Normierung. Es gibt KEINEN zusaetzlichen
// Remis-Boost und keine Vielfalts-Regel -- Remis entsteht ausschliesslich aus
// der Verteilung selbst.

import type { Outcome, OutcomeProbs, ScoreMatrix } from '../types.ts';

/** Mindestgroesse der Matrix je Seite (Tore 0..MIN_GOALS). */
export const MIN_GOALS = 10;
/** Harte Obergrenze je Seite. */
export const MAX_GOALS = 30;
/** Die Matrix wird erweitert, bis die Poisson-Restmasse je Seite darunter liegt. */
export const TAIL_MASS = 5e-9;

/** Dixon-Coles-Faktor tau(i,j). Nur (0,0), (0,1), (1,0), (1,1) weichen von 1 ab. */
export function dcTau(i: number, j: number, lambdaH: number, lambdaA: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lambdaH * lambdaA * rho;
  if (i === 0 && j === 1) return 1 + lambdaH * rho;
  if (i === 1 && j === 0) return 1 + lambdaA * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/** Poisson-PMF fuer k = 0..n als Array, iterativ (kein Fakultaets-Overflow). */
export function poissonPmf(lambda: number, n: number): number[] {
  const out = new Array<number>(n + 1);
  let p = Math.exp(-lambda);
  out[0] = p;
  for (let k = 1; k <= n; k++) {
    p *= lambda / k;
    out[k] = p;
  }
  return out;
}

/** Kleinstes n >= MIN_GOALS, sodass P(X > n) <= TAIL_MASS, gedeckelt bei MAX_GOALS. */
export function matrixSize(lambda: number): number {
  let cum = 0;
  let p = Math.exp(-lambda);
  for (let k = 0; k <= MAX_GOALS; k++) {
    if (k > 0) p *= lambda / k;
    cum += p;
    if (k >= MIN_GOALS && 1 - cum <= TAIL_MASS) return k;
  }
  return MAX_GOALS;
}

export function outcomeOf(i: number, j: number): Outcome {
  return i > j ? 'H' : i === j ? 'D' : 'A';
}

/** Summiert eine (normierte) Matrix zu 1X2-Wahrscheinlichkeiten. */
export function outcomeProbs(cells: number[][]): OutcomeProbs {
  let H = 0, D = 0, A = 0;
  for (let i = 0; i < cells.length; i++) {
    const row = cells[i];
    for (let j = 0; j < row.length; j++) {
      const p = row[j];
      if (i > j) H += p; else if (i === j) D += p; else A += p;
    }
  }
  return { H, D, A };
}

export function normalizeCells(cells: number[][]): number[][] {
  let total = 0;
  for (const row of cells) for (const p of row) total += p;
  if (!(total > 0)) throw new Error('Matrix ohne Masse -- kann nicht normiert werden');
  return cells.map(row => row.map(p => p / total));
}

/**
 * Rohe Modellmatrix aus zwei Torerwartungen. Negative Zellwerte (nur bei
 * extremen Lambdas mit Rho moeglich) werden auf 0 gekappt, danach wird die
 * gesamte Matrix normiert. Innerhalb der produktiven Lambda-Grenzen
 * (0.30..4.50) und Rho -0.10 sind alle vier Korrekturfaktoren positiv.
 */
export function buildMatrix(lambdaH: number, lambdaA: number, rho: number): ScoreMatrix {
  const n = Math.max(matrixSize(lambdaH), matrixSize(lambdaA));
  const ph = poissonPmf(lambdaH, n);
  const pa = poissonPmf(lambdaA, n);
  const cells: number[][] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const row = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) {
      const v = ph[i] * pa[j] * dcTau(i, j, lambdaH, lambdaA, rho);
      row[j] = v > 0 ? v : 0;
    }
    cells[i] = row;
  }
  const normalized = normalizeCells(cells);
  return { cells: normalized, probs: outcomeProbs(normalized) };
}

/** Erwartete Tore aus einer normierten Matrix (Zeilen-/Spaltenmomente). */
export function expectedGoals(cells: number[][]): { home: number; away: number } {
  let home = 0, away = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells[i].length; j++) {
      home += i * cells[i][j];
      away += j * cells[i][j];
    }
  }
  return { home, away };
}
