// ─── POISSON-MODELL MIT DIXON-COLES-KORREKTUR ────────────────────────────────
import type { CalibParams } from './calibration';
import { applyCalib, shrinkToMean } from './calibration';

export const DC_RHO = -0.13;
export const FORM_WEIGHT = 0.40;
export const DRAW_THRESHOLD = 0.20;
export const DRAW_THRESHOLD_TIGHT = 0.17;
export const FAV_MIN_GOALS_LAMBDA = 2.0;
export const MONO_MAX = 2;
export const LG_DEF_H = 1.21; // Ø hGA über alle BL1-Teams (Fallback)
export const LG_DEF_A = 1.58; // Ø aGA über alle BL1-Teams (Fallback)
export const DRAW_BOOST_MAX = 0.15;   // max draw boost bei lambdaDiff=0
export const DRAW_BOOST_RANGE = 0.40; // boost wirkt wenn lambdaDiff < 0.4

// Markt-Gewichtung beim Lambda-Blend (0 = nur Modell, 1 = nur Markt-Lambda aus
// der Newton-Raphson-Korrektur). Startwert aus der WM-Migration: Log-Loss-Tal
// lag ueber das gesamte Turnier flach zwischen 0.2 und 0.5, alpha=0.4 ist die
// Mitte (siehe docs/calibration-analysis.md). Liga-Maerkte sind effizienter
// als WM-Maerkte -- nach den ersten 5 BL-Spieltagen mit echtem Lernprotokoll
// re-validieren, das Optimum kann niedriger liegen.
export const MARKET_BLEND = 0.4;

// Zusaetzlicher Remis-Boost, wenn Modell und Markt unterschiedliche Seiten
// favorisieren (Vorzeichen-Dissens). WM-Befund: 9 Dissens-Faelle im gesamten
// Turnier, 44% Remis-Quote vs. 14% bei Einigkeit -- deutlich mehr als Zufall
// (docs/calibration-analysis.md). Staerke ist ein unkalibrierter Startwert,
// noch nicht an BL-Daten geprueft -- fruehzeitig mit dem Lernprotokoll pruefen.
export const DISSENS_DRAW_BOOST_MAX = 0.08;

export type Outcome = 'H' | 'D' | 'A';

export type TeamStats = {
  rank: number;
  hGF: number; hGA: number;
  aGF: number; aGA: number;
};

export type FormData = { gf: number; ga: number } | null;

export type MarketProbs = { h: number; d: number; a: number };

export type CalcResult = {
  pH: number; pD: number; pA: number;
  pH_model: number; pD_model: number; pA_model: number; // reine Modellsicht: Draw-Boost ja, Markt/Kalibrierung nein
  naturalTipp: string | null;
  wo: Outcome;
  srt: Array<[string, number]>;
  lH: number; lA: number;
  lH_model: number; lA_model: number; // Lambda vor Marktkorrektur
  market: MarketProbs | null; // rohe Marktwahrscheinlichkeiten (Prozent), oder null
  fp: number;
  drawBlocked: boolean;
  goalRuleApplied: boolean;
  favScoreRuleApplied: boolean;
  lambdaDiff: number;
  effectiveDrawThreshold: number;
  marketApplied: boolean;
  calibrated: boolean;
  dissens: boolean; // Modell und Markt favorisieren unterschiedliche Seiten
};

export type MatchResult = CalcResult & {
  tipp: string;
  adjusted: boolean;
};

