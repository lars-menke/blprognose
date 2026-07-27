import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchLogos } from './openligadb';
import { fetchRawOdds, type RawOdds } from './fetchOdds';
import { recalcMatches, type MatchResult, type TeamStats } from './poisson';
import { type CalibParams } from './calibration';
import { FALLBACK_STATS } from './clubs';
import { logPreMatch, logPostMatch } from './learnLog';
import { computeValueBets, updatePaperLog, type ValueBet } from './betRadar';
import { isBetRadarEnabled } from './settings';
import { loadModelChain } from './modelChain';
import type { MatchEntry } from './openligadb';

export type MatchdayEntry = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  kickoffISO: string;
  result: MatchResult;
  actual: { g1: number; g2: number } | null;
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
  valueBets: ValueBet[];
  setSpielTag: (nr: number) => void;
};

export function useMatchday(): MatchdayState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trueSpieltag, setTrueSpieltag] = useState(1);
  const [spieltag, setSpieltagState] = useState(1);
  const [stDataMap, setStDataMap] = useState<Record<number, Record<string, TeamStats>>>({});
  const [matchesMap, setMatchesMap] = useState<Record<number, MatchEntry[]>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [calib, setCalib] = useState<CalibParams | null>(null);
  const [rawOdds, setRawOdds] = useState<Record<string, RawOdds>>({});

  // Memoisiert, damit die Effekte unten nicht bei jedem Render feuern --
  // sonst schreibt jeder Render Lernprotokoll und Paper-Konto neu.
  const matches: MatchdayEntry[] = useMemo(() => {
    const rawMatches = matchesMap[spieltag] ?? [];
    const stData = stDataMap[spieltag] ?? {};
    const results = recalcMatches(rawMatches, stData, FALLBACK_STATS, calib);
    return rawMatches
      .map(m => ({
        id: m.id, home: m.home, away: m.away,
        kickoff: m.kickoff, kickoffISO: m.kickoffISO,
        result: results[m.id], actual: m.actual,
      }))
      .filter(m => m.result);
  }, [matchesMap, stDataMap, spieltag, calib]);

  const hasMono = matches.some(m => m.result.adjusted);
  const hasMarket = matches.some(m => m.result.marketApplied);
  const hasCalib = calib !== null;

  const valueBets = useMemo(
    () => (isBetRadarEnabled() ? computeValueBets(matches, rawOdds) : []),
    [matches, rawOdds],
  );

  const setSpielTag = useCallback((nr: number) => setSpieltagState(nr), []);

  // Passives Lernprotokoll: Snapshot schreiben (falls Marktquote vorhanden)
  // und Endergebnisse nachtragen.
  useEffect(() => {
    for (const m of matches) {
      if (m.result.marketApplied && m.result.market) {
        logPreMatch({
          matchId: m.id, kickoff: m.kickoffISO,
          lH_model: m.result.lH_model, lA_model: m.result.lA_model,
          lH_blend: m.result.lH, lA_blend: m.result.lA,
          oddsH: m.result.market.h, oddsD: m.result.market.d, oddsA: m.result.market.a,
        });
      }
      if (m.actual) {
        const actual: 'H' | 'D' | 'A' = m.actual.g1 > m.actual.g2 ? 'H' : m.actual.g1 < m.actual.g2 ? 'A' : 'D';
        logPostMatch(m.id, actual);
      }
    }
  }, [matches]);

  // Wett-Radar: Paper-Trading-Konto fuehren und abrechnen.
  useEffect(() => {
    if (valueBets.length || matches.some(m => m.actual)) updatePaperLog(valueBets, matches);
  }, [matches, valueBets]);

  useEffect(() => {
    let cancelled = false;

    loadModelChain()
      .then(chain => {
        if (cancelled) return;
        setTrueSpieltag(chain.current);
        setSpieltagState(chain.current);
        setStDataMap(chain.stByMatchday);
        setMatchesMap(chain.matchesByMatchday);
        setCalib(chain.calib);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Ladefehler');
        setLoading(false);
      });

    fetchLogos().then(l => { if (!cancelled) setLogos(l); }).catch(() => { /* ohne Wappen weiter */ });
    fetchRawOdds().then(o => { if (!cancelled) setRawOdds(o); }).catch(() => { /* ohne Radar weiter */ });

    return () => { cancelled = true; };
  }, []);

  return { loading, error, spieltag, trueSpieltag, matches, logos, hasMono, hasMarket, hasCalib, valueBets, setSpielTag };
}
