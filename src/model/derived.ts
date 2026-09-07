// Abgeleitete Spielprofil-Werte -- AUSSCHLIESSLICH aus der finalen Matrix.
//
// Review-Fehler Nr. 1 (4.1.1): "Beide treffen" und "Ueber 2,5" wurden im
// Detailbildschirm aus den unabhaengigen Basis-Lambdas berechnet, also ohne
// Dixon-Coles, ohne Kalibrierung, ohne Markt-Blend. Die Zahlen stimmten dann
// nicht mit der angezeigten 1X2-Prognose ueberein (Beispiel: 51,99 % vs.
// 53,25 % bei Lambda 1,35/1,21). Hier gibt es nur einen Rechenweg: Zellsummen.

import type { ScoreMatrix } from '../types.ts';
import { expectedGoals } from './matrix.ts';

export interface DerivedStats {
  /** P(beide Teams treffen) */
  bothToScore: number;
  /** P(Gesamttore >= 3) */
  over25: number;
  /** P(Gesamttore <= 2) = 1 - over25 */
  under25: number;
  /** P(Heim haelt die Null) */
  homeCleanSheet: number;
  /** P(Auswaerts haelt die Null) */
  awayCleanSheet: number;
  /** Erwartete Tore der FINALEN Verteilung (nicht die Basis-Lambdas). */
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  expectedTotalGoals: number;
}

export function deriveStats(matrix: ScoreMatrix): DerivedStats {
  const { cells } = matrix;
  let btts = 0, over = 0, homeCs = 0, awayCs = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells[i].length; j++) {
      const p = cells[i][j];
      if (i >= 1 && j >= 1) btts += p;
      if (i + j >= 3) over += p;
      if (j === 0) homeCs += p;
      if (i === 0) awayCs += p;
    }
  }
  const xg = expectedGoals(cells);
  return {
    bothToScore: btts,
    over25: over,
    under25: 1 - over,
    homeCleanSheet: homeCs,
    awayCleanSheet: awayCs,
    expectedHomeGoals: xg.home,
    expectedAwayGoals: xg.away,
    expectedTotalGoals: xg.home + xg.away,
  };
}
