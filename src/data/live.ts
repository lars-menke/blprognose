// Live-Normalisierung eines einzelnen Spiels.
//
// Review-Fehler Nr. 2 (4.1.1): Der Spielstand bevorzugte den hoechsten in der
// Torliste enthaltenen Zwischenstand VOR den Resultateintraegen -- auch bei
// abgeschlossenen Spielen. Bei offiziellem Endstand 5:1 und einer Torliste,
// die nur bis 1:0 reicht, zeigte die App 1:0. Regel jetzt:
//
//   abgeschlossen  -> ausschliesslich der offizielle Endstand (Resultateintrag)
//   laufend        -> Torliste (aktuellster Eintrag), sonst Zwischenstand-Eintrag
//   bevorstehend   -> kein Spielstand
//
// Live-Erkennung ist heuristisch: nicht abgeschlossen und Anstoss hoechstens
// LIVE_WINDOW_HOURS zurueck. Abgebrochene oder stark verzoegerte Spiele
// brauchen eigene Zustaende, die OpenLigaDB nicht liefert.

import { pickFinalResult, type RawMatch, type RawGoal } from './openliga.ts';

export type LiveStatus = 'upcoming' | 'live' | 'finished';

export const LIVE_WINDOW_HOURS = 3;

export interface LiveGoal {
  minute: number | null;
  scorer?: string;
  score: { home: number; away: number };
  penalty: boolean;
  ownGoal: boolean;
}

export interface LiveMatch {
  id: number;
  status: LiveStatus;
  kickoff: string;
  score: { home: number; away: number } | null;
  /** Woher der Spielstand stammt -- fuer Diagnose und Tests. */
  scoreSource: 'final-result' | 'goal-list' | 'interim-result' | 'none';
  goals: LiveGoal[];
}

function latestGoal(goals: RawGoal[] | undefined): RawGoal | null {
  if (!goals?.length) return null;
  // Reihenfolge: Spielminute, dann goalID -- eine Torliste kann unsortiert kommen
  return goals.reduce((best, g) => {
    const bm = best.matchMinute ?? -1, gm = g.matchMinute ?? -1;
    if (gm > bm) return g;
    if (gm === bm && g.goalID > best.goalID) return g;
    return best;
  });
}

export function liveStatus(raw: Pick<RawMatch, 'matchIsFinished' | 'matchDateTimeUTC' | 'matchDateTime'>, now: Date): LiveStatus {
  if (raw.matchIsFinished) return 'finished';
  const ko = Date.parse(raw.matchDateTimeUTC ?? raw.matchDateTime ?? '');
  if (Number.isNaN(ko) || ko > now.getTime()) return 'upcoming';
  const hours = (now.getTime() - ko) / 3_600_000;
  return hours <= LIVE_WINDOW_HOURS ? 'live' : 'upcoming';
}

export function normalizeLiveMatch(raw: RawMatch, now: Date): LiveMatch {
  const status = liveStatus(raw, now);
  const kickoff = new Date(raw.matchDateTimeUTC ?? raw.matchDateTime ?? NaN).toISOString();
  const goals: LiveGoal[] = (raw.goals ?? []).map(g => ({
    minute: g.matchMinute,
    scorer: g.goalGetterName,
    score: { home: g.scoreTeam1, away: g.scoreTeam2 },
    penalty: !!g.isPenalty,
    ownGoal: !!g.isOwnGoal,
  }));

  if (status === 'finished') {
    const final = pickFinalResult(raw.matchResults);
    return { id: raw.matchID, status, kickoff, score: final, scoreSource: final ? 'final-result' : 'none', goals };
  }
  if (status === 'live') {
    const g = latestGoal(raw.goals);
    if (g) return { id: raw.matchID, status, kickoff, score: { home: g.scoreTeam1, away: g.scoreTeam2 }, scoreSource: 'goal-list', goals };
    const interim = raw.matchResults?.length
      ? raw.matchResults.reduce((b, r) => (r.resultOrderID > b.resultOrderID ? r : b))
      : null;
    if (interim) return { id: raw.matchID, status, kickoff, score: { home: interim.pointsTeam1, away: interim.pointsTeam2 }, scoreSource: 'interim-result', goals };
    return { id: raw.matchID, status, kickoff, score: { home: 0, away: 0 }, scoreSource: 'none', goals };
  }
  return { id: raw.matchID, status, kickoff, score: null, scoreSource: 'none', goals };
}