function pois(lambda: number, k: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function dcTau(x: number, y: number, lH: number, lA: number): number {
  if (x === 0 && y === 0) return 1 - lH * lA * DC_RHO;
  if (x === 0 && y === 1) return 1 + lH * DC_RHO;
  if (x === 1 && y === 0) return 1 + lA * DC_RHO;
  if (x === 1 && y === 1) return 1 - DC_RHO;
  return 1;
}

export function poisMatrix(lH: number, lA: number) {
  const M = 7;
  const sc: Record<string, number> = {};
  let tot = 0;
  for (let h = 0; h <= M; h++) {
    for (let a = 0; a <= M; a++) {
      const p = pois(lH, h) * pois(lA, a) * dcTau(h, a, lH, lA);
      sc[`${h}:${a}`] = p;
      tot += p;
    }
  }
  let pH = 0, pD = 0, pA = 0;
  for (const k in sc) {
    sc[k] /= tot;
    const [h, a] = k.split(':').map(Number);
    if (h > a) pH += sc[k];
    else if (h === a) pD += sc[k];
    else pA += sc[k];
  }
  return { sc, pH, pD, pA };
}

function marketCorrectNR(lH0: number, lA0: number, extP: MarketProbs | null, iter = 12) {
  if (!extP) return { lH: lH0, lA: lA0, converged: false };
  const tH = extP.h / 100, tA = extP.a / 100;
  let lH = lH0, lA = lA0;
  const eps = 0.01, damp = 0.5;
  for (let i = 0; i < iter; i++) {
    const c = poisMatrix(lH, lA);
    const eH = tH - c.pH, eA = tA - c.pA;
    if (Math.abs(eH) < 0.002 && Math.abs(eA) < 0.002) return { lH, lA, converged: true };
    const dh = poisMatrix(lH + eps, lA), da = poisMatrix(lH, lA + eps);
    const j00 = (dh.pH - c.pH) / eps, j01 = (da.pH - c.pH) / eps;
    const j10 = (dh.pA - c.pA) / eps, j11 = (da.pA - c.pA) / eps;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-6) break;
    lH = Math.max(0.3, Math.min(4.5, lH + damp * (j11 * eH - j01 * eA) / det));
    lA = Math.max(0.3, Math.min(4.5, lA + damp * (-j10 * eH + j00 * eA) / det));
  }
  return { lH, lA, converged: false };
}

// Hebt pD an. Zwei Quellen, die sich gegenseitig ausschliessen:
//
//   structural: Poisson unterschaetzt Remis bei eng eingestuften Paarungen.
//     Gilt NUR ohne Marktquote -- der Markt preist Remis bereits korrekt ein,
//     ein Aufschlag darauf wuerde systematisch ueber der Quote landen.
//   extraBoost: Dissens-Signal. Setzt eine Marktquote voraus (ohne Markt gibt
//     es keinen Dissens), greift also genau dann, wenn structural aus ist.
//
// Die Differenz wird proportional aus pH und pA entnommen, damit die
// Rangfolge zwischen Heim und Auswaerts erhalten bleibt.
function applyDrawBoost(
  rawPH: number, rawPD: number, rawPA: number, lambdaDiff: number,
  opts: { structural: boolean; extraBoost?: number } = { structural: true },
): { pH: number; pD: number; pA: number } {
  const structBoost = opts.structural && lambdaDiff < DRAW_BOOST_RANGE
    ? DRAW_BOOST_MAX * (1 - lambdaDiff / DRAW_BOOST_RANGE)
    : 0;
  const boost = structBoost + (opts.extraBoost ?? 0);
  if (boost <= 0) return { pH: rawPH, pD: rawPD, pA: rawPA };
  const boosted = Math.min(0.55, rawPD + boost);
  const actual = boosted - rawPD;
  const fromH = actual * rawPH / (rawPH + rawPA);
  let pH = Math.max(0.05, rawPH - fromH);
  let pA = Math.max(0.05, rawPA - (actual - fromH));
  const pD = boosted;
  const tot = pH + pD + pA;
  return { pH: pH / tot, pD: pD / tot, pA: pA / tot };
}

