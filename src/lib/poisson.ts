// ─── POISSON-MODELL MIT DIXON-COLES-KORREKTUR ────────────────────────────────

export const DC_RHO = -0.13;
export const FORM_WEIGHT = 0.40;
export const DRAW_THRESHOLD = 0.30;
export const DRAW_THRESHOLD_TIGHT = 0.27;
export const FAV_MIN_GOALS_LAMBDA = 2.0;
export const MONO_MAX = 2;
export const LG_DEF_H = 1.21; // Ø hGA über alle BL1-Teams
export const LG_DEF_A = 1.58; // Ø aGA über alle BL1-Teams

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
  naturalTipp: string | null;
  wo: Outcome;
  srt: Array<[string, number]>;
  lH: number; lA: number;
  fp: number;
  drawBlocked: boolean;
  goalRuleApplied: boolean;
  favScoreRuleApplied: boolean;
  lambdaDiff: number;
  effectiveDrawThreshold: number;
  marketApplied: boolean;
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

export function calcSingle(
  h: TeamStats,
  a: TeamStats,
  extP: MarketProbs | null,
  drawThreshold: number | null,
  hForm: FormData,
  aForm: FormData,
): CalcResult {
  const effHGF = hForm ? (1 - FORM_WEIGHT) * h.hGF + FORM_WEIGHT * hForm.gf : h.hGF;
  const effHGA = hForm ? (1 - FORM_WEIGHT) * h.hGA + FORM_WEIGHT * hForm.ga : h.hGA;
  const effAGF = aForm ? (1 - FORM_WEIGHT) * a.aGF + FORM_WEIGHT * aForm.gf : a.aGF;
  const effAGA = aForm ? (1 - FORM_WEIGHT) * a.aGA + FORM_WEIGHT * aForm.ga : a.aGA;

  let lH = Math.max(0.3, Math.min(4.5, effHGF * (effAGA / LG_DEF_A)));
  let lA = Math.max(0.3, Math.min(4.5, effAGF * (effHGA / LG_DEF_H)));

  const mc = marketCorrectNR(lH, lA, extP);
  lH = Math.max(0.3, Math.min(4.5, mc.lH));
  lA = Math.max(0.3, Math.min(4.5, mc.lA));

  const { sc, pH, pD, pA } = poisMatrix(lH, lA);
  const srt = Object.entries(sc).sort((x, y) => y[1] - x[1]) as Array<[string, number]>;

  const lambdaDiff = Math.abs(lH - lA);
  const effectiveDrawThreshold = drawThreshold != null
    ? drawThreshold
    : (lambdaDiff < 0.25 ? DRAW_THRESHOLD_TIGHT : DRAW_THRESHOLD);

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
    pH, pD, pA, naturalTipp, wo, srt, lH, lA, fp,
    drawBlocked, goalRuleApplied, favScoreRuleApplied,
    lambdaDiff, effectiveDrawThreshold,
    marketApplied: extP !== null,
  };
}

export function recalcMatches(
  matches: Array<{ id: string; home: string; away: string; p: MarketProbs | null; hForm: FormData; aForm: FormData }>,
  stData: Record<string, TeamStats>,
  fallbackStats: Record<string, TeamStats>,
): Record<string, MatchResult> {
  const DEFAULT: TeamStats = { rank: 9, hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };

  const raw: Record<string, CalcResult> = {};
  matches.forEach(m => {
    const h = stData[m.home] ?? fallbackStats[m.home] ?? DEFAULT;
    const a = stData[m.away] ?? fallbackStats[m.away] ?? DEFAULT;
    raw[m.id] = calcSingle(h, a, m.p, null, m.hForm, m.aForm);
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
