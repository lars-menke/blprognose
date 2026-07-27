import type { TeamStats, FormData, MarketProbs } from './poisson';
import { fetchFootballDataSeason } from './footballData';
import { getFrozenOdds } from './learnLog';

export const OLDB_BASE = 'https://api.openligadb.de';
export const OLDB_LEAGUE = 'bl1';
export const OLDB_SEASON = '2026';

export const TEAM_CODE_MAP: Record<string, string> = {
  'FC Bayern München': 'FCB', 'Bayern München': 'FCB', 'FC Bayern Munich': 'FCB',
  'Borussia Dortmund': 'BVB',
  'TSG 1899 Hoffenheim': 'TSG', 'TSG Hoffenheim': 'TSG',
  'VfB Stuttgart': 'VFB',
  'RB Leipzig': 'RBL', 'RasenBallsport Leipzig': 'RBL',
  'Bayer 04 Leverkusen': 'B04', 'Bayer Leverkusen': 'B04',
  'SC Freiburg': 'SCF',
  'Eintracht Frankfurt': 'SGE',
  '1. FC Union Berlin': 'UNI', 'Union Berlin': 'UNI',
  'FC Augsburg': 'FCA',
  'Hamburger SV': 'HSV',
  '1. FC Köln': 'KOE', 'FC Köln': 'KOE',
  '1. FSV Mainz 05': 'MAI', 'FSV Mainz 05': 'MAI', 'Mainz 05': 'MAI', 'Mainz': 'MAI',
  'Borussia Mönchengladbach': 'BMG', 'Borussia M\'gladbach': 'BMG',
  'VfL Wolfsburg': 'WOB',
  'FC St. Pauli': 'STP', 'FC St. Pauli 1910': 'STP',
  'SV Werder Bremen': 'SVW', 'Werder Bremen': 'SVW',
  '1. FC Heidenheim 1846': 'HEI', '1. FC Heidenheim': 'HEI',
};

export type OldbMatch = {
  group: { groupOrderID: number };
  team1: { teamName: string; shortName: string };
  team2: { teamName: string; shortName: string };
  matchDateTimeUTC?: string;
  matchDateTime?: string;
  matchIsFinished: boolean;
  matchResults?: Array<{ resultTypeID: number; pointsTeam1: number; pointsTeam2: number }>;
};

export type MatchEntry = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  kickoffISO: string;
  p: MarketProbs | null;
  hForm: FormData;
  aForm: FormData;
  actual: { g1: number; g2: number } | null;
};

export function resolveCode(t: { teamName: string; shortName: string }): string | null {
  return TEAM_CODE_MAP[t.teamName] ?? TEAM_CODE_MAP[t.shortName] ?? null;
}

function getFinalGoals(m: OldbMatch): { g1: number; g2: number } | null {
  const r = m.matchResults?.find(x => x.resultTypeID === 2);
  return r ? { g1: r.pointsTeam1, g2: r.pointsTeam2 } : null;
}

