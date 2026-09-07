import { describe, it, expect } from 'vitest';
import { buildMatrix, dcTau, matrixSize, outcomeProbs, poissonPmf, MIN_GOALS } from '../src/model/matrix.ts';
import { buildLayout, fitRatings, objectiveAndGradient, type FitMatch } from '../src/model/fit.ts';
import { withParams } from '../src/model/params.ts';
import { timeWeight } from '../src/model/weights.ts';
import { temper, logPool, redistribute } from '../src/model/blend.ts';
import { conditionalMode, globalMode, tipGameMode, tipPoints, roundToHundred, argmaxOutcome } from '../src/model/decision.ts';
import { deriveStats } from '../src/model/derived.ts';
import { makeLeague, simulateSeason, correlation } from './helpers/synthetic.ts';
import { mulberry32 } from '../src/model/random.ts';

const sum2 = (cells: number[][]) => cells.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);

describe('Zeitgewichtung', () => {
  it('halbiert nach einer Halbwertszeit, viertelt nach zwei', () => {
    expect(timeWeight(0, 210)).toBeCloseTo(1, 12);
    expect(timeWeight(210, 210)).toBeCloseTo(0.5, 12);
    expect(timeWeight(420, 210)).toBeCloseTo(0.25, 12);
  });
  it('gibt Spielen aus der Zukunft Gewicht 0 (kein Look-ahead)', () => {
    expect(timeWeight(-1, 210)).toBe(0);
  });
});

describe('Matrix', () => {
  it('ist normiert und die 1X2-Bloecke summieren zu 1', () => {
    const m = buildMatrix(1.6, 1.1, -0.10);
    expect(sum2(m.cells)).toBeCloseTo(1, 12);
    expect(m.probs.H + m.probs.D + m.probs.A).toBeCloseTo(1, 12);
    expect(m.cells.length).toBeGreaterThanOrEqual(MIN_GOALS + 1);
  });
  it('erweitert die Groesse bei grossen Lambdas und deckelt bei 30', () => {
    expect(matrixSize(0.3)).toBe(MIN_GOALS);          // Restmasse jenseits 10 ~ 1e-16
    expect(matrixSize(1.0)).toBe(MIN_GOALS + 1);      // P(X > 10) ~ 1e-8 > 5e-9 -> waechst um 1
    expect(matrixSize(4.5)).toBeGreaterThan(MIN_GOALS);
    expect(matrixSize(4.5)).toBeLessThanOrEqual(30);
  });
  it('entspricht bei rho = 0 dem reinen Poisson-Produkt', () => {
    const m = buildMatrix(1.4, 1.2, 0);
    const ph = poissonPmf(1.4, m.cells.length - 1), pa = poissonPmf(1.2, m.cells.length - 1);
    const total = ph.reduce((a, b) => a + b, 0) * pa.reduce((a, b) => a + b, 0);
    expect(m.cells[2][1]).toBeCloseTo(ph[2] * pa[1] / total, 12);
  });
  it('hebt mit negativem rho 0:0 und 1:1 an und senkt 0:1 und 1:0', () => {
    const p0 = buildMatrix(1.4, 1.2, 0), pn = buildMatrix(1.4, 1.2, -0.10);
    expect(pn.cells[0][0]).toBeGreaterThan(p0.cells[0][0]);
    expect(pn.cells[1][1]).toBeGreaterThan(p0.cells[1][1]);
    expect(pn.cells[0][1]).toBeLessThan(p0.cells[0][1]);
    expect(pn.cells[1][0]).toBeLessThan(p0.cells[1][0]);
  });
  it('hat innerhalb der produktiven Lambda-Grenzen nur positive Korrekturfaktoren', () => {
    for (const lH of [0.3, 1, 4.5]) for (const lA of [0.3, 1, 4.5]) {
      for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) expect(dcTau(i, j, lH, lA, -0.10)).toBeGreaterThan(0);
    }
  });
  it('Zellsummen entsprechen outcomeProbs', () => {
    const m = buildMatrix(2.1, 0.8, -0.1);
    const p = outcomeProbs(m.cells);
    expect(p.H).toBeCloseTo(m.probs.H, 12);
    expect(p.H).toBeGreaterThan(p.A);
  });
});