export function calcSingle(
  h: TeamStats,
  a: TeamStats,
  extP: MarketProbs | null,
  drawThreshold: number | null,
  hForm: FormData,
  aForm: FormData,
  calib: CalibParams | null = null,
): CalcResult {
  const effHGF = hForm ? (1 - FORM_WEIGHT) * h.hGF + FORM_WEIGHT * hForm.gf : h.hGF;
  const effHGA = hForm ? (1 - FORM_WEIGHT) * h.hGA + FORM_WEIGHT * hForm.ga : h.hGA;
  const effAGF = aForm ? (1 - FORM_WEIGHT) * a.aGF + FORM_WEIGHT * aForm.gf : a.aGF;
  const effAGA = aForm ? (1 - FORM_WEIGHT) * a.aGA + FORM_WEIGHT * aForm.ga : a.aGA;

  const lH0 = Math.max(0.3, Math.min(4.5, effHGF * (effAGA / LG_DEF_A)));
  const lA0 = Math.max(0.3, Math.min(4.5, effAGF * (effHGA / LG_DEF_H)));

  // Reine Modellsicht (kein Markt) -- Basis fuer Dissens-Erkennung und die
  // "Modell vs. Markt"-Transparenzanzeige in der Detailkarte.
  const { pH: rawPH0, pD: rawPD0, pA: rawPA0 } = poisMatrix(lH0, lA0);
  const modelView = applyDrawBoost(rawPH0, rawPD0, rawPA0, Math.abs(lH0 - lA0), { structural: true });
  const pH_model = modelView.pH, pD_model = modelView.pD, pA_model = modelView.pA;

  // Marktkorrektur: Newton-Raphson findet das Lambda-Paar, das die Marktquoten
  // exakt reproduziert, danach wird mit dem Modell-Lambda im Verhaeltnis
  // MARKET_BLEND gemischt statt voll auf den Markt zu springen.
  let lH = lH0, lA = lA0;
  let dissens = false;
  if (extP) {
    const mc = marketCorrectNR(lH0, lA0, extP);
    const lH_mkt = Math.max(0.3, Math.min(4.5, mc.lH));
    const lA_mkt = Math.max(0.3, Math.min(4.5, mc.lA));
    lH = Math.max(0.3, Math.min(4.5, lH0 * (1 - MARKET_BLEND) + lH_mkt * MARKET_BLEND));
    lA = Math.max(0.3, Math.min(4.5, lA0 * (1 - MARKET_BLEND) + lA_mkt * MARKET_BLEND));

    const modelSide = rawPH0 > rawPA0 ? 'H' : rawPA0 > rawPH0 ? 'A' : null;
    const marketSide = extP.h > extP.a ? 'H' : extP.a > extP.h ? 'A' : null;
    dissens = modelSide !== null && marketSide !== null && modelSide !== marketSide;
  }

  const { sc, pH: rawPH, pD: rawPD, pA: rawPA } = poisMatrix(lH, lA);
  const srt = Object.entries(sc).sort((x, y) => y[1] - x[1]) as Array<[string, number]>;

  const lambdaDiff = Math.abs(lH - lA);

  // Ohne Markt: struktureller Draw-Boost. Mit Markt: kein struktureller Boost
  // (der Markt preist Remis bereits ein), nur der Dissens-Aufschlag, falls
  // Modell und Markt unterschiedliche Seiten favorisieren.
  const { pH: bPH, pD: bPD, pA: bPA } = applyDrawBoost(
    rawPH, rawPD, rawPA, lambdaDiff,
    { structural: !extP, extraBoost: dissens ? DISSENS_DRAW_BOOST_MAX : 0 },
  );

  // Calibration: Platt scaling from past results, or regression-to-mean fallback.
  // Skip when market correction was applied -- die Kalibrierung ist auf reine
  // Modellwahrscheinlichkeiten trainiert (siehe useMatchday.ts calibSamples),
  // nicht auf marktgeblendete.
  let pH = bPH, pD = bPD, pA = bPA;
  let calibrated = false;
  if (!extP) {
    if (calib) {
      ({ pH, pD, pA } = applyCalib(bPH, bPD, bPA, calib));
      calibrated = true;
    } else {
      ({ pH, pD, pA } = shrinkToMean(bPH, bPD, bPA));
    }
  }

  // When calibration compresses pD toward ~22%, lower the threshold accordingly
  const baseThreshold = lambdaDiff < 0.25 ? DRAW_THRESHOLD_TIGHT : DRAW_THRESHOLD;
  const effectiveDrawThreshold = drawThreshold != null
    ? drawThreshold
    : calibrated ? baseThreshold * 0.55 : baseThreshold;

  let wo: Outcome = pH > pD && pH > pA ? 'H' : pA > pD && pA > pH ? 'A' : 'D';
  let drawBlocked = false;
  if (wo === 'D' && pD < effectiveDrawThreshold) {
    wo = pH >= pA ? 'H' : 'A';
    drawBlocked = true;
  }

  const fp = Math.max(pH, pA, pD);
  const pAwayGoal = 1 - Math.exp(-lA);
  const pHomeGoal = 1 - Math.exp(-lH);
  const needAwayGoal = pAwayGoal >= 0.50;
  const needHomeGoal = pHomeGoal >= 0.50;
  const favLambda = wo === 'H' ? lH : wo === 'A' ? lA : null;
  const needFavMinGoals = favLambda !== null && favLambda >= FAV_MIN_GOALS_LAMBDA;

  let rawTipp: string | null = null;
  for (const [s] of srt) {
    const [hi, ai] = s.split(':').map(Number);
    const o: Outcome = hi > ai ? 'H' : hi < ai ? 'A' : 'D';
    if (o === wo) { rawTipp = s; break; }
  }

  let naturalTipp: string | null = null;
  let goalRuleApplied = false;
  let favScoreRuleApplied = false;
  for (const [s] of srt) {
    const [hi, ai] = s.split(':').map(Number);
    const o: Outcome = hi > ai ? 'H' : hi < ai ? 'A' : 'D';
    if (o !== wo) continue;
    if (needAwayGoal && ai === 0) continue;
    if (needHomeGoal && hi === 0) continue;
    if (needFavMinGoals && wo === 'H' && hi < 2) continue;
    if (needFavMinGoals && wo === 'A' && ai < 2) continue;
    naturalTipp = s;
    break;
  }

  if (naturalTipp && rawTipp && naturalTipp !== rawTipp) {
    const [rhi, rai] = rawTipp.split(':').map(Number);
    const [nhi, nai] = naturalTipp.split(':').map(Number);
    if ((needAwayGoal && rai === 0 && nai > 0) || (needHomeGoal && rhi === 0 && nhi > 0))
      goalRuleApplied = true;
    if (needFavMinGoals && ((wo === 'H' && rhi < 2 && nhi >= 2) || (wo === 'A' && rai < 2 && nai >= 2)))
      favScoreRuleApplied = true;
  }
  if (!naturalTipp) naturalTipp = rawTipp;

  return {
    pH, pD, pA, pH_model, pD_model, pA_model,
    naturalTipp, wo, srt, lH, lA, lH_model: lH0, lA_model: lA0, market: extP,
    fp,
    drawBlocked, goalRuleApplied, favScoreRuleApplied,
    lambdaDiff, effectiveDrawThreshold,
    marketApplied: extP !== null,
    calibrated,
    dissens,
  };
}

