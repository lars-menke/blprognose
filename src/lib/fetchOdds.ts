import type { MarketProbs } from './poisson';

const ODDS_KEY = import.meta.env.VITE_ODDS_API_KEY ?? '';
const CACHE_KEY = 'bl_odds_events_v1';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

// Rohe (nicht entvigte) Dezimalquoten je Seite -- gemittelt ueber alle
// Buchmacher, inkl. Marge. Fuers Wett-Radar (EV braucht echte Auszahlquoten,
// nicht die faire Modell-Marktwahrscheinlichkeit aus MarketProbs).
export type RawOdds = { h: number; d: number; a: number };

// The Odds API uses English/simplified team names
const ODDS_TEAM_MAP: Record<string, string> = {
  'FC Bayern Munich': 'FCB', 'Bayern Munich': 'FCB',
  'Borussia Dortmund': 'BVB',
  'RB Leipzig': 'RBL', 'RasenBallsport Leipzig': 'RBL',
  'Bayer Leverkusen': 'B04', 'Bayer 04 Leverkusen': 'B04',
  'Eintracht Frankfurt': 'SGE',
  'VfB Stuttgart': 'VFB',
  'SC Freiburg': 'SCF',
  'TSG Hoffenheim': 'TSG', '1899 Hoffenheim': 'TSG',
  'Borussia Monchengladbach': 'BMG', 'Borussia Mönchengladbach': 'BMG',
  'FC Augsburg': 'FCA',
  'Werder Bremen': 'SVW', 'SV Werder Bremen': 'SVW',
  'Mainz 05': 'MAI', 'FSV Mainz 05': 'MAI', '1. FSV Mainz 05': 'MAI',
  'VfL Wolfsburg': 'WOB',
  'FC St. Pauli': 'STP', 'St. Pauli': 'STP',
  'Union Berlin': 'UNI', '1. FC Union Berlin': 'UNI',
  'Heidenheim': 'HEI', '1. FC Heidenheim': 'HEI', '1. FC Heidenheim 1846': 'HEI',
  'Hamburger SV': 'HSV',
  'FC Koln': 'KOE', '1. FC Köln': 'KOE', 'FC Köln': 'KOE',
};

type OddsEvent = {
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number }>;
    }>;
  }>;
};

function devigOdds(events: OddsEvent[]): Record<string, MarketProbs> {
  const result: Record<string, MarketProbs> = {};

  for (const ev of events) {
    const hCode = ODDS_TEAM_MAP[ev.home_team];
    const aCode = ODDS_TEAM_MAP[ev.away_team];
    if (!hCode || !aCode) continue;

    // Average implied probabilities across all bookmakers (removes overround)
    let sumH = 0, sumD = 0, sumA = 0, count = 0;

    for (const bk of ev.bookmakers) {
      const h2h = bk.markets.find(m => m.key === 'h2h');
      if (!h2h) continue;
      const hOut = h2h.outcomes.find(o => o.name === ev.home_team);
      const dOut = h2h.outcomes.find(o => o.name === 'Draw');
      const aOut = h2h.outcomes.find(o => o.name === ev.away_team);
      if (!hOut || !dOut || !aOut) continue;

      const rawH = 1 / hOut.price;
      const rawD = 1 / dOut.price;
      const rawA = 1 / aOut.price;
      const tot = rawH + rawD + rawA;

      sumH += rawH / tot;
      sumD += rawD / tot;
      sumA += rawA / tot;
      count++;
    }

    if (!count) continue;

    result[`${hCode}-${aCode}`] = {
      h: +((sumH / count) * 100).toFixed(1),
      d: +((sumD / count) * 100).toFixed(1),
      a: +((sumA / count) * 100).toFixed(1),
    };
  }

  return result;
}

// Gemittelte Dezimalquoten (inkl. Marge) je Seite -- die tatsaechlich
// erzielbare Auszahlung, im Gegensatz zu den entvigten MarketProbs.
function averageRawOdds(events: OddsEvent[]): Record<string, RawOdds> {
  const result: Record<string, RawOdds> = {};

  for (const ev of events) {
    const hCode = ODDS_TEAM_MAP[ev.home_team];
    const aCode = ODDS_TEAM_MAP[ev.away_team];
    if (!hCode || !aCode) continue;

    let sumH = 0, sumD = 0, sumA = 0, count = 0;
    for (const bk of ev.bookmakers) {
      const h2h = bk.markets.find(m => m.key === 'h2h');
      if (!h2h) continue;
      const hOut = h2h.outcomes.find(o => o.name === ev.home_team);
      const dOut = h2h.outcomes.find(o => o.name === 'Draw');
      const aOut = h2h.outcomes.find(o => o.name === ev.away_team);
      if (!hOut || !dOut || !aOut) continue;
      sumH += hOut.price; sumD += dOut.price; sumA += aOut.price; count++;
    }
    if (!count) continue;

    result[`${hCode}-${aCode}`] = {
      h: +(sumH / count).toFixed(2),
      d: +(sumD / count).toFixed(2),
      a: +(sumA / count).toFixed(2),
    };
  }

  return result;
}

async function fetchOddsEvents(): Promise<OddsEvent[]> {
  if (!ODDS_KEY) return [];

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds/` +
      `?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const events: OddsEvent[] = await r.json();

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: events }));
    } catch { /* storage full */ }

    return events;
  } catch {
    return [];
  }
}

export async function fetchOdds(): Promise<Record<string, MarketProbs>> {
  const events = await fetchOddsEvents();
  return devigOdds(events);
}

// Fuer das Wett-Radar: rohe Dezimalquoten statt entvigter Modell-Wahrscheinlichkeiten.
export async function fetchRawOdds(): Promise<Record<string, RawOdds>> {
  const events = await fetchOddsEvents();
  return averageRawOdds(events);
}