function fmtKickoff(utcStr?: string): string {
  if (!utcStr) return 'Zeit folgt';
  const d = new Date(utcStr);
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

let _seasonCache: OldbMatch[] | null = null;
let _prevSeasonCache: OldbMatch[] | null = null;

// OpenLigaDB ist die bewaehrte Primaerquelle. Liefert sie nichts Brauchbares
// (Ausfall, leere Antwort vor Saisonstart), springt football-data.org (BL1)
// als Fallback ein. Beide werden auf dasselbe OldbMatch-Schema gemappt, damit
// der Rest der App (buildDynST, buildForm, buildMatchEntries) unveraendert bleibt.
export async function fetchSeason(): Promise<OldbMatch[]> {
  if (_seasonCache) return _seasonCache;
  try {
    const r = await fetch(`${OLDB_BASE}/getmatchdata/${OLDB_LEAGUE}/${OLDB_SEASON}`);
    if (!r.ok) throw new Error(`OpenLigaDB HTTP ${r.status}`);
    const data: OldbMatch[] = await r.json();
    if (!data.length) throw new Error('OpenLigaDB: leere Saison');
    _seasonCache = data;
    return _seasonCache;
  } catch (e) {
    const fallback = await fetchFootballDataSeason(Number(OLDB_SEASON));
    if (fallback.length) { _seasonCache = fallback; return fallback; }
    throw e instanceof Error ? e : new Error('Ladefehler');
  }
}

export async function fetchPrevSeason(): Promise<OldbMatch[]> {
  if (_prevSeasonCache) return _prevSeasonCache;
  const prev = String(Number(OLDB_SEASON) - 1);
  try {
    const r = await fetch(`${OLDB_BASE}/getmatchdata/${OLDB_LEAGUE}/${prev}`);
    if (!r.ok) throw new Error(`OpenLigaDB HTTP ${r.status}`);
    const data: OldbMatch[] = await r.json();
    if (!data.length) throw new Error('OpenLigaDB: leere Vorsaison');
    _prevSeasonCache = data;
    return _prevSeasonCache;
  } catch {
    const fallback = await fetchFootballDataSeason(Number(prev));
    _prevSeasonCache = fallback;
    return fallback;
  }
}

export function buildDynST(all: OldbMatch[], beforeNr: number): Record<string, TeamStats> {
  const acc: Record<string, {
    hGF: number; hGA: number; hN: number;
    aGF: number; aGA: number; aN: number;
    pts: number; gd: number;
  }> = {};

  all.forEach(m => {
    if (m.group.groupOrderID >= beforeNr) return;
    const res = getFinalGoals(m);
    if (!res) return;
    const h = resolveCode(m.team1), a = resolveCode(m.team2);
    if (!h || !a) return;

    acc[h] ??= { hGF: 0, hGA: 0, hN: 0, aGF: 0, aGA: 0, aN: 0, pts: 0, gd: 0 };
    acc[a] ??= { hGF: 0, hGA: 0, hN: 0, aGF: 0, aGA: 0, aN: 0, pts: 0, gd: 0 };

    acc[h].hGF += res.g1; acc[h].hGA += res.g2; acc[h].hN++;
    acc[a].aGF += res.g2; acc[a].aGA += res.g1; acc[a].aN++;

    const gd = res.g1 - res.g2;
    acc[h].gd += gd;
    acc[a].gd -= gd;
    if (res.g1 > res.g2) { acc[h].pts += 3; }
    else if (res.g1 === res.g2) { acc[h].pts += 1; acc[a].pts += 1; }
    else { acc[a].pts += 3; }
  });

  // Sort by points desc, then goal difference desc → real league rank
  const sorted = Object.entries(acc).sort(([, a], [, b]) =>
    b.pts !== a.pts ? b.pts - a.pts : b.gd - a.gd
  );
  const rankMap: Record<string, number> = {};
  sorted.forEach(([code], i) => { rankMap[code] = i + 1; });

  const out: Record<string, TeamStats> = {};
  Object.entries(acc).forEach(([code, s]) => {
    out[code] = {
      rank: rankMap[code] ?? 9,
      hGF: s.hN > 0 ? +(s.hGF / s.hN).toFixed(2) : 1.3,
      hGA: s.hN > 0 ? +(s.hGA / s.hN).toFixed(2) : 1.4,
      aGF: s.aN > 0 ? +(s.aGF / s.aN).toFixed(2) : 1.1,
      aGA: s.aN > 0 ? +(s.aGA / s.aN).toFixed(2) : 1.5,
    };
  });
  return out;
}

// Aufsteiger-Malus fuer Teams ohne Vorsaisondaten in der aktuellen Liga:
// schwaecher im Angriff, schwaecher in der Abwehr als der Liga-Durchschnitt.
const PROMOTED_GF_MALUS = 0.85;
const PROMOTED_GA_MALUS = 1.15;

function leagueAverage(stats: Record<string, TeamStats>): Omit<TeamStats, 'rank'> {
  const teams = Object.values(stats);
  if (!teams.length) return { hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };
  const sum = teams.reduce((s, t) => ({
    hGF: s.hGF + t.hGF, hGA: s.hGA + t.hGA, aGF: s.aGF + t.aGF, aGA: s.aGA + t.aGA,
  }), { hGF: 0, hGA: 0, aGF: 0, aGA: 0 });
  const n = teams.length;
  return { hGF: sum.hGF / n, hGA: sum.hGA / n, aGF: sum.aGF / n, aGA: sum.aGA / n };
}

/**
 * Wie buildDynST, blendet die noch duenne Live-Statistik aber glatt mit einem
 * Prior aus der Vorsaison (oder Liga-Durchschnitt minus Aufsteiger-Malus, wenn
 * das Team letzte Saison nicht in der Liga war). Gewicht w = n_live / (n_live + 6):
 * bei 0 gespielten Partien zaehlt nur der Prior, ab ~6 Spielen ueberwiegt die
 * Live-Statistik zunehmend. Deckt Spieltag 1-5 (Kaltstart) und faedt danach
 * von selbst aus, ohne Sonderfall im Aufrufer.
 */
export function buildDynSTWithPriors(
  all: OldbMatch[],
  beforeNr: number,
  prevSeasonStats: Record<string, TeamStats> | null,
): Record<string, TeamStats> {
  const live = buildDynST(all, beforeNr);
  if (!prevSeasonStats || !Object.keys(prevSeasonStats).length) return live;

  const leagueAvg = leagueAverage(prevSeasonStats);
  const promotedPrior: TeamStats = {
    rank: 16,
    hGF: +(leagueAvg.hGF * PROMOTED_GF_MALUS).toFixed(2),
    hGA: +(leagueAvg.hGA * PROMOTED_GA_MALUS).toFixed(2),
    aGF: +(leagueAvg.aGF * PROMOTED_GF_MALUS).toFixed(2),
    aGA: +(leagueAvg.aGA * PROMOTED_GA_MALUS).toFixed(2),
  };

  const played: Record<string, number> = {};
  all.forEach(m => {
    if (m.group.groupOrderID >= beforeNr) return;
    if (!getFinalGoals(m)) return;
    const h = resolveCode(m.team1), a = resolveCode(m.team2);
    if (h) played[h] = (played[h] ?? 0) + 1;
    if (a) played[a] = (played[a] ?? 0) + 1;
  });

  const out: Record<string, TeamStats> = {};
  const codes = new Set([...Object.keys(live), ...Object.keys(prevSeasonStats)]);
  codes.forEach(code => {
    const liveStat = live[code];
    const prior = prevSeasonStats[code] ?? promotedPrior;
    if (!liveStat) { out[code] = prior; return; }
    const n = played[code] ?? 0;
    const w = n / (n + 6);
    out[code] = {
      rank: liveStat.rank,
      hGF: +((1 - w) * prior.hGF + w * liveStat.hGF).toFixed(2),
      hGA: +((1 - w) * prior.hGA + w * liveStat.hGA).toFixed(2),
      aGF: +((1 - w) * prior.aGF + w * liveStat.aGF).toFixed(2),
      aGA: +((1 - w) * prior.aGA + w * liveStat.aGA).toFixed(2),
    };
  });
  return out;
}

export function buildForm(all: OldbMatch[], code: string, beforeNr: number, home: boolean): FormData {
  const finished = all.filter(m => m.group.groupOrderID < beforeNr && !!getFinalGoals(m));
  const byTime = (a: OldbMatch, b: OldbMatch) =>
    new Date(b.matchDateTimeUTC ?? b.matchDateTime ?? '').getTime() -
    new Date(a.matchDateTimeUTC ?? a.matchDateTime ?? '').getTime();

  // Role-specific last 5 (home games for home role, away games for away role)
  const rolePrev = finished
    .filter(m => home ? resolveCode(m.team1) === code : resolveCode(m.team2) === code)
    .sort(byTime)
    .slice(0, 5);

  // Fall back to overall recent form when fewer than 3 role-specific games exist
  const prev = rolePrev.length >= 3
    ? rolePrev
    : finished
        .filter(m => resolveCode(m.team1) === code || resolveCode(m.team2) === code)
        .sort(byTime)
        .slice(0, 5);

  if (!prev.length) return null;

  // Exponential decay: most recent game = weight 1.0, each older = * 0.72
  const DECAY = 0.72;
  const weights = prev.map((_, i) => Math.pow(DECAY, i));
  const totalW = weights.reduce((s, w) => s + w, 0);

  let gf = 0, ga = 0;
  prev.forEach((m, i) => {
    const res = getFinalGoals(m)!;
    const isHome = resolveCode(m.team1) === code;
    const w = weights[i] / totalW;
    gf += (isHome ? res.g1 : res.g2) * w;
    ga += (isHome ? res.g2 : res.g1) * w;
  });
  return { gf: +gf.toFixed(2), ga: +ga.toFixed(2) };
}

export function buildMatchEntries(
  all: OldbMatch[],
  nr: number,
  oddsMap: Record<string, MarketProbs> = {},
): MatchEntry[] {
  return all
    .filter(m => m.group.groupOrderID === nr)
    .flatMap(m => {
      const hC = resolveCode(m.team1), aC = resolveCode(m.team2);
      if (!hC || !aC) return [];
      const id = `${hC.toLowerCase()}-${aC.toLowerCase()}-${nr}`;
      const kickoffISO = m.matchDateTimeUTC ?? m.matchDateTime ?? '';
      return [{
        id,
        home: hC,
        away: aC,
        kickoff: fmtKickoff(m.matchDateTimeUTC ?? m.matchDateTime),
        kickoffISO,
        p: getFrozenOdds(id, kickoffISO, oddsMap[`${hC}-${aC}`] ?? null),
        hForm: buildForm(all, hC, nr, true),
        aForm: buildForm(all, aC, nr, false),
        actual: m.matchIsFinished ? (getFinalGoals(m) ?? null) : null,
      }];
    });
}

export function detectCurrentSpieltag(all: OldbMatch[]): number {
  const now = new Date();
  const begun = all
    .filter(m => new Date(m.matchDateTimeUTC ?? m.matchDateTime ?? '') <= now)
    .map(m => m.group.groupOrderID);
  if (!begun.length) return 1;
  const latest = Math.max(...begun);
  const allFinished = all
    .filter(m => m.group.groupOrderID === latest)
    .every(m => m.matchIsFinished);
  return allFinished && latest < 34 ? latest + 1 : latest;
}

function normalizeLogoUrl(url: string): string {
  const m = url.match(/^(.+\/commons\/)thumb\/(.+\.svg)\/\d+px-.+\.png$/);
  return m ? m[1] + m[2] : url;
}

export async function fetchLogos(): Promise<Record<string, string>> {
  const logos: Record<string, string> = {};
  try {
    const r = await fetch(`${OLDB_BASE}/getavailableteams/${OLDB_LEAGUE}/${OLDB_SEASON}`);
    if (!r.ok) return logos;
    const teams: Array<{ teamName: string; shortName: string; teamIconUrl: string }> = await r.json();
    teams.forEach(t => {
      const code = resolveCode(t);
      if (code && t.teamIconUrl) logos[code] = normalizeLogoUrl(t.teamIconUrl);
    });
  } catch { /* kein Netz → leeres Objekt */ }
  return logos;
}
