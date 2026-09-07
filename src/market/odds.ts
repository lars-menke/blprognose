// Marktanbindung: The Odds API, Wettbewerb soccer_germany_bundesliga (fester
// Schluessel, KEIN Fuzzy-Matching ueber Wettbewerbsnamen), Region eu, Markt
// h2h, Dezimalquoten. Der API-Key bleibt serverseitig / in Skripten.
//
// Zuordnung Spiel <-> Quotenereignis: normalisierte Vereinsnamen (Alias-
// Tabelle mit Diagnose fuer Unbekanntes) UND Anstoss innerhalb von zwei
// Stunden. Eine fehlende Zuordnung betrifft NUR dieses Spiel -- niemals den
// gesamten Abruf (Review 8.4).
//
// Zeitregeln je Buchmacher-Quote (Review-Fehler Nr. 4, reproduziertes
// 13:00/11:00-Beispiel): Der Zeitstempel muss vor BEIDEN Anstosszeiten
// liegen -- der OpenLigaDB-Ansetzung und der commence_time des zugeordneten
// Quotenereignisses -- und hoechstens am Rechenstichtag. Weicht der Markt-
// Anstoss von OpenLigaDB ab, gewinnt die fruehere Zeit.
//
// Marge: Power-Methode (Exponent c mit Summe q^c = 1, 80 Bisektionsschritte),
// Residualpruefung, proportionaler Fallback. Danach gleich gewichtetes Mittel
// ueber alle verwendbaren Buchmacher.

import type { MatchRecord, OutcomeProbs } from '../types.ts';
import { normalizeProbs } from '../model/blend.ts';

export const SPORT_KEY = 'soccer_germany_bundesliga';
export const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

export interface OddsOutcome { name: string; price: number }
export interface OddsMarket { key: string; last_update?: string; outcomes: OddsOutcome[] }
export interface OddsBookmaker { key: string; title?: string; last_update?: string; markets: OddsMarket[] }
export interface OddsEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface BookmakerQuote {
  bookmaker: string;
  home: number;
  draw: number;
  away: number;
  updatedAt: string;
  overround: number;
}

export interface MarketProbs {
  /** Faire, gemittelte 1X2-Wahrscheinlichkeiten VOR der Markttemperatur. */
  probabilities: OutcomeProbs;
  quotes: BookmakerQuote[];
  bookmakerCount: number;
  averageOverround: number;
  method: 'power' | 'proportional' | 'mixed';
  /** Neuester enthaltener Zeitstempel -- sagt nichts ueber das Alter der uebrigen Anbieter. */
  latestUpdate: string;
  oldestUpdate: string;
  eventId: string;
  commenceTime: string;
}

export interface MarketOptions {
  asOf: Date;
  /** Maximale Abweichung Markt-Anstoss vs. OpenLigaDB-Anstoss fuer eine Zuordnung. */
  kickoffToleranceMs?: number;
  /** Quoten aelter als das werden verworfen (0 = kein Limit). */
  maxQuoteAgeMs?: number;
  minBookmakers?: number;
  /** Zusaetzliche Token-Aliase: odds-token -> openliga-token (beide normalisiert). */
  aliases?: Record<string, string>;
}

export interface MarketRejection { matchId: number; reason: string }

export interface AttachedMarkets {
  markets: Map<number, MarketProbs>;
  rejected: MarketRejection[];
  /** Quotenereignisse, die zu keinem Spiel passten -- Hinweis auf fehlende Aliase. */
  unmatchedEvents: Array<{ eventId: string; home: string; away: string; commenceTime: string }>;
}

const DEFAULTS = {
  kickoffToleranceMs: 2 * 3_600_000,
  maxQuoteAgeMs: 48 * 3_600_000,
  minBookmakers: 2,
};

const STOP = new Set(['fc', 'sv', 'sc', 'tsg', 'vfl', 'vfb', 'rb', 'fsv', 'tsv', 'spvgg', 'fk', 'e', 'v', 'ev',
  '1', '04', '05', '09', '1899', '1846', '1910', '1904', '1848', '1900', '1919']);

