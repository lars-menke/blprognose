import type { TeamStats, FormData, MarketProbs } from './poisson';

export const OLDB_BASE = 'https://api.openligadb.de';
export const OLDB_LEAGUE = 'bl1';
export const OLDB_SEASON = '2025';

export const TEAM_CODE_MAP: Record<string, string> = {
  'FC Bayern München': 'FCB', 'Bayern München': 'FCB',
  'Borussia Dortmund': 'BVB',
  'TSG 1899 Hoffenheim': 'TSG', 'TSG Hoffenheim': 'TSG',
  'VfB Stuttgart': 'VFB',
  'RB Leipzig': 'RBL',
  'Bayer 04 Leverkusen': 'B04', 'Bayer Leverkusen': 'B04',
  'SC Freiburg': 'SCF',
  'Eintracht Frankfurt': 'SGE',
  '1. FC Union Berlin': 'UNI', 'Union Berlin': 'UNI',
  'FC Augsburg': 'FCA',
  'Hamburger SV': 'HSV',
  '1. FC Köln': 'KOE', 'FC Köln': 'KOE',
  '1. FSV Mainz 05': 'MAI', 'FSV Mainz 05': 'MAI', 'Mainz 05': 'MAI', 'Mainz': 'MAI',
  'Borussia Mönchengladbach': 'BMG',
  'VfL Wolfsburg': 'WOB',
  'FC St. Pauli': 'STP',
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

export async function fetchSeason(): Promise<OldbMatch[]> {
  if (_seasonCache) return _seasonCache;
  const r = await fetch(`${OLDB_BASE}/getmatchdata/${OLDB_LEAGUE}/${OLDB_SEASON}`);
  if (!r.ok) throw new Error(`OpenLigaDB HTTP ${r.status}`);
  _seasonCache = await r.json();
  return _seasonCache!;
}

export async function fetchPrevSeason(): Promise<OldbMatch[]> {
  if (_prevSeasonCache) return _prevSeasonCache;
  try {
    const prev = String(Number(OLDB_SEASON) - 1);
    const r = await fetch(`${OLDB_BASE}/getmatchdata/${OLDB_LEAGUE}/${prev}`);
    if (!r.ok) return [];
    _prevSeasonCache = await r.json();
    return _prevSeasonCache!;
  } catch { return []; }
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
      return [{
        id: `${hC.toLowerCase()}-${aC.toLowerCase()}-${nr}`,
        home: hC,
        away: aC,
        kickoff: fmtKickoff(m.matchDateTimeUTC ?? m.matchDateTime),
        p: oddsMap[`${hC}-${aC}`] ?? null,
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
