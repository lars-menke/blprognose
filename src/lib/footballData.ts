import type { OldbMatch } from './openligadb';

// Fallback-Datenquelle, falls OpenLigaDB ausfaellt oder eine Saison (noch)
// keine Daten liefert (z.B. kurz vor Saisonstart). football-data.org deckt
// dieselbe Liga (BL1) ab; die Antwort wird 1:1 auf das OldbMatch-Schema
// gemappt, damit buildDynST/buildForm/buildMatchEntries unveraendert bleiben.
const FD_BASE = 'https://api.football-data.org/v4';
const FD_TOKEN = import.meta.env.VITE_FOOTBALLDATA_API_KEY ?? '';

type FdMatch = {
  matchday: number;
  utcDate: string;
  status: string;
  homeTeam: { name: string; shortName: string };
  awayTeam: { name: string; shortName: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

function toOldbMatch(m: FdMatch): OldbMatch {
  const finished = m.status === 'FINISHED';
  const g1 = m.score.fullTime.home;
  const g2 = m.score.fullTime.away;
  return {
    group: { groupOrderID: m.matchday },
    team1: { teamName: m.homeTeam.name, shortName: m.homeTeam.shortName },
    team2: { teamName: m.awayTeam.name, shortName: m.awayTeam.shortName },
    matchDateTimeUTC: m.utcDate,
    matchIsFinished: finished,
    matchResults: finished && g1 !== null && g2 !== null
      ? [{ resultTypeID: 2, pointsTeam1: g1, pointsTeam2: g2 }]
      : [],
  };
}

export async function fetchFootballDataSeason(season: number): Promise<OldbMatch[]> {
  if (!FD_TOKEN) return [];
  try {
    const r = await fetch(`${FD_BASE}/competitions/BL1/matches?season=${season}`, {
      headers: { 'X-Auth-Token': FD_TOKEN },
    });
    if (!r.ok) return [];
    const json: { matches: FdMatch[] } = await r.json();
    return (json.matches ?? []).map(toOldbMatch);
  } catch {
    return [];
  }
}
