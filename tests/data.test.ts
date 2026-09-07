import { describe, it, expect } from 'vitest';
import { normalizeSeason, pickFinalResult, validateSeason, teamsOf, OpenLigaSource, type RawMatch } from '../src/data/openliga.ts';
import { normalizeLiveMatch, liveStatus } from '../src/data/live.ts';
import { seasonOf, seasonLabel } from '../src/data/season.ts';

function raw(id: number, over: Partial<RawMatch> = {}): RawMatch {
  return {
    matchID: id,
    matchDateTimeUTC: '2026-08-22T13:30:00Z',
    group: { groupOrderID: 1 },
    team1: { teamId: 40, teamName: 'FC Bayern München', shortName: 'Bayern' },
    team2: { teamId: 7, teamName: 'Borussia Dortmund', shortName: 'Dortmund' },
    matchIsFinished: true,
    matchResults: [
      { resultTypeID: 1, resultOrderID: 1, pointsTeam1: 1, pointsTeam2: 0 },
      { resultTypeID: 2, resultOrderID: 2, pointsTeam1: 3, pointsTeam2: 1 },
    ],
    ...over,
  };
}

describe('Saisonzuordnung', () => {
  it('wechselt am 1. Juli', () => {
    expect(seasonOf(new Date('2026-06-30T23:59:59Z'))).toBe(2025);
    expect(seasonOf(new Date('2026-07-01T00:00:00Z'))).toBe(2026);
    expect(seasonLabel(2026)).toBe('2026/27');
  });
});

describe('Ergebniswahl', () => {
  it('bevorzugt resultTypeID 2', () => {
    expect(pickFinalResult(raw(1).matchResults)).toEqual({ home: 3, away: 1 });
  });
  it('faellt auf die hoechste resultOrderID zurueck', () => {
    const r = pickFinalResult([
      { resultTypeID: 1, resultOrderID: 1, pointsTeam1: 1, pointsTeam2: 0 },
      { resultTypeID: 9, resultOrderID: 5, pointsTeam1: 2, pointsTeam2: 2 },
    ]);
    expect(r).toEqual({ home: 2, away: 2 });
  });
  it('verwirft ungueltige Tore (negativ, nicht ganzzahlig, NaN)', () => {
    expect(pickFinalResult([{ resultTypeID: 2, resultOrderID: 2, pointsTeam1: -1, pointsTeam2: 0 }])).toBeNull();
    expect(pickFinalResult([{ resultTypeID: 2, resultOrderID: 2, pointsTeam1: 1.5, pointsTeam2: 0 }])).toBeNull();
    expect(pickFinalResult([{ resultTypeID: 2, resultOrderID: 2, pointsTeam1: NaN, pointsTeam2: 0 }])).toBeNull();
  });
});

describe('Normalisierung und Deduplizierung', () => {
  it('bildet auf Team-IDs ab und markiert nur Spiele mit gueltigem Endstand als beendet', () => {
    const { matches, issues } = normalizeSeason([raw(1), raw(2, { matchIsFinished: false, matchResults: [] })], 'bl1', 2026);
    expect(matches).toHaveLength(2);
    expect(matches[0].homeId).toBe(40);
    expect(matches[0].finished).toBe(true);
    expect(matches[1].finished).toBe(false);
    expect(matches[1].homeGoals).toBeNull();
    expect(issues).toHaveLength(0);
  });
  it('meldet widerspruechliche Dubletten VOR der Deduplizierung', () => {
    const dup = raw(1, { matchResults: [{ resultTypeID: 2, resultOrderID: 2, pointsTeam1: 0, pointsTeam2: 0 }] });
    const { matches, issues } = normalizeSeason([raw(1), dup], 'bl1', 2026);
    expect(matches).toHaveLength(1);
    expect(issues.some(i => i.code === 'conflicting-duplicate')).toBe(true);
  });
  it('meldet abgeschlossene Spiele ohne gueltiges Ergebnis', () => {
    const { matches, issues } = normalizeSeason([raw(1, { matchResults: [] })], 'bl1', 2026);
    expect(matches[0].finished).toBe(false);
    expect(issues.some(i => i.code === 'invalid-goals')).toBe(true);
  });
});

