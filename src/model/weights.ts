// Zeitgewichtung: Form ist AUSSCHLIESSLICH Aktualitaet. Es gibt keinen
// zweiten Form-Blend ueber die letzten N Spiele -- der wuerde juengere
// Ergebnisse doppelt zaehlen (einmal im Fit, einmal im Blend). Genau diesen
// Fehler hatte der alte BLforecast-Kern.

const LN2 = Math.log(2);

/**
 * Gewicht eines Spiels, das `ageDays` Tage vor dem Stichtag stattfand.
 * w(0) = 1, w(halfLife) = 0.5, w(2*halfLife) = 0.25.
 * Spiele NACH dem Stichtag (negatives Alter) sind kein Trainingsmaterial
 * und erhalten Gewicht 0 -- so kann ein Backtest nie in die Zukunft sehen.
 */
export function timeWeight(ageDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  return Math.exp(-LN2 * ageDays / halfLifeDays);
}

const MS_PER_DAY = 86_400_000;

export function ageInDays(kickoffIso: string, asOf: Date): number {
  return (asOf.getTime() - Date.parse(kickoffIso)) / MS_PER_DAY;
}
