// Auswertung gespeicherter Prognosen gegen Endergebnisse.
//
// Konventionen (fuer externe Vergleiche wichtig):
//   Log-Loss  = -ln p(tatsaechlicher Ausgang)
//   Brier     = Summe_k (p_k - y_k)^2 ueber H, D, A     (0 .. 2)
//   RPS       = Summe der zwei kumulierten quadratischen Fehler in der
//               Reihenfolge H, D, A -- OHNE die haeufig genutzte Teilung
//               durch 2. Wer mit Literaturwerten vergleicht, muss halbieren.
//
// Review-Fehler (4.1.1, Abschnitt 12.2): Modell und Blend wurden ueber alle
// Prognosen gezaehlt, der Markt nur ueber Spiele mit Marktwerten -- ein
// unfairer Vergleich. compareOnSameSubset rechnet alle drei ausschliesslich
// auf der Schnittmenge.

import type { MatchRecord, Outcome, OutcomeProbs, Score } from '../types.ts';
import { tipPoints } from '../model/decision.ts';
import { outcomeOf } from '../model/matrix.ts';

export function actualOutcome(homeGoals: number, awayGoals: number): Outcome {
  return outcomeOf(homeGoals, awayGoals);
}

export function logLoss(p: OutcomeProbs, actual: Outcome): number {
  return -Math.log(Math.max(p[actual], 1e-12));
}

export function brier(p: OutcomeProbs, actual: Outcome): number {
  const y = { H: actual === 'H' ? 1 : 0, D: actual === 'D' ? 1 : 0, A: actual === 'A' ? 1 : 0 };
  return (p.H - y.H) ** 2 + (p.D - y.D) ** 2 + (p.A - y.A) ** 2;
}

/** Ranked Probability Score, ungeteilt (siehe Kopfkommentar). */
export function rps(p: OutcomeProbs, actual: Outcome): number {
  const cp1 = p.H, cp2 = p.H + p.D;
  const cy1 = actual === 'H' ? 1 : 0, cy2 = actual === 'A' ? 0 : 1;
  return (cp1 - cy1) ** 2 + (cp2 - cy2) ** 2;
}

export interface MetricSummary {
  n: number;
  logLoss: number;
  brier: number;
  rps: number;
  /** Anteil, bei dem der Argmax den Ausgang traf. */
  outcomeAccuracy: number;
}

export function summarize(items: Array<{ p: OutcomeProbs; actual: Outcome }>): MetricSummary {
  const n = items.length;
  if (n === 0) return { n: 0, logLoss: NaN, brier: NaN, rps: NaN, outcomeAccuracy: NaN };
  let ll = 0, br = 0, r = 0, hit = 0;
  for (const { p, actual } of items) {
    ll += logLoss(p, actual); br += brier(p, actual); r += rps(p, actual);
    const arg: Outcome = p.H >= p.D && p.H >= p.A ? 'H' : p.D >= p.A ? 'D' : 'A';
    if (arg === actual) hit++;
  }
  return { n, logLoss: ll / n, brier: br / n, rps: r / n, outcomeAccuracy: hit / n };
}

export interface EvaluatedForecast {
  matchId: number;
  season: number;
  matchday: number;
  modelVersion: string;
  model: OutcomeProbs;
  market: OutcomeProbs | null;
  blend: OutcomeProbs;
  score: Score;
  tipScore: Score;
  actual: Score;
}

export interface TipSummary {
  n: number;
  exact: number;
  averagePoints: number;
}

export function summarizeTips(items: Array<{ tip: Score; actual: Score }>): TipSummary {
  const n = items.length;
  if (n === 0) return { n: 0, exact: NaN, averagePoints: NaN };
  let exact = 0, pts = 0;
  for (const { tip, actual } of items) {
    if (tip.home === actual.home && tip.away === actual.away) exact++;
    pts += tipPoints(tip, actual);
  }
  return { n, exact: exact / n, averagePoints: pts / n };
}

export interface SameSubsetComparison {
  /** Nur Spiele MIT Marktwerten -- alle drei Varianten auf identischer Menge. */
  withMarket: { n: number; model: MetricSummary; market: MetricSummary; blend: MetricSummary };
  /** Alle Spiele -- nur Modell und Blend (Markt existiert dort nicht ueberall). */
  all: { n: number; model: MetricSummary; blend: MetricSummary };
}

export function compareOnSameSubset(items: readonly EvaluatedForecast[]): SameSubsetComparison {
  const act = (f: EvaluatedForecast) => actualOutcome(f.actual.home, f.actual.away);
  const withMarket = items.filter(f => f.market !== null);
  return {
    withMarket: {
      n: withMarket.length,
      model: summarize(withMarket.map(f => ({ p: f.model, actual: act(f) }))),
      market: summarize(withMarket.map(f => ({ p: f.market!, actual: act(f) }))),
      blend: summarize(withMarket.map(f => ({ p: f.blend, actual: act(f) }))),
    },
    all: {
      n: items.length,
      model: summarize(items.map(f => ({ p: f.model, actual: act(f) }))),
      blend: summarize(items.map(f => ({ p: f.blend, actual: act(f) }))),
    },
  };
}

/** Ueberraschung: der tatsaechliche Ausgang hatte in der finalen Verteilung weniger als 25 %. */
export function isSurprise(f: EvaluatedForecast, threshold = 0.25): boolean {
  return f.blend[actualOutcome(f.actual.home, f.actual.away)] < threshold;
}

/**
 * Aktueller Spieltag EINER Saison -- Review-Fehler Nr. 3 (4.1.1): das Maximum
 * ueber eine saisonuebergreifende Historie meldete Spieltag 34 der Vorsaison
 * als "aktuell", obwohl die neue Saison bei Spieltag 2 stand. Hier wird
 * ausschliesslich innerhalb der uebergebenen Saison gesucht:
 * der niedrigste Spieltag mit einem noch offenen Spiel; sind alle gespielt,
 * der hoechste vorhandene.
 */
export function currentMatchday(matches: readonly MatchRecord[], season: number): number {
  const inSeason = matches.filter(m => m.season === season);
  if (!inSeason.length) return 1;
  const open = inSeason.filter(m => !m.finished).map(m => m.matchday);
  if (open.length) return Math.min(...open);
  return Math.max(...inSeason.map(m => m.matchday));
}

/** Letzter Spieltag einer Saison, der mindestens ein ausgewertetes Spiel enthaelt. */
export function lastEvaluatedMatchday(evaluated: readonly EvaluatedForecast[], season: number): number | null {
  const days = evaluated.filter(f => f.season === season).map(f => f.matchday);
  return days.length ? Math.max(...days) : null;
}