const TOKEN_ALIASES: Record<string, string> = {
  munich: 'munchen', koeln: 'koln', cologne: 'koln', gladbach: 'monchengladbach', moenchengladbach: 'monchengladbach',
  nuernberg: 'nurnberg', duesseldorf: 'dusseldorf', fuerth: 'furth', luebeck: 'lubeck', muenster: 'munster',
};

export function normalizeTeamName(name: string, aliases: Record<string, string> = {}): string[] {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return base.split(' ')
    .filter(t => t && !STOP.has(t))
    .map(t => aliases[t] ?? TOKEN_ALIASES[t] ?? t)
    .sort();
}

function sameTeam(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  if (a.length === b.length && a.every((t, i) => t === b[i])) return true;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  return small.every(t => large.includes(t));
}

export interface EventMatch { event: OddsEvent; commenceMs: number }

export function findEvent(match: MatchRecord, events: readonly OddsEvent[], opts: MarketOptions): EventMatch | { reason: string } {
  const tol = opts.kickoffToleranceMs ?? DEFAULTS.kickoffToleranceMs;
  const homeKey = normalizeTeamName(match.homeName, opts.aliases);
  const awayKey = normalizeTeamName(match.awayName, opts.aliases);
  const kickoffMs = Date.parse(match.kickoff);
  let nameOnly = 0;
  for (const ev of events) {
    if (!sameTeam(homeKey, normalizeTeamName(ev.home_team, opts.aliases))) continue;
    if (!sameTeam(awayKey, normalizeTeamName(ev.away_team, opts.aliases))) continue;
    nameOnly++;
    const commenceMs = Date.parse(ev.commence_time);
    if (Number.isFinite(commenceMs) && Math.abs(commenceMs - kickoffMs) <= tol) return { event: ev, commenceMs };
  }
  return { reason: nameOnly ? 'kickoff-mismatch' : 'no-event' };
}

export interface DevigResult { probs: OutcomeProbs; method: 'power' | 'proportional'; exponent: number | null; residual: number }

/**
 * Power-De-vig: q_k = 1/Quote, finde c mit Summe q_k^c = 1. Bei q < 1 ist die
 * Summe monoton fallend in c, Bisektion auf [0.1, 10] konvergiert. Residual
 * > 1e-6 (Loesung ausserhalb des Intervalls) -> proportionale Normierung.
 */
export function devigPower(home: number, draw: number, away: number): DevigResult {
  const q = [1 / home, 1 / draw, 1 / away];
  const sum = (c: number) => q.reduce((s, v) => s + Math.pow(v, c), 0);
  let lo = 0.1, hi = 10;
  if (sum(lo) - 1 < 0 || sum(hi) - 1 > 0) {
    const s = q[0] + q[1] + q[2];
    return { probs: { H: q[0] / s, D: q[1] / s, A: q[2] / s }, method: 'proportional', exponent: null, residual: Math.abs(s - 1) };
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) - 1 > 0) lo = mid; else hi = mid;
  }
  const c = (lo + hi) / 2;
  const residual = Math.abs(sum(c) - 1);
  if (residual > 1e-6) {
    const s = q[0] + q[1] + q[2];
    return { probs: { H: q[0] / s, D: q[1] / s, A: q[2] / s }, method: 'proportional', exponent: c, residual };
  }
  return { probs: normalizeProbs({ H: Math.pow(q[0], c), D: Math.pow(q[1], c), A: Math.pow(q[2], c) }), method: 'power', exponent: c, residual };
}

function validPrice(p: unknown): p is number {
  return typeof p === 'number' && Number.isFinite(p) && p > 1;
}

