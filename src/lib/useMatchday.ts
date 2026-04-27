import { useState, useEffect, useCallback } from 'react';
import { fetchSeason, fetchLogos, buildDynST, buildMatchEntries, detectCurrentSpieltag, resolveCode } from './openligadb';
import { fetchOdds } from './fetchOdds';
import { recalcMatches, calcSingle, type MatchResult, type TeamStats } from './poisson';
import { buildCalib, type CalibSample, type CalibParams } from './calibration';
import { FALLBACK_STATS } from './clubs';
import type { MatchEntry, OldbMatch } from './openligadb';

export type MatchdayEntry = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  result: MatchResult;
};

export type MatchdayState = {
  loading: boolean;
  error: string | null;
  spieltag: number;
  trueSpieltag: number;
  matches: MatchdayEntry[];
  logos: Record<string, string>;
  hasMono: boolean;
  hasMarket: boolean;
  hasCalib: boolean;
  setSpielTag: (nr: number) => void;
};

const DEFAULT_ST: TeamStats = { rank: 9, hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };

function getActualOutcome(all: OldbMatch[], nr: number, home: string, away: string): 'H' | 'D' | 'A' | null {
  const m = all.find(m =>
    m.group.groupOrderID === nr &&
    m.matchIsFinished &&
    resolveCode(m.team1) === home &&
    resolveCode(m.team2) === away
  );
  if (!m) return null;
  const r = m.matchResults?.find(x => x.resultTypeID === 2);
  if (!r) return null;
  return r.pointsTeam1 > r.pointsTeam2 ? 'H' : r.pointsTeam1 < r.pointsTeam2 ? 'A' : 'D';
}

export function useMatchday(): MatchdayState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trueSpieltag, setTrueSpieltag] = useState(1);
  const [spieltag, setSpieltagState] = useState(1);
  const [stDataMap, setStDataMap] = useState<Record<number, Record<string, TeamStats>>>({});
  const [matchesMap, setMatchesMap] = useState<Record<number, MatchEntry[]>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [calib, setCalib] = useState<CalibParams | null>(null);

  const rawMatches = matchesMap[spieltag] ?? [];
  const stData = stDataMap[spieltag] ?? {};
  const results = recalcMatches(rawMatches, stData, FALLBACK_STATS, calib);

  const matches: MatchdayEntry[] = rawMatches
    .map(m => ({ id: m.id, home: m.home, away: m.away, kickoff: m.kickoff, result: results[m.id] }))
    .filter(m => m.result);

  const hasMono = matches.some(m => m.result.adjusted);
  const hasMarket = matches.some(m => m.result.marketApplied);
  const hasCalib = calib !== null;

  const setSpielTag = useCallback((nr: number) => setSpieltagState(nr), []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [all, oddsMap] = await Promise.all([fetchSeason(), fetchOdds()]);
        if (cancelled) return;

        const current = detectCurrentSpieltag(all);
        setTrueSpieltag(current);
        setSpieltagState(current);

        const newStMap: Record<number, Record<string, TeamStats>> = {};
        const newMatchesMap: Record<number, MatchEntry[]> = {};
        const calibSamples: CalibSample[] = [];

        const maxSt = Math.max(...all.map(m => m.group.groupOrderID));

        for (let nr = 1; nr <= maxSt; nr++) {
          const stData = buildDynST(all, nr);
          const entries = buildMatchEntries(all, nr, nr >= current ? oddsMap : {});
          if (!entries.length) continue;

          newMatchesMap[nr] = entries;
          newStMap[nr] = stData;

          // Collect calibration samples from played matchdays (raw model, no calib yet)
          if (nr >= 5 && nr < current) {
            for (const entry of entries) {
              const act = getActualOutcome(all, nr, entry.home, entry.away);
              if (!act) continue;
              const h = stData[entry.home] ?? FALLBACK_STATS[entry.home] ?? DEFAULT_ST;
              const a = stData[entry.away] ?? FALLBACK_STATS[entry.away] ?? DEFAULT_ST;
              const raw = calcSingle(h, a, null, null, entry.hForm, entry.aForm);
              calibSamples.push({ pH: raw.pH, pD: raw.pD, pA: raw.pA, actual: act });
            }
          }
        }

        if (cancelled) return;
        setStDataMap(newStMap);
        setMatchesMap(newMatchesMap);
        setCalib(buildCalib(calibSamples));
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ladefehler');
          setLoading(false);
        }
      }
    }

    init();
    fetchLogos().then(l => { if (!cancelled) setLogos(l); });

    return () => { cancelled = true; };
  }, []);

  return { loading, error, spieltag, trueSpieltag, matches, logos, hasMono, hasMarket, hasCalib, setSpielTag };
}