export function recalcMatches(
  matches: Array<{ id: string; home: string; away: string; p: MarketProbs | null; hForm: FormData; aForm: FormData }>,
  stData: Record<string, TeamStats>,
  fallbackStats: Record<string, TeamStats>,
  calib: CalibParams | null = null,
): Record<string, MatchResult> {
  const DEFAULT: TeamStats = { rank: 9, hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };

  const raw: Record<string, CalcResult> = {};
  matches.forEach(m => {
    const h = stData[m.home] ?? fallbackStats[m.home] ?? DEFAULT;
    const a = stData[m.away] ?? fallbackStats[m.away] ?? DEFAULT;
    raw[m.id] = calcSingle(h, a, m.p, null, m.hForm, m.aForm, calib);
  });

  // Monokultur-Schutz: reihenfolgeunabhängig via Konfidenz-Priorität
  const tippGroups: Record<string, string[]> = {};
  matches.forEach(m => {
    const t = raw[m.id].naturalTipp;
    if (!t) return;
    (tippGroups[t] ??= []).push(m.id);
  });

  const toAdjust = new Set<string>();
  Object.values(tippGroups).forEach(ids => {
    if (ids.length <= MONO_MAX) return;
    const sorted = ids.slice().sort((idA, idB) => {
      const pA = raw[idA].srt.find(([s]) => s === raw[idA].naturalTipp)?.[1] ?? 0;
      const pB = raw[idB].srt.find(([s]) => s === raw[idB].naturalTipp)?.[1] ?? 0;
      if (Math.abs(pA - pB) > 0.0005) return pB - pA;
      const mA = matches.find(m => m.id === idA);
      const mB = matches.find(m => m.id === idB);
      const gapA = Math.abs((stData[mA?.home ?? '']?.rank ?? 9) - (stData[mA?.away ?? '']?.rank ?? 9));
      const gapB = Math.abs((stData[mB?.home ?? '']?.rank ?? 9) - (stData[mB?.away ?? '']?.rank ?? 9));
      return gapB - gapA;
    });
    sorted.slice(MONO_MAX).forEach(id => toAdjust.add(id));
  });

  const assignedCounts: Record<string, number> = {};
  const finalResults: Record<string, MatchResult> = {};

  matches.forEach(m => {
    const r = raw[m.id];
    let tipp = r.naturalTipp ?? '?';
    let adjusted = false;

    if (toAdjust.has(m.id)) {
      for (const [s] of r.srt) {
        if (s === tipp) continue;
        const [hi, ai] = s.split(':').map(Number);
        const o: Outcome = hi > ai ? 'H' : hi < ai ? 'A' : 'D';
        if (o === r.wo && (assignedCounts[s] ?? 0) < MONO_MAX) {
          tipp = s;
          adjusted = true;
          break;
        }
      }
    }

    assignedCounts[tipp] = (assignedCounts[tipp] ?? 0) + 1;
    finalResults[m.id] = { ...r, tipp, adjusted };
  });

  return finalResults;
}