export function marketFor(match: MatchRecord, events: readonly OddsEvent[], opts: MarketOptions): { market: MarketProbs | null; reason?: string } {
  const asOfMs = opts.asOf.getTime();
  const kickoffMs = Date.parse(match.kickoff);
  if (asOfMs >= kickoffMs) return { market: null, reason: 'match-started' };

  const found = findEvent(match, events, opts);
  if ('reason' in found) return { market: null, reason: found.reason };
  const { event, commenceMs } = found;
  // Fruehere der beiden Anstosszeiten ist die Grenze (Review-Fehler 4)
  const deadline = Math.min(kickoffMs, commenceMs);
  const maxAge = opts.maxQuoteAgeMs ?? DEFAULTS.maxQuoteAgeMs;
  const minBooks = opts.minBookmakers ?? DEFAULTS.minBookmakers;

  const quotes: BookmakerQuote[] = [];
  const fair: OutcomeProbs[] = [];
  const methods = new Set<string>();
  for (const bk of event.bookmakers ?? []) {
    const h2h = bk.markets?.find(m => m.key === 'h2h');
    if (!h2h) continue;
    const tsRaw = h2h.last_update ?? bk.last_update;
    const ts = tsRaw ? Date.parse(tsRaw) : NaN;
    if (!Number.isFinite(ts)) continue;
    if (ts >= deadline) continue;              // nach (einem der) Anstoesse
    if (ts > asOfMs) continue;                 // aus der Zukunft relativ zum Stichtag
    if (maxAge > 0 && asOfMs - ts > maxAge) continue;
    const oH = h2h.outcomes.find(o => o.name === event.home_team)?.price;
    const oD = h2h.outcomes.find(o => o.name === 'Draw')?.price;
    const oA = h2h.outcomes.find(o => o.name === event.away_team)?.price;
    if (!validPrice(oH) || !validPrice(oD) || !validPrice(oA)) continue;
    const overround = 1 / oH + 1 / oD + 1 / oA - 1;
    if (overround < 0 || overround > 0.25) continue; // Arbitrage-/Datenfehler-Schutz
    const dv = devigPower(oH, oD, oA);
    methods.add(dv.method);
    fair.push(dv.probs);
    quotes.push({ bookmaker: bk.key, home: oH, draw: oD, away: oA, updatedAt: new Date(ts).toISOString(), overround });
  }
  if (quotes.length < minBooks) return { market: null, reason: quotes.length ? 'too-few-bookmakers' : 'no-usable-quotes' };

  const n = fair.length;
  const probabilities = normalizeProbs({
    H: fair.reduce((s, p) => s + p.H, 0) / n,
    D: fair.reduce((s, p) => s + p.D, 0) / n,
    A: fair.reduce((s, p) => s + p.A, 0) / n,
  });
  const times = quotes.map(q => Date.parse(q.updatedAt));
  return {
    market: {
      probabilities,
      quotes,
      bookmakerCount: n,
      averageOverround: quotes.reduce((s, q) => s + q.overround, 0) / n,
      method: methods.size === 1 ? (methods.values().next().value as 'power' | 'proportional') : 'mixed',
      latestUpdate: new Date(Math.max(...times)).toISOString(),
      oldestUpdate: new Date(Math.min(...times)).toISOString(),
      eventId: event.id,
      commenceTime: event.commence_time,
    },
  };
}

export function attachMarkets(matches: readonly MatchRecord[], events: readonly OddsEvent[], opts: MarketOptions): AttachedMarkets {
  const markets = new Map<number, MarketProbs>();
  const rejected: MarketRejection[] = [];
  const usedEvents = new Set<string>();
  for (const m of matches) {
    const { market, reason } = marketFor(m, events, opts);
    if (market) { markets.set(m.id, market); usedEvents.add(market.eventId); }
    else if (reason) rejected.push({ matchId: m.id, reason });
  }
  const unmatchedEvents = events
    .filter(e => !usedEvents.has(e.id))
    .map(e => ({ eventId: e.id, home: e.home_team, away: e.away_team, commenceTime: e.commence_time }));
  return { markets, rejected, unmatchedEvents };
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; headers?: { get(name: string): string | null } }>;

export interface OddsFetchResult { events: OddsEvent[]; requestsRemaining: number | null }

/** Liest den aktuellen Bundesliga-h2h-Markt. Der Key kommt vom Aufrufer (Server/Skript). */
export async function fetchOddsEvents(apiKey: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike): Promise<OddsFetchResult> {
  if (!apiKey) throw new Error('ODDS_API_KEY fehlt');
  const url = `${ODDS_API_BASE}/sports/${SPORT_KEY}/odds/?apiKey=${encodeURIComponent(apiKey)}&regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Odds API: HTTP ${res.status}`);
  const events = (await res.json()) as OddsEvent[];
  if (!Array.isArray(events)) throw new Error('Odds API: unerwartetes Format');
  const remaining = res.headers?.get('x-requests-remaining');
  return { events, requestsRemaining: remaining !== null && remaining !== undefined ? Number(remaining) : null };
}