describe('Fit: Gradient', () => {
  it('stimmt mit zentralen Finite-Differenzen ueberein (inkl. Dixon-Coles und rho)', () => {
    const league = makeLeague(7, 8, 0.3);
    const matches = simulateSeason(league, 11).map((m, k) => ({ ...m, weight: 0.5 + (k % 3) * 0.25 }));
    const params = withParams({ estimateRho: true });
    const layout = buildLayout(matches);
    const n = layout.ids.length;
    const rng = mulberry32(3);
    const theta = new Float64Array(3 + 2 * n);
    theta[0] = 0.3; theta[1] = 0.2; theta[2] = -0.08;
    for (let k = 3; k < theta.length; k++) theta[k] = (rng() - 0.5) * 0.4;
    const cA = new Float64Array(n), cD = new Float64Array(n);
    cA[0] = -0.2; cD[1] = 0.15; // nicht-triviale Ridge-Zentren mitpruefen

    const { gradient } = objectiveAndGradient(theta, matches, layout, params, cA, cD);
    const h = 1e-6;
    let maxRel = 0;
    for (let k = 0; k < theta.length; k++) {
      const tp = Float64Array.from(theta); tp[k] += h;
      const tm = Float64Array.from(theta); tm[k] -= h;
      const fd = (objectiveAndGradient(tp, matches, layout, params, cA, cD).objective
        - objectiveAndGradient(tm, matches, layout, params, cA, cD).objective) / (2 * h);
      const rel = Math.abs(fd - gradient[k]) / Math.max(1, Math.abs(fd));
      if (rel > maxRel) maxRel = rel;
    }
    expect(maxRel).toBeLessThan(1e-5);
  });

  it('nullt den Daten-Gradienten bei gekapptem Lambda', () => {
    // Ein Team mit absurd hohem Angriff -> Lambda > 4.5 -> gekappt
    const matches: FitMatch[] = [{ homeId: 1, awayId: 2, homeGoals: 5, awayGoals: 0, weight: 1 }];
    const params = withParams();
    const layout = buildLayout(matches);
    const theta = new Float64Array(3 + 4);
    theta[0] = 0.3; theta[2] = -0.1; theta[3] = 3.0; // a_1 = 3 -> exp(3.3) >> 4.5
    const { gradient, clipped } = objectiveAndGradient(theta, matches, layout, params, new Float64Array(2), new Float64Array(2));
    expect(clipped).toBe(1);
    // Nur Ridge-Gradient bleibt fuer a_1: 2 * 4 * 3.0 = 24
    expect(gradient[3]).toBeCloseTo(24, 9);
  });
});

