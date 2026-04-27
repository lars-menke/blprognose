/**
 * Backtesting-Modul: Vergleicht Modellprognosen mit echten Ergebnissen.
 * Aufruf: import { runBacktest } from './backtest'; runBacktest().then(console.table)
 * Oder im Browser: window.__backtest() nach Einbindung in main.tsx
 */

import { buildDynST, buildMatchEntries, buildForm, fetchSeason, resolveCode, type OldbMatch } from './openligadb';
import { recalcMatches, calcSingle } from './poisson';
import { FALLBACK_STATS } from './clubs';

type MatchOutcome = 'H' | 'D' | 'A';

function getFinalGoals(m: OldbMatch): { g1: number; g2: number } | null {
  const r = m.matchResults?.find(x => x.resultTypeID === 2);
  return r ? { g1: r.pointsTeam1, g2: r.pointsTeam2 } : null;
}

function actualOutcome(g1: number, g2: number): MatchOutcome {
  return g1 > g2 ? 'H' : g1 < g2 ? 'A' : 'D';
}

export type BacktestRow = {
  spieltag: number;
  match: string;
  predicted: MatchOutcome;
  actual: MatchOutcome;
  correct: boolean;
  tipp: string;
  actualScore: string;
  exactHit: boolean;
  topTip: boolean;
  pH: string;
  pD: string;
  pA: string;
  fp: string;
};

export type BacktestSummary = {
  totalMatches: number;
  outcomeCorrect: number;
  outcomeAccuracy: string;
  exactScoreHits: number;
  exactScoreAccuracy: string;
  topTipMatches: number;
  topTipCorrect: number;
  topTipAccuracy: string;
  drawAccuracy: string;
  homeAccuracy: string;
  awayAccuracy: string;
  bySpieltagAccuracy: Record<number, string>;
};

export async function runBacktest(minSpieltag = 5): Promise<{
  summary: BacktestSummary;
  rows: BacktestRow[];
}> {
  const all = await fetchSeason();
  const played = all.filter(m => m.matchIsFinished && !!getFinalGoals(m));

  const rows: BacktestRow[] = [];

  // Group by spieltag and process each
  const byNr: Record<number, OldbMatch[]> = {};
  for (const m of played) {
    const nr = m.group.groupOrderID;
    if (nr < minSpieltag) continue; // skip early matchdays with too little data
    (byNr[nr] ??= []).push(m);
  }

  for (const [nrStr, matchday] of Object.entries(byNr)) {
    const nr = Number(nrStr);
    const stData = buildDynST(all, nr);
    const entries = buildMatchEntries(all, nr, {}); // no odds for backtest
    const results = recalcMatches(entries, stData, FALLBACK_STATS);

    for (const m of matchday) {
      const hC = resolveCode(m.team1);
      const aC = resolveCode(m.team2);
      if (!hC || !aC) continue;

      const id = `${hC.toLowerCase()}-${aC.toLowerCase()}-${nr}`;
      const result = results[id];
      if (!result) continue;

      const goals = getFinalGoals(m)!;
      const actual = actualOutcome(goals.g1, goals.g2);
      const actualScore = `${goals.g1}:${goals.g2}`;

      rows.push({
        spieltag: nr,
        match: `${hC}-${aC}`,
        predicted: result.wo,
        actual,
        correct: result.wo === actual,
        tipp: result.tipp,
        actualScore,
        exactHit: result.tipp === actualScore,
        topTip: result.fp >= 0.70,
        pH: (result.pH * 100).toFixed(1) + '%',
        pD: (result.pD * 100).toFixed(1) + '%',
        pA: (result.pA * 100).toFixed(1) + '%',
        fp: (result.fp * 100).toFixed(1) + '%',
      });
    }
  }

  // Compute summary
  const total = rows.length;
  const correct = rows.filter(r => r.correct).length;
  const exactHits = rows.filter(r => r.exactHit).length;
  const topTips = rows.filter(r => r.topTip);
  const topTipCorrect = topTips.filter(r => r.correct).length;

  const homeRows = rows.filter(r => r.actual === 'H');
  const drawRows = rows.filter(r => r.actual === 'D');
  const awayRows = rows.filter(r => r.actual === 'A');

  const pct = (n: number, d: number) => d ? (n / d * 100).toFixed(1) + '%' : 'n/a';

  const bySpieltagAccuracy: Record<number, string> = {};
  const byNrRows: Record<number, BacktestRow[]> = {};
  rows.forEach(r => (byNrRows[r.spieltag] ??= []).push(r));
  for (const [nr, stRows] of Object.entries(byNrRows)) {
    const c = stRows.filter(r => r.correct).length;
    bySpieltagAccuracy[Number(nr)] = pct(c, stRows.length);
  }

  return {
    summary: {
      totalMatches: total,
      outcomeCorrect: correct,
      outcomeAccuracy: pct(correct, total),
      exactScoreHits: exactHits,
      exactScoreAccuracy: pct(exactHits, total),
      topTipMatches: topTips.length,
      topTipCorrect,
      topTipAccuracy: pct(topTipCorrect, topTips.length),
      drawAccuracy: pct(drawRows.filter(r => r.correct).length, drawRows.length),
      homeAccuracy: pct(homeRows.filter(r => r.correct).length, homeRows.length),
      awayAccuracy: pct(awayRows.filter(r => r.correct).length, awayRows.length),
      bySpieltagAccuracy,
    },
    rows,
  };
}

