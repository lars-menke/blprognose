// Entscheidungsebene: Von der Verteilung zum konkreten Tipp.
//
// Drei Regeln, getrennt berechnet und getrennt versioniert. Welche als
// Hauptprognose angezeigt wird, ist eine PRODUKT-Entscheidung, keine
// Modellfrage -- sie haengt von der Zielfunktion ab:
//
//   conditional: erst wahrscheinlichster 1X2-Ausgang, dann Score darin.
//                Passt, wenn der richtige Favorit Vorrang hat. Tippt fast
//                nie Remis (Review: 3 von 918), weil Remis selten die
//                groesste der drei Ausgangsmassen ist.
//   global:      groesste Zelle der finalen Matrix. Passt bei reinem
//                Exakttreffer-Ziel. Trifft im Rueckest mehr Ergebnisse exakt.
//   tipGame:     maximiert erwartete Tippspiel-Punkte (4 exakt / 3 Differenz /
//                2 Ausgang). Nutzt die ganze Matrix und behandelt Remis ohne
//                Sonderregel. Empfohlene Hauptregel fuer eine Tipp-App.

import type { Outcome, OutcomeProbs, Score, ScoreMatrix } from '../types.ts';
import { outcomeOf } from './matrix.ts';

export type DecisionRule = 'conditional' | 'global' | 'tipGame';

export interface ScoredScore extends Score {
  /** Absolute Zellwahrscheinlichkeit 0..1 -- NICHT innerhalb des Ausgangs normiert. */
  probability: number;
}

/** Argmax mit fester Reihenfolge H > D > A bei exakter Gleichheit. */
export function argmaxOutcome(p: OutcomeProbs): Outcome {
  if (p.H >= p.D && p.H >= p.A) return 'H';
  if (p.D >= p.A) return 'D';
  return 'A';
}

/** Alle Zellen eines Ausgangs, absteigend nach Wahrscheinlichkeit. */
export function rankedScores(matrix: ScoreMatrix, outcome?: Outcome): ScoredScore[] {
  const list: ScoredScore[] = [];
  const { cells } = matrix;
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells[i].length; j++) {
      if (outcome && outcomeOf(i, j) !== outcome) continue;
      list.push({ home: i, away: j, probability: cells[i][j] });
    }
  }
  // Stabil: bei Gleichstand niedrigere Tore zuerst
  return list.sort((x, y) => y.probability - x.probability || (x.home + x.away) - (y.home + y.away) || x.home - y.home);
}

export interface ConditionalDecision {
  outcome: Outcome;
  score: ScoredScore;
  /** Naechste drei Scores ausschliesslich im gewaehlten Ausgang. */
  alternatives: ScoredScore[];
}

export function conditionalMode(matrix: ScoreMatrix): ConditionalDecision {
  const outcome = argmaxOutcome(matrix.probs);
  const ranked = rankedScores(matrix, outcome);
  return { outcome, score: ranked[0], alternatives: ranked.slice(1, 4) };
}

export function globalMode(matrix: ScoreMatrix): ScoredScore {
  return rankedScores(matrix)[0];
}

/** Punkte eines Tipps gegen ein Ergebnis nach der 4/3/2-Regel. */
export function tipPoints(tip: Score, result: Score): number {
  if (tip.home === result.home && tip.away === result.away) return 4;
  if (tip.home - tip.away === result.home - result.away) return 3;
  if (outcomeOf(tip.home, tip.away) === outcomeOf(result.home, result.away)) return 2;
  return 0;
}

export interface TipGameDecision {
  score: Score;
  expectedPoints: number;
  /** Alle Kandidaten mit Erwartungswert, absteigend. */
  candidates: Array<Score & { expectedPoints: number }>;
}

/**
 * Erwartungsnutzen-Tipp. Suchraum 0..maxGoals je Seite; die tatsaechlichen
 * Ergebnisse werden ueber die GANZE Matrix integriert, nicht nur den Suchraum.
 */
export function tipGameMode(matrix: ScoreMatrix, maxGoals: number): TipGameDecision {
  const { cells } = matrix;
  const candidates: Array<Score & { expectedPoints: number }> = [];
  for (let th = 0; th <= maxGoals; th++) {
    for (let ta = 0; ta <= maxGoals; ta++) {
      const tip = { home: th, away: ta };
      let ev = 0;
      for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
          const p = cells[i][j];
          if (p === 0) continue;
          ev += p * tipPoints(tip, { home: i, away: j });
        }
      }
      candidates.push({ ...tip, expectedPoints: ev });
    }
  }
  candidates.sort((x, y) => y.expectedPoints - x.expectedPoints || (x.home + x.away) - (y.home + y.away) || x.home - y.home);
  const best = candidates[0];
  return { score: { home: best.home, away: best.away }, expectedPoints: best.expectedPoints, candidates };
}

/** Rundet Prozentwerte per Groesster-Rest-Verfahren so, dass die Summe exakt 100 ist. */
export function roundToHundred(p: OutcomeProbs): { H: number; D: number; A: number } {
  const raw = [p.H * 100, p.D * 100, p.A * 100];
  const floor = raw.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - floor[i] })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) { if (rest <= 0) break; floor[i]++; rest--; }
  return { H: floor[0], D: floor[1], A: floor[2] };
}