describe('Spielplan-Plausibilitaet', () => {
  it('erkennt falsche Vereinsanzahl und ungerade Spieltage', () => {
    const { matches } = normalizeSeason([raw(1), raw(2, { team1: { teamId: 9, teamName: 'X' }, team2: { teamId: 10, teamName: 'Y' } })], 'bl1', 2026);
    const issues = validateSeason(matches);
    expect(issues.some(i => i.code === 'team-count' && i.level === 'error')).toBe(true);
    expect(issues.some(i => i.code === 'matchday-size')).toBe(true);
    expect(teamsOf(matches)).toHaveLength(4);
  });
});

describe('OpenLigaSource', () => {
  it('nutzt die injizierte fetch-Funktion und liefert normalisierte Spiele', async () => {
    const calls: string[] = [];
    const src = new OpenLigaSource({
      fetch: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => [raw(1)] }; },
    });
    const m = await src.loadSeason('bl1', 2026);
    expect(calls[0]).toBe('https://api.openligadb.de/getmatchdata/bl1/2026');
    expect(m[0].season).toBe(2026);
  });
  it('wirft bei HTTP-Fehler statt leer zurueckzugeben', async () => {
    const src = new OpenLigaSource({ fetch: async () => ({ ok: false, status: 503, json: async () => null }) });
    await expect(src.loadSeason('bl1', 2026)).rejects.toThrow('HTTP 503');
  });
});

describe('Live-Normalisierung (Review-Fehler 2)', () => {
  const now = new Date('2026-08-22T15:45:00Z');
  it('nutzt bei abgeschlossenem Spiel den offiziellen Endstand, auch wenn die Torliste nur bis 1:0 reicht', () => {
    const m = raw(1, {
      matchResults: [{ resultTypeID: 2, resultOrderID: 2, pointsTeam1: 5, pointsTeam2: 1 }],
      goals: [{ goalID: 1, scoreTeam1: 1, scoreTeam2: 0, matchMinute: 12 }],
    });
    const live = normalizeLiveMatch(m, now);
    expect(live.status).toBe('finished');
    expect(live.score).toEqual({ home: 5, away: 1 });
    expect(live.scoreSource).toBe('final-result');
  });
  it('nutzt bei laufendem Spiel den aktuellsten Torlisten-Eintrag, unabhaengig von der Reihenfolge', () => {
    const m = raw(1, {
      matchIsFinished: false, matchResults: [],
      goals: [
        { goalID: 3, scoreTeam1: 2, scoreTeam2: 1, matchMinute: 70 },
        { goalID: 1, scoreTeam1: 1, scoreTeam2: 0, matchMinute: 12 },
        { goalID: 2, scoreTeam1: 1, scoreTeam2: 1, matchMinute: 40 },
      ],
    });
    const live = normalizeLiveMatch(m, now);
    expect(live.status).toBe('live');
    expect(live.score).toEqual({ home: 2, away: 1 });
    expect(live.scoreSource).toBe('goal-list');
  });
  it('Statusheuristik: live nur bis 3 Stunden nach Anstoss ohne Abschlussflag', () => {
    const base = { matchIsFinished: false, matchDateTimeUTC: '2026-08-22T13:30:00Z' };
    expect(liveStatus(base, new Date('2026-08-22T13:00:00Z'))).toBe('upcoming');
    expect(liveStatus(base, new Date('2026-08-22T16:29:00Z'))).toBe('live');
    expect(liveStatus(base, new Date('2026-08-22T16:31:00Z'))).toBe('upcoming');
    expect(liveStatus({ ...base, matchIsFinished: true }, new Date('2026-08-22T13:00:00Z'))).toBe('finished');
  });
});