describe('Fit: Rueckgewinnung der Wahrheit', () => {
  it('rekonstruiert Angriff, Abwehr, Heimvorteil und Torniveau aus zwei synthetischen Saisons', () => {
    const league = makeLeague(42);
    const matches = [...simulateSeason(league, 1), ...simulateSeason(league, 2)];
    const params = withParams();
    const { ratings, diagnostics } = fitRatings(matches, { params });

    expect(diagnostics.converged).toBe(true);
    expect(diagnostics.reason).toBe('converged');
    expect(diagnostics.gradientNorm).toBeLessThanOrEqual(params.gradientTolerance);
    expect(diagnostics.adamIterations).toBeGreaterThanOrEqual(params.minIterations);
    expect(diagnostics.matches).toBe(612);

    const ids = league.teamIds;
    const ca = correlation(ids.map(i => league.truth.attack.get(i)!), ids.map(i => ratings.attack.get(i)!));
    const cd = correlation(ids.map(i => league.truth.defense.get(i)!), ids.map(i => ratings.defense.get(i)!));
    expect(ca).toBeGreaterThan(0.85);
    expect(cd).toBeGreaterThan(0.80);
    expect(ratings.home).toBeCloseTo(league.truth.home, 0.6);
    expect(Math.abs(ratings.home - league.truth.home)).toBeLessThan(0.12);
    expect(Math.abs(ratings.mu - league.truth.mu)).toBeLessThan(0.12);
    expect(ratings.rho).toBe(params.rho); // nicht geschaetzt, fest
  });

  it('zentriert Angriff und Abwehr auf Mittelwert 0', () => {
    const league = makeLeague(5);
    const { ratings } = fitRatings(simulateSeason(league, 9), { params: withParams({ maxIterations: 200 }) });
    const mean = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0) / m.size;
    expect(Math.abs(mean(ratings.attack))).toBeLessThan(1e-9);
    expect(Math.abs(mean(ratings.defense))).toBeLessThan(1e-9);
  });

  it('erreicht dasselbe Optimum unabhaengig vom Startpunkt -- Warmstart, Kaltstart, verschobene Gauge', () => {
    // Gemessen vor der Newton-Politur: Warmstart meldete "konvergiert" 4.5e-3 neben
    // dem Kaltstart-Optimum bei hoeherer Zielfunktion. Mit Gradientenkriterium
    // muessen alle Startpunkte auf dieselben Parameter fuehren.
    const league = makeLeague(8);
    const matches = simulateSeason(league, 3);
    const params = withParams();
    const cold = fitRatings(matches, { params });
    const shifted = new Map([...league.truth.attack].map(([id, v]) => [id, v + 0.7]));
    const gauge = fitRatings(matches, { params, init: { mu: -0.7, attack: shifted } });
    const warm = fitRatings(matches, { params, init: {
      mu: cold.ratings.mu, home: cold.ratings.home,
      attack: new Map([...cold.ratings.attack].map(([id, v]) => [id, v * 0.95])),
      defense: new Map([...cold.ratings.defense].map(([id, v]) => [id, v * 0.95])),
    } });
    for (const other of [gauge, warm]) {
      expect(other.diagnostics.converged).toBe(true);
      let maxDiff = Math.max(Math.abs(other.ratings.mu - cold.ratings.mu), Math.abs(other.ratings.home - cold.ratings.home));
      for (const id of league.teamIds) {
        maxDiff = Math.max(maxDiff,
          Math.abs(other.ratings.attack.get(id)! - cold.ratings.attack.get(id)!),
          Math.abs(other.ratings.defense.get(id)! - cold.ratings.defense.get(id)!));
      }
      expect(maxDiff).toBeLessThan(1e-5);
      expect(Math.abs(other.diagnostics.objective - cold.diagnostics.objective)).toBeLessThan(1e-8);
    }
  });

  it('Newton-Politur: Gradient am Ende unter der Toleranz, auch wenn Adam vorher falsch konvergiert waere', () => {
    const league = makeLeague(13);
    const matches = simulateSeason(league, 5);
    const params = withParams();
    const base = fitRatings(matches, { params });
    // Warmstart nahe am Optimum: genau der Fall, in dem Adams Schritt vorzeitig kollabiert
    const warm = fitRatings(matches, { params, init: { mu: base.ratings.mu, home: base.ratings.home, attack: base.ratings.attack, defense: base.ratings.defense } });
    expect(warm.diagnostics.gradientNorm).toBeLessThanOrEqual(params.gradientTolerance);
    expect(warm.diagnostics.converged).toBe(true);
    expect(warm.diagnostics.iterations).toBe(warm.diagnostics.adamIterations + warm.diagnostics.newtonIterations);
  });

  it('bewertet ein Team ohne Trainingsspiel ueber das Ridge-Zentrum (Aufsteiger vor Spieltag 1)', () => {
    const league = makeLeague(9, 6);
    const matches = simulateSeason(league, 4);
    const params = withParams({ maxIterations: 300 });
    const newcomer = 999;
    const { ratings } = fitRatings(matches, {
      params, teamIds: [newcomer],
      ridgeCenter: { attack: new Map([[newcomer, -0.27]]), defense: new Map([[newcomer, 0.17]]) },
    });
    // Ohne Daten zieht nur die Ridge-Strafe: Rating landet (bis auf Zentrierung) am Zentrum
    expect(ratings.attack.has(newcomer)).toBe(true);
    expect(ratings.attack.get(newcomer)!).toBeLessThan(0);
    expect(ratings.defense.get(newcomer)!).toBeGreaterThan(0);
  });

  it('behauptet ohne Daten keine Konvergenz', () => {
    const r = fitRatings([], { params: withParams(), teamIds: [1, 2] });
    expect(r.diagnostics.converged).toBe(false);
    expect(r.diagnostics.reason).toBe('no-data');
  });
});

describe('Blend', () => {
  const p = { H: 0.5, D: 0.25, A: 0.25 };
  it('Temperatur 1 ist die Identitaet, T > 1 flacht ab', () => {
    expect(temper(p, 1)).toEqual(p);
    const t = temper(p, 1.10);
    expect(t.H).toBeLessThan(p.H);
    expect(t.D).toBeGreaterThan(p.D);
    expect(t.H + t.D + t.A).toBeCloseTo(1, 12);
  });
  it('Log-Pool: alpha 0 = Modell, alpha 1 = Markt, dazwischen geometrisch', () => {
    const q = { H: 0.3, D: 0.3, A: 0.4 };
    expect(logPool(p, q, 0).H).toBeCloseTo(p.H, 12);
    expect(logPool(p, q, 1).A).toBeCloseTo(q.A, 12);
    const mid = logPool(p, q, 0.5);
    const arith = (p.H + q.H) / 2;
    expect(mid.H).not.toBeCloseTo(arith, 6); // ausdruecklich KEIN arithmetisches Mittel
  });
  it('Rueckverteilung: Bloecke summieren exakt zum Ziel, Rangfolge im Block bleibt', () => {
    const raw = buildMatrix(1.5, 1.2, -0.1);
    const target = { H: 0.6, D: 0.2, A: 0.2 };
    const fin = redistribute(raw, target);
    const p = outcomeProbs(fin.cells);
    expect(p.H).toBeCloseTo(0.6, 10);
    expect(p.D).toBeCloseTo(0.2, 10);
    expect(sum2(fin.cells)).toBeCloseTo(1, 12);
    expect(fin.cells[2][1] / fin.cells[1][0]).toBeCloseTo(raw.cells[2][1] / raw.cells[1][0], 10);
  });
});