/**
 * Kalibrierungsanalyse: Sind die Wahrscheinlichkeiten kalibriert?
 * Wenn das Modell sagt pH=70%, sollte das Team auch ~70% der Zeit gewinnen.
 */
export async function runCalibration(buckets = 10): Promise<Array<{
  bucket: string;
  predicted: string;
  actual: string;
  n: number;
}>> {
  const all = await fetchSeason();
  const played = all.filter(m => m.matchIsFinished && !!getFinalGoals(m));

  const points: Array<{ p: number; hit: boolean }> = [];

  const byNr: Record<number, OldbMatch[]> = {};
  for (const m of played) {
    const nr = m.group.groupOrderID;
    if (nr < 5) continue;
    (byNr[nr] ??= []).push(m);
  }

  for (const [nrStr, matchday] of Object.entries(byNr)) {
    const nr = Number(nrStr);
    const stData = buildDynST(all, nr);

    for (const m of matchday) {
      const hC = resolveCode(m.team1);
      const aC = resolveCode(m.team2);
      if (!hC || !aC) continue;

      const DEFAULT = { rank: 9, hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };
      const h = stData[hC] ?? FALLBACK_STATS[hC] ?? DEFAULT;
      const a = stData[aC] ?? FALLBACK_STATS[aC] ?? DEFAULT;
      const hForm = buildForm(all, hC, nr, true);
      const aForm = buildForm(all, aC, nr, false);
      const result = calcSingle(h, a, null, null, hForm, aForm);

      const goals = getFinalGoals(m)!;
      const actual = actualOutcome(goals.g1, goals.g2);

      // Collect all three 1X2 probabilities
      points.push({ p: result.pH, hit: actual === 'H' });
      points.push({ p: result.pD, hit: actual === 'D' });
      points.push({ p: result.pA, hit: actual === 'A' });
    }
  }

  // Bin into buckets
  const binSize = 1 / buckets;
  const result = Array.from({ length: buckets }, (_, i) => {
    const lo = i * binSize, hi = (i + 1) * binSize;
    const inBin = points.filter(p => p.p >= lo && p.p < hi);
    const hits = inBin.filter(p => p.hit).length;
    const midPred = ((lo + hi) / 2 * 100).toFixed(0) + '%';
    return {
      bucket: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`,
      predicted: midPred,
      actual: inBin.length ? (hits / inBin.length * 100).toFixed(1) + '%' : 'n/a',
      n: inBin.length,
    };
  });

  return result;
}
