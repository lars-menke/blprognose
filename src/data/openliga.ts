// OpenLigaDB: Saisonspiele abrufen, vereinheitlichen, deduplizieren, pruefen.
//
// Schluessel ist die numerische Team-ID -- Namen dienen nur der Anzeige.
// Ergebniswahl: resultTypeID 2 (Endstand) bevorzugt, sonst der Eintrag mit
// der hoechsten resultOrderID. Nur abgeschlossene Spiele mit gueltigen Toren
// sind Trainingsmaterial.

import type { League, MatchRecord, TeamInfo } from '../types.ts';

export const OPENLIGA_BASE = 'https://api.openligadb.de';

export interface RawTeam { teamId: number; teamName: string; shortName?: string; teamIconUrl?: string }
export interface RawResult { resultTypeID: number; resultOrderID: number; pointsTeam1: number; pointsTeam2: number }
export interface RawGoal { goalID: number; scoreTeam1: number; scoreTeam2: number; matchMinute: number | null; goalGetterName?: string; isPenalty?: boolean; isOwnGoal?: boolean }
export interface RawMatch {
  matchID: number;
  matchDateTimeUTC?: string;
  matchDateTime?: string;
  group?: { groupOrderID: number; groupName?: string };
  team1: RawTeam;
  team2: RawTeam;
  matchIsFinished: boolean;
  matchResults?: RawResult[];
  goals?: RawGoal[];
}

export interface DataIssue {
  level: 'warn' | 'error';
  code: 'invalid-goals' | 'conflicting-duplicate' | 'missing-kickoff' | 'team-count' | 'matchday-size' | 'missing-matchday';
  message: string;
  matchId?: number;
}

export interface NormalizedSeason {
  matches: MatchRecord[];
  issues: DataIssue[];
}