describe('Entscheidungsregeln', () => {
  const m = buildMatrix(1.35, 1.21, -0.10); // eng: 1:1 ist global oft die groesste Zelle
  it('conditional waehlt den Score im Argmax-Ausgang, global die groesste Zelle -- beide koennen abweichen', () => {
    const c = conditionalMode(m);
    const g = globalMode(m);
    expect(argmaxOutcome(m.probs)).toBe(c.outcome);
    expect(m.cells[c.score.home][c.score.away]).toBeCloseTo(c.score.probability, 12);
    expect(g.probability).toBeGreaterThanOrEqual(c.score.probability);
    expect(c.alternatives).toHaveLength(3);
    for (const alt of c.alternatives) expect(alt.probability).toBeLessThanOrEqual(c.score.probability);
  });
  it('Tie-Break bei exakt gleichen 1X2-Massen: H vor D vor A', () => {
    expect(argmaxOutcome({ H: 1 / 3, D: 1 / 3, A: 1 / 3 })).toBe('H');
    expect(argmaxOutcome({ H: 0.2, D: 0.4, A: 0.4 })).toBe('D');
  });
  it('4/3/2-Punkteregel', () => {
    expect(tipPoints({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(4);
    expect(tipPoints({ home: 2, away: 1 }, { home: 3, away: 2 })).toBe(3);
    expect(tipPoints({ home: 2, away: 1 }, { home: 1, away: 0 })).toBe(3);
    expect(tipPoints({ home: 2, away: 1 }, { home: 3, away: 1 })).toBe(2);
    expect(tipPoints({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(3);
    expect(tipPoints({ home: 2, away: 1 }, { home: 0, away: 1 })).toBe(0);
  });
  it('tipGame maximiert erwartete Punkte und bleibt in [0,4]', () => {
    const t = tipGameMode(m, 6);
    expect(t.expectedPoints).toBeGreaterThan(0);
    expect(t.expectedPoints).toBeLessThanOrEqual(4);
    expect(t.candidates).toHaveLength(49);
    expect(t.candidates[0].expectedPoints).toBe(t.expectedPoints);
    // Brute-Force-Gegenprobe fuer den Sieger
    let ev = 0;
    for (let i = 0; i < m.cells.length; i++) for (let j = 0; j < m.cells[i].length; j++) ev += m.cells[i][j] * tipPoints(t.score, { home: i, away: j });
    expect(ev).toBeCloseTo(t.expectedPoints, 12);
  });
  it('Groesster-Rest-Rundung summiert exakt zu 100', () => {
    const r = roundToHundred({ H: 0.3733, D: 0.2355, A: 0.3912 });
    expect(r.H + r.D + r.A).toBe(100);
    expect(r).toEqual({ H: 37, D: 24, A: 39 });
  });
});

describe('Abgeleitete Werte (Review-Fehler 1: nur aus der finalen Matrix)', () => {
  it('BTTS und Ueber 2,5 sind exakte Zellsummen der Matrix, nicht die unabhaengige Lambda-Formel', () => {
    const lH = 1.35, lA = 1.21;
    const dc = buildMatrix(lH, lA, -0.10);
    const d = deriveStats(dc);
    let btts = 0;
    for (let i = 1; i < dc.cells.length; i++) for (let j = 1; j < dc.cells[i].length; j++) btts += dc.cells[i][j];
    expect(d.bothToScore).toBeCloseTo(btts, 12);
    // Die frueher im UI genutzte Formel (unabhaengige Poisson) weicht messbar ab -- Review: 51,99 % vs. 53,25 %
    const naive = (1 - Math.exp(-lH)) * (1 - Math.exp(-lA));
    expect(naive).toBeCloseTo(0.5199, 3);
    expect(d.bothToScore).toBeCloseTo(0.5325, 3);
    expect(Math.abs(d.bothToScore - naive)).toBeGreaterThan(0.01);
  });
  it('folgt dem Markt-Blend: nach Rueckverteilung aendern sich BTTS/Ueber 2,5 konsistent mit der Matrix', () => {
    const raw = buildMatrix(1.5, 1.2, -0.1);
    const fin = redistribute(raw, { H: 0.7, D: 0.15, A: 0.15 });
    const a = deriveStats(raw), b = deriveStats(fin);
    expect(b.over25).not.toBeCloseTo(a.over25, 4);
    expect(b.expectedHomeGoals).toBeGreaterThan(a.expectedHomeGoals);
    expect(b.under25 + b.over25).toBeCloseTo(1, 12);
  });
});
