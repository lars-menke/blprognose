// Eine Rechenkette fuer die ganze App.
//
// WM-Lektion (docs/calibration-analysis.md, v3.0.0): Parallelmodelle fuehren zu
// widerspruechlichen Aussagen zwischen den Tabs und lassen sich empirisch nicht
// sauber gegeneinander bewerten. Spieltag-Prognose UND Monte-Carlo-Saison-
// simulation ziehen ihre Wahrscheinlichkeiten deshalb aus derselben Quelle:
// dieselben Kaltstart-geglaetteten Statistiken, dieselben Marktquoten fuer real
// angesetzte Paarungen, dieselbe Platt-Kalibrierung.
//
// Das Ergebnis wird pro Session einmal berechnet und geteilt -- die Aufbereitung
// laeuft ueber alle 34 Spieltage plus Vorsaison und ist zu teuer, um sie pro Hook
// zu wiederholen.

import {
  fetchSeason, fetchPrevSeason, buildDynST, buildDynSTWithPriors,
  buildMatchEntries, detectCurrentSpieltag, resolveCode,
  type MatchEntry, type OldbMatch,
} from './openligadb';
import { fetchOdds } from './fetchOdds';
import { calcSingle, type TeamStats } from './poisson';
import { buildCalib, type CalibSample, type CalibParams } from './calibration';
import { FALLBACK_STATS } from './clubs';

const DEFAULT_ST: TeamStats = { rank: 9, hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };

export type ModelChain = {
  all: OldbMatch[];
  current: number;
  /** Kaltstart-geglaettete Teamstatistik je Spieltag */
  stByMatchday: Record<number, Record<string, TeamStats>>;
  /** Spiele je Spieltag, inkl. Marktquote fuer noch nicht gespielte Partien */
  matchesByMatchday: Record<number, MatchEntry[]>;
  calib: CalibParams | null;
};

function actualOutcome(all: OldbMatch[], nr: number, home: string, away: string): 'H' | 'D' | 'A' | null {
  const m = all.find(m =>
    m.group.groupOrderID === nr &&
    m.matchIsFinished &&
    resolveCode(m.team1) === home &&
    resolveCode(m.team2) === away
  );
  const r = m?.matchResults?.find(x => x.resultTypeID === 2);
  if (!r) return null;
  return r.pointsTeam1 > r.pointsTeam2 ? 'H' : r.pointsTeam1 < r.pointsTeam2 ? 'A' : 'D';
}

async function build(): Promise<ModelChain> {
  const [all, prevAll, oddsMap] = await Promise.all([
    fetchSeason(), fetchPrevSeason(), fetchOdds(),
  ]);

  const current = detectCurrentSpieltag(all);
  const prevSeasonStats = prevAll.length > 0 ? buildDynST(prevAll, Infinity) : null;

  const calibSamples: CalibSample[] = [];
  const stByMatchday: Record<number, Record<string, TeamStats>> = {};
  const matchesByMatchday: Record<number, MatchEntry[]> = {};

  // Vorsaison als Kalibrier-Basis: rohe Modellwahrscheinlichkeiten (ohne Markt),
  // damit die Platt-Parameter zu dem passen, worauf sie spaeter angewendet werden.
  if (prevAll.length > 0) {
    const maxPrev = Math.max(...prevAll.map(m => m.group.groupOrderID));
    for (let nr = 5; nr <= maxPrev; nr++) {
      const stData = buildDynST(prevAll, nr);
      for (const entry of buildMatchEntries(prevAll, nr)) {
        const act = actualOutcome(prevAll, nr, entry.home, entry.away);
        if (!act) continue;
        const h = stData[entry.home] ?? FALLBACK_STATS[entry.home] ?? DEFAULT_ST;
        const a = stData[entry.away] ?? FALLBACK_STATS[entry.away] ?? DEFAULT_ST;
        const raw = calcSingle(h, a, null, null, entry.hForm, entry.aForm);
        calibSamples.push({ pH: raw.pH, pD: raw.pD, pA: raw.pA, actual: act });
      }
    }
  }

  const maxSt = all.length ? Math.max(...all.map(m => m.group.groupOrderID)) : 0;

  for (let nr = 1; nr <= maxSt; nr++) {
    const stData = buildDynSTWithPriors(all, nr, prevSeasonStats);
    // Marktquoten nur fuer noch nicht abgeschlossene Spieltage -- rueckwirkend
    // waeren sie Look-ahead-Bias gegenueber der damals getroffenen Prognose.
    const entries = buildMatchEntries(all, nr, nr >= current ? oddsMap : {});
    if (!entries.length) continue;

    matchesByMatchday[nr] = entries;
    stByMatchday[nr] = stData;

    if (nr >= 5 && nr < current) {
      for (const entry of entries) {
        const act = actualOutcome(all, nr, entry.home, entry.away);
        if (!act) continue;
        const h = stData[entry.home] ?? FALLBACK_STATS[entry.home] ?? DEFAULT_ST;
        const a = stData[entry.away] ?? FALLBACK_STATS[entry.away] ?? DEFAULT_ST;
        const raw = calcSingle(h, a, null, null, entry.hForm, entry.aForm);
        calibSamples.push({ pH: raw.pH, pD: raw.pD, pA: raw.pA, actual: act });
      }
    }
  }

  return { all, current, stByMatchday, matchesByMatchday, calib: buildCalib(calibSamples) };
}

let _chain: Promise<ModelChain> | null = null;

export function loadModelChain(): Promise<ModelChain> {
  _chain ??= build();
  return _chain;
}