function validGoal(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

/** Endergebnis nach Prioritaetsregel; null, wenn keines vorliegt oder es ungueltig ist. */
export function pickFinalResult(results: RawResult[] | undefined): { home: number; away: number } | null {
  if (!results?.length) return null;
  const final = results.find(r => r.resultTypeID === 2)
    ?? results.reduce((best, r) => (r.resultOrderID > best.resultOrderID ? r : best));
  if (!validGoal(final.pointsTeam1) || !validGoal(final.pointsTeam2)) return null;
  return { home: final.pointsTeam1, away: final.pointsTeam2 };
}

export function normalizeMatch(raw: RawMatch, league: League, season: number, issues: DataIssue[]): MatchRecord | null {
  const kickoff = raw.matchDateTimeUTC ?? raw.matchDateTime;
  if (!kickoff || Number.isNaN(Date.parse(kickoff))) {
    issues.push({ level: 'error', code: 'missing-kickoff', message: `Spiel ${raw.matchID} ohne gueltige Anstosszeit`, matchId: raw.matchID });
    return null;
  }
  const result = pickFinalResult(raw.matchResults);
  if (raw.matchIsFinished && !result) {
    issues.push({ level: 'warn', code: 'invalid-goals', message: `Spiel ${raw.matchID} ist abgeschlossen, hat aber kein gueltiges Endergebnis`, matchId: raw.matchID });
  }
  return {
    id: raw.matchID,
    league,
    season,
    matchday: raw.group?.groupOrderID ?? 0,
    kickoff: new Date(kickoff).toISOString(),
    homeId: raw.team1.teamId,
    awayId: raw.team2.teamId,
    homeName: raw.team1.teamName,
    awayName: raw.team2.teamName,
    homeShort: raw.team1.shortName || raw.team1.teamName,
    awayShort: raw.team2.shortName || raw.team2.teamName,
    homeLogo: raw.team1.teamIconUrl,
    awayLogo: raw.team2.teamIconUrl,
    finished: raw.matchIsFinished && result !== null,
    homeGoals: result?.home ?? null,
    awayGoals: result?.away ?? null,
  };
}

/**
 * Dedupliziert nach Spiel-ID. Widerspruechliche Dubletten (verschiedene
 * Ergebnisse fuer dieselbe ID) werden gemeldet -- diese Pruefung muss VOR der
 * Deduplizierung passieren, sonst sieht niemand mehr den Widerspruch.
 */
export function dedupe(matches: MatchRecord[], issues: DataIssue[]): MatchRecord[] {
  const byId = new Map<number, MatchRecord>();
  for (const m of matches) {
    const prev = byId.get(m.id);
    if (!prev) { byId.set(m.id, m); continue; }
    const conflict = prev.finished && m.finished && (prev.homeGoals !== m.homeGoals || prev.awayGoals !== m.awayGoals);
    if (conflict) {
      issues.push({ level: 'error', code: 'conflicting-duplicate', message: `Spiel ${m.id} mehrfach mit unterschiedlichem Ergebnis`, matchId: m.id });
    }
    // Vollstaendigeren Datensatz behalten
    if (m.finished && !prev.finished) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id - b.id);
}

export function normalizeSeason(raw: RawMatch[], league: League, season: number): NormalizedSeason {
  const issues: DataIssue[] = [];
  const normalized = raw.map(r => normalizeMatch(r, league, season, issues)).filter((m): m is MatchRecord => m !== null);
  return { matches: dedupe(normalized, issues), issues };
}

export function teamsOf(matches: readonly MatchRecord[]): TeamInfo[] {
  const map = new Map<number, TeamInfo>();
  for (const m of matches) {
    if (!map.has(m.homeId)) map.set(m.homeId, { id: m.homeId, name: m.homeName, shortName: m.homeShort, logo: m.homeLogo });
    if (!map.has(m.awayId)) map.set(m.awayId, { id: m.awayId, name: m.awayName, shortName: m.awayShort, logo: m.awayLogo });
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export interface SeasonShape { teams: number; matchesPerMatchday: number; matchdays: number }
export const BL_SHAPE: SeasonShape = { teams: 18, matchesPerMatchday: 9, matchdays: 34 };

/**
 * Plausibilitaet eines Spielplans. Fehler machen die Saison unbrauchbar
 * (falsche Vereinsanzahl, ungerade Spieltage); ein noch nicht vollstaendig
 * veroeffentlichter Spielplan (< 34 Spieltage) ist nur eine Warnung.
 */
export function validateSeason(matches: readonly MatchRecord[], shape: SeasonShape = BL_SHAPE): DataIssue[] {
  const issues: DataIssue[] = [];
  const teams = teamsOf(matches);
  if (teams.length !== shape.teams) {
    issues.push({ level: 'error', code: 'team-count', message: `${teams.length} statt ${shape.teams} Vereine im Spielplan` });
  }
  const byDay = new Map<number, number>();
  for (const m of matches) byDay.set(m.matchday, (byDay.get(m.matchday) ?? 0) + 1);
  for (const [day, count] of byDay) {
    if (count !== shape.matchesPerMatchday) {
      issues.push({ level: 'error', code: 'matchday-size', message: `Spieltag ${day} hat ${count} statt ${shape.matchesPerMatchday} Spiele` });
    }
  }
  if (byDay.size < shape.matchdays) {
    issues.push({ level: 'warn', code: 'missing-matchday', message: `Nur ${byDay.size} von ${shape.matchdays} Spieltagen veroeffentlicht` });
  }
  return issues;
}

/** Austauschbare Datenquelle -- im Test eine Fake-Quelle, produktiv OpenLigaDB. */
export interface SeasonSource {
  loadSeason(league: League, season: number): Promise<MatchRecord[]>;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface OpenLigaOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
  /** Wird bei Datenproblemen aufgerufen (Logging); Fehler-Issues werfen zusaetzlich. */
  onIssues?: (league: League, season: number, issues: DataIssue[]) => void;
}

export class OpenLigaSource implements SeasonSource {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly onIssues?: OpenLigaOptions['onIssues'];

  constructor(options: OpenLigaOptions = {}) {
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.baseUrl = options.baseUrl ?? OPENLIGA_BASE;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.onIssues = options.onIssues;
  }

  async loadSeason(league: League, season: number): Promise<MatchRecord[]> {
    const url = `${this.baseUrl}/getmatchdata/${league}/${season}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`OpenLigaDB ${league}/${season}: HTTP ${res.status}`);
      const raw = (await res.json()) as RawMatch[];
      if (!Array.isArray(raw)) throw new Error(`OpenLigaDB ${league}/${season}: unerwartetes Format`);
      const { matches, issues } = normalizeSeason(raw, league, season);
      if (issues.length) this.onIssues?.(league, season, issues);
      return matches;
    } finally {
      clearTimeout(timer);
    }
  }
}
