import { describe, it, expect } from 'vitest';
import { buildDynSTWithPriors, buildDynST, type OldbMatch } from './openligadb';
import type { TeamStats } from './poisson';

function finishedMatch(nr: number, homeName: string, awayName: string, g1: number, g2: number): OldbMatch {
  return {
    group: { groupOrderID: nr },
    team1: { teamName: homeName, shortName: homeName },
    team2: { teamName: awayName, shortName: awayName },
    matchDateTimeUTC: new Date(2026, 7, nr).toISOString(),
    matchIsFinished: true,
    matchResults: [{ resultTypeID: 2, pointsTeam1: g1, pointsTeam2: g2 }],
  };
}

function scheduledMatch(nr: number, homeName: string, awayName: string): OldbMatch {
  return {
    group: { groupOrderID: nr },
    team1: { teamName: homeName, shortName: homeName },
    team2: { teamName: awayName, shortName: awayName },
    matchDateTimeUTC: new Date(2026, 7, nr).toISOString(),
    matchIsFinished: false,
    matchResults: [],
  };
}

const PRIOR: Record<string, TeamStats> = {
  FCB: { rank: 1, hGF: 2.5, hGA: 0.6, aGF: 2.0, aGA: 1.0 },
  BVB: { rank: 2, hGF: 2.0, hGA: 0.9, aGF: 1.5, aGA: 1.2 },
};

describe('buildDynSTWithPriors — Kaltstart Spieltag 1-5', () => {
  it('nutzt bei 0 Live-Spielen ausschliesslich den Prior', () => {
    const out = buildDynSTWithPriors([], 1, PRIOR);
    expect(out.FCB).toEqual(PRIOR.FCB);
  });

  it('blendet Live-Statistik mit Gewicht n/(n+6) ein', () => {
    const all = [finishedMatch(1, 'FC Bayern München', 'Borussia Dortmund', 4, 0)];
    const out = buildDynSTWithPriors(all, 2, PRIOR);
    const live = buildDynST(all, 2);
    const w = 1 / (1 + 6);
    const expectedHGF = (1 - w) * PRIOR.FCB.hGF + w * live.FCB.hGF;
    expect(out.FCB.hGF).toBeCloseTo(expectedHGF, 2);
  });

  it('nutzt Liga-Durchschnitt minus Aufsteiger-Malus fuer Teams ohne Vorsaisondaten', () => {
    const all = [finishedMatch(1, 'FC St. Pauli', 'FC Bayern München', 0, 3)];
    const out = buildDynSTWithPriors(all, 2, PRIOR);
    const leagueAvgHGF = (PRIOR.FCB.hGF + PRIOR.BVB.hGF) / 2;
    // St. Pauli war nicht im Prior -> Aufsteiger-Malus, liegt unter dem Liga-Schnitt.
    expect(out.STP.hGF).toBeLessThan(leagueAvgHGF);
  });

  it('faellt ohne Vorsaisondaten auf reine Live-Statistik zurueck', () => {
    const all = [finishedMatch(1, 'FC Bayern München', 'Borussia Dortmund', 4, 0)];
    const withNull = buildDynSTWithPriors(all, 2, null);
    const live = buildDynST(all, 2);
    expect(withNull).toEqual(live);
  });

  // Regression: Die Liga-Zugehoerigkeit muss aus dem Spielplan kommen, nicht
  // aus den bereits gespielten Partien. Sonst fehlt an Spieltag 1 jeder
  // Aufsteiger komplett -- er ist weder in der Live-Statistik (nichts gespielt)
  // noch im Vorsaison-Prior (war nicht in der Liga) -- und faellt auf die
  // veralteten FALLBACK_STATS durch, genau dort wo der Prior gebraucht wird.
  it('gibt dem Aufsteiger schon an Spieltag 1 einen Prior', () => {
    const spielplan = [scheduledMatch(1, 'FC St. Pauli', 'FC Bayern München')];
    const out = buildDynSTWithPriors(spielplan, 1, PRIOR);
    expect(out.STP).toBeDefined();
    const leagueAvgHGF = (PRIOR.FCB.hGF + PRIOR.BVB.hGF) / 2;
    expect(out.STP.hGF).toBeLessThan(leagueAvgHGF); // Aufsteiger-Malus greift
  });

  it('nimmt Absteiger der Vorsaison nicht in die aktuelle Liga auf', () => {
    const spielplan = [scheduledMatch(1, 'FC St. Pauli', 'FC Bayern München')];
    const out = buildDynSTWithPriors(spielplan, 1, PRIOR);
    expect(out.BVB).toBeUndefined(); // steht nicht im Spielplan
    expect(Object.keys(out).sort()).toEqual(['FCB', 'STP']);
  });
});
