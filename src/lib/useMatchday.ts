import { useState, useEffect, useCallback } from 'react';
import { fetchSeason, fetchLogos, buildDynST, buildMatchEntries, detectCurrentSpieltag } from './openligadb';
import { recalcMatches, type MatchResult } from './poisson';
import { FALLBACK_STATS } from './clubs';

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
  setSpielTag: (nr: number) => void;
};

export function useMatchday(): MatchdayState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trueSpieltag, setTrueSpieltag] = useState(1);
  const [spieltag, setSpieltagState] = useState(1);
  const [stDataMap, setStDataMap] = useState<Record<number, Record<string, import('./poisson').TeamStats>>>({});
  const [matchesMap, setMatchesMap] = useState<Record<number, Array<import('./openligadb').MatchEntry>>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});

  // Compute displayed matches + results from current state
  const rawMatches = matchesMap[spieltag] ?? [];
  const stData = stDataMap[spieltag] ?? {};
  const results = recalcMatches(rawMatches, stData, FALLBACK_STATS);

  const matches: MatchdayEntry[] = rawMatches.map(m => ({
    id: m.id,
    home: m.home,
    away: m.away,
    kickoff: m.kickoff,
    result: results[m.id],
  })).filter(m => m.result);

  const hasMono = matches.some(m => m.result.adjusted);

  const setSpielTag = useCallback((nr: number) => {
    setSpieltagState(nr);
  }, []);

  // Load season data + logos once
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const all = await fetchSeason();
        if (cancelled) return;

        const current = detectCurrentSpieltag(all);
        setTrueSpieltag(current);
        setSpieltagState(current);

        // Precompute stats + matches for all available spieltage
        const newStMap: Record<number, Record<string, import('./poisson').TeamStats>> = {};
        const newMatchesMap: Record<number, Array<import('./openligadb').MatchEntry>> = {};

        const maxSt = Math.max(...all.map(m => m.group.groupOrderID));
        for (let nr = 1; nr <= maxSt; nr++) {
          const entries = buildMatchEntries(all, nr);
          if (entries.length) {
            newMatchesMap[nr] = entries;
            newStMap[nr] = buildDynST(all, nr);
          }
        }

        if (cancelled) return;
        setStDataMap(newStMap);
        setMatchesMap(newMatchesMap);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ladefehler');
          setLoading(false);
        }
      }
    }

    init();

    // Load logos asynchronously (non-blocking)
    fetchLogos().then(l => { if (!cancelled) setLogos(l); });

    return () => { cancelled = true; };
  }, []);

  return { loading, error, spieltag, trueSpieltag, matches, logos, hasMono, setSpielTag };
}
