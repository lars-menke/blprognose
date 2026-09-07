// Gemeinsamer, gegnerbereinigter Fit der Teamstaerken.
//
//   lambda_H = exp(mu + h + a_H + d_A)
//   lambda_A = exp(mu     + a_A + d_H)
//
// Maximiert wird eine zeitgewichtete Poisson/Dixon-Coles-Log-Likelihood mit
// quadratischen Straftermen (Ridge). Angriffs- und Abwehrwerte werden nach
// jedem Update auf Mittelwert 0 zentriert; die entfernten Mittelwerte wandern
// in das Torniveau mu. Das ist eine Gauge-Fixierung: die Likelihood ist
// invariant gegen a -> a + k, mu -> mu - k, die Zentrierung macht die Loesung
// eindeutig und die Ratings ueber Fits hinweg vergleichbar.
//
// Kappung: Die Grenzen [lambdaMin, lambdaMax] gelten fuer die PROGNOSE
// (lambdasFor). In der Schaetzung wird seit 4.2.1 nicht mehr gekappt, denn
// eine Kappung in der Likelihood (Daten-Gradient 0 ausserhalb) macht die
// Zielfunktion an der Grenze unstetig differenzierbar. Liegt das Optimum
// genau dort -- im Ruecktest 2023/24 nach dem 8:0 Bayern-Darmstadt neun
// Spieltage lang -- gibt es keinen Punkt mit Gradient 0: von unten schiebt
// das Spiel mit (x - lambda) w, von oben ist es stumm. Adam pendelt, Newton
// kriecht an den Knick, "konvergiert" ist unerreichbar. Synthetisch
// reproduziert (tests/model-core.test.ts, "Knick"). Ohne Kappung ist die
// Zielfunktion glatt und strikt konvex; Ausreisser daempft der Ridge. Der
// Anteil der Trainingsspiele ausserhalb der Grenzen bleibt als clippedShare
// ein Diagnosewert (v2.1, Abschnitt 6: haeufige Begrenzung = Datenproblem).
// Altes Verhalten per params.clipInTraining fuer die Ablation.
//
// Optimierung in zwei Stufen:
//   1. Adam, exakt wie spezifiziert (lr, Momente, Parameter-/Zielfunktions-
//      Kriterium). Dieses Kriterium misst aber nur, ob Adams Schritt
//      kollabiert ist. Gemessen: bei Warmstart (0.95 x Vorsaison) meldet es
//      "konvergiert" 4e-3 neben dem Optimum, in anderen Faellen braucht es
//      1500+ Schritte -- pfadabhaengig.
//   2. Newton-Politur mit Finite-Differenzen-Hessematrix aus dem analytischen
//      Gradienten, Cholesky, Levenberg-Daempfung, Armijo-Liniensuche.
//      Konvergiert gilt erst bei max|dJ/dtheta| <= gradientTolerance.
// Die Zielfunktion ist (bis auf den kleinen Dixon-Coles-Term) strikt konkav
// und hat ein eindeutiges Optimum; die zweite Stufe aendert es nicht, sie
// erreicht es nur zuverlaessig und startwertunabhaengig. Das schliesst die im
// Review (5.5) benannte Luecke "kein Gradientenkriterium, kein unabhaengiger
// Optimierer".

import type { FitDiagnostics, Ratings } from '../types.ts';
import type { ModelParams } from './params.ts';

export interface FitMatch {
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  /** Zeitgewicht >= 0; 0 = wird ignoriert. */
  weight: number;
}

export interface FitOptions {
  params: ModelParams;
  /** Alle zu bewertenden Teams, auch solche ohne Trainingsspiel (Aufsteiger vor Spieltag 1). */
  teamIds?: Iterable<number>;
  /** Startwerte (z.B. 0.95 x Vorsaison). Fehlende Teams starten bei 0 bzw. am Ridge-Zentrum. */
  init?: Partial<Pick<Ratings, 'mu' | 'home' | 'attack' | 'defense'>>;
  /**
   * Zentren der Ridge-Strafe je Team. Standard 0 (= Liga-Schnitt). Fuer
   * Aufsteiger wird hier der aus Zweitligadaten uebersetzte Prior gesetzt:
   * deren Zweitligaspiele sind NICHT im Fit enthalten, ein Prior darauf
   * zaehlt also nichts doppelt. Bestehende Vereine bleiben bei 0 -- ihre
   * Vorsaison steckt bereits als Trainingsdaten im Fit.
   */
  ridgeCenter?: { attack?: Map<number, number>; defense?: Map<number, number> };
}

export interface FitResult {
  ratings: Ratings;
  diagnostics: FitDiagnostics;
}

// Layout des Parametervektors: [mu, home, rho, a_0..a_{n-1}, d_0..d_{n-1}]
const IDX_MU = 0;
const IDX_HOME = 1;
const IDX_RHO = 2;
const HEAD = 3;

const TAU_FLOOR = 1e-9;

interface Layout {
  ids: number[];
  index: Map<number, number>;
}

function clip(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Regularisierte Zielfunktion (zu minimieren) und ihr Gradient.
 * Exportiert, damit der Gradient per Finite-Differenzen geprueft werden kann.
 */
export function objectiveAndGradient(
  theta: Float64Array,
  matches: readonly FitMatch[],
  layout: Layout,
  params: ModelParams,
  centerA: Float64Array,
  centerD: Float64Array,
): { objective: number; gradient: Float64Array; clipped: number } {
  const n = layout.ids.length;
  const g = new Float64Array(theta.length);
  const mu = theta[IDX_MU];
  const home = theta[IDX_HOME];
  const rho = theta[IDX_RHO];
  const { lambdaMin, lambdaMax } = params;

  let negLogLik = 0;
  let clipped = 0;

  for (const m of matches) {
    const w = m.weight;
    if (!(w > 0)) continue;
    const hi = layout.index.get(m.homeId)!;
    const ai = layout.index.get(m.awayId)!;
    const aH = theta[HEAD + hi], dH = theta[HEAD + n + hi];
    const aA = theta[HEAD + ai], dA = theta[HEAD + n + ai];

    const rawH = Math.exp(mu + home + aH + dA);
    const rawA = Math.exp(mu + aA + dH);
    const outH = rawH < lambdaMin || rawH > lambdaMax;
    const outA = rawA < lambdaMin || rawA > lambdaMax;
    if (outH || outA) clipped++;
    const clipH = params.clipInTraining && outH;
    const clipA = params.clipInTraining && outA;
    const lH = clipH ? clip(rawH, lambdaMin, lambdaMax) : rawH;
    const lA = clipA ? clip(rawA, lambdaMin, lambdaMax) : rawA;

    const x = m.homeGoals, y = m.awayGoals;

    // Dixon-Coles-Faktor und seine Ableitungen (nur fuer x,y in {0,1} != 1)
    let tau = 1, dTauH = 0, dTauA = 0, dTauRho = 0;
    if (x === 0 && y === 0) { tau = 1 - lH * lA * rho; dTauH = -lA * rho; dTauA = -lH * rho; dTauRho = -lH * lA; }
    else if (x === 0 && y === 1) { tau = 1 + lH * rho; dTauH = rho; dTauRho = lH; }
    else if (x === 1 && y === 0) { tau = 1 + lA * rho; dTauA = rho; dTauRho = lA; }
    else if (x === 1 && y === 1) { tau = 1 - rho; dTauRho = -1; }
    if (tau < TAU_FLOOR) tau = TAU_FLOOR;

    // Log-Likelihood ohne konstante log(x!)-Terme
    const ll = x * Math.log(lH) - lH + y * Math.log(lA) - lA + Math.log(tau);
    negLogLik -= w * ll;

    // d ll / d theta_H = (x/lH - 1 + dTauH/tau) * dlH/dthetaH, dlH/dthetaH = lH; 0 nur bei Kappung in der Schaetzung
    const dThetaH = clipH ? 0 : (x / lH - 1 + dTauH / tau) * lH;
    const dThetaA = clipA ? 0 : (y / lA - 1 + dTauA / tau) * lA;

    g[IDX_MU] -= w * (dThetaH + dThetaA);
    g[IDX_HOME] -= w * dThetaH;
    g[HEAD + hi] -= w * dThetaH;         // a_H
    g[HEAD + n + ai] -= w * dThetaH;     // d_A
    g[HEAD + ai] -= w * dThetaA;         // a_A
    g[HEAD + n + hi] -= w * dThetaA;     // d_H
    if (params.estimateRho) g[IDX_RHO] -= w * (dTauRho / tau);
  }

  // Ridge-Strafen
  let penalty = params.ridgeLeague * (mu * mu + home * home);
  g[IDX_MU] += 2 * params.ridgeLeague * mu;
  g[IDX_HOME] += 2 * params.ridgeLeague * home;
  if (params.estimateRho) {
    penalty += params.ridgeRho * rho * rho;
    g[IDX_RHO] += 2 * params.ridgeRho * rho;
  }
  for (let i = 0; i < n; i++) {
    const da = theta[HEAD + i] - centerA[i];
    const dd = theta[HEAD + n + i] - centerD[i];
    penalty += params.ridgeAttack * da * da + params.ridgeDefense * dd * dd;
    g[HEAD + i] += 2 * params.ridgeAttack * da;
    g[HEAD + n + i] += 2 * params.ridgeDefense * dd;
  }

  return { objective: negLogLik + penalty, gradient: g, clipped };
}

/** Zentriert a und d auf Mittelwert 0 und verschiebt die Mittelwerte nach mu. In-place. */
function center(theta: Float64Array, n: number): void {
  if (n === 0) return;
  let ma = 0, md = 0;
  for (let i = 0; i < n; i++) { ma += theta[HEAD + i]; md += theta[HEAD + n + i]; }
  ma /= n; md /= n;
  for (let i = 0; i < n; i++) { theta[HEAD + i] -= ma; theta[HEAD + n + i] -= md; }
  theta[IDX_MU] += ma + md;
}

/**
 * Zieht den Mittelwert von den Ridge-Zentren ab. Die Likelihood ist invariant
 * gegen die Gauge-Verschiebung (a -> a + k, mu -> mu - k), der Strafterm nur
 * dann, wenn die Zentren Mittelwert 0 haben -- sonst kann die Zentrierung nach
 * jedem Schritt die Zielfunktion ERHOEHEN und mit dem Optimierer streiten. Die
 * relativen Abstaende der Zentren (Aufsteiger unter dem Rest) bleiben exakt.
 */
function centerCenters(c: Float64Array): void {
  if (!c.length) return;
  let m = 0;
  for (const v of c) m += v;
  m /= c.length;
  for (let i = 0; i < c.length; i++) c[i] -= m;
}

// ---------------------------------------------------------------------------
// Newton-Politur
// ---------------------------------------------------------------------------

/** Loest (H + damping I) x = -g per Cholesky; null, wenn nicht positiv definit. */
function solveDamped(H: number[][], g: number[], damping: number): number[] | null {
  const n = g.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = H[i][j] + (i === j ? damping : 0);
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 1e-12) return null;
        L[i][i] = Math.sqrt(s);
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }
  // L y = -g
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = -g[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  // L^T x = y
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

interface NewtonResult { iterations: number; gradientNorm: number; converged: boolean }

/** Duenn besetzter Basisvektor: Liste von [Koordinate, Koeffizient]. */
type Basis = Array<[number, number]>;

/**
 * Projizierter Gradient: Das Optimum wird AUF der Zentrierungs-Mannigfaltigkeit
 * (mean a = 0, mean d = 0) gesucht. Dort verschwindet nicht der rohe Gradient,
 * sondern seine Tangentialkomponente: im Angriffs- und Abwehrblock der
 * jeweils um den Blockmittelwert bereinigte Gradient. Der Rest (uniformer
 * Offset -2 rL mu / n im Block) ist die vom Ridge getragene Gauge-Komponente,
 * die die Zentrierung bewusst festhaelt. Genau das "Kriterium fuer den
 * projizierten Gradienten", das das Review (5.5) vermisst.
 */
function projectedGradientNorm(g: Float64Array, n: number, estimateRho: boolean): number {
  let norm = Math.max(Math.abs(g[IDX_MU]), Math.abs(g[IDX_HOME]));
  if (estimateRho) norm = Math.max(norm, Math.abs(g[IDX_RHO]));
  for (const offset of [HEAD, HEAD + n]) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += g[offset + i];
    mean /= n;
    for (let i = 0; i < n; i++) norm = Math.max(norm, Math.abs(g[offset + i] - mean));
  }
  return norm;
}

/**
 * Newton in reduzierten Koordinaten: Basis des Tangentialraums der
 * Zentrierung -- mu, h, (rho), und je Block n-1 Differenzvektoren
 * e_i - e_n. Jeder Schritt bleibt damit per Konstruktion auf der
 * Mannigfaltigkeit; Gradient und Hessematrix werden direkt in dieser Basis
 * gebildet (Richtungsableitungen des analytischen Gradienten).
 */
function newtonPolish(
  theta: Float64Array,
  n: number,
  estimateRho: boolean,
  evaluate: (t: Float64Array) => { objective: number; gradient: Float64Array },
  tol: number,
  maxIter: number,
): NewtonResult {
  const basis: Basis[] = [[[IDX_MU, 1]], [[IDX_HOME, 1]]];
  if (estimateRho) basis.push([[IDX_RHO, 1]]);
  for (let i = 0; i < n - 1; i++) basis.push([[HEAD + i, 1], [HEAD + n - 1, -1]]);
  for (let i = 0; i < n - 1; i++) basis.push([[HEAD + n + i, 1], [HEAD + 2 * n - 1, -1]]);
  const m = basis.length;
  const dot = (g: Float64Array, b: Basis) => b.reduce((s, [k, c]) => s + c * g[k], 0);
  const along = (base: Float64Array, coeffs: number[], scale: number): Float64Array => {
    const out = Float64Array.from(base);
    for (let j = 0; j < m; j++) for (const [k, c] of basis[j]) out[k] += scale * coeffs[j] * c;
    return out;
  };

  const h = 1e-5;
  let damping = 0;
  let iterations = 0;
  let { objective, gradient } = evaluate(theta);
  let gn = projectedGradientNorm(gradient, n, estimateRho);

  while (gn > tol && iterations < maxIter) {
    // Reduzierte Hessematrix: H_red[i][j] = b_i . (dg/d(b_j)), zentrale Differenz
    const H: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    for (let j = 0; j < m; j++) {
      const unit = new Array<number>(m).fill(0); unit[j] = 1;
      const gp = evaluate(along(theta, unit, h)).gradient;
      const gm = evaluate(along(theta, unit, -h)).gradient;
      for (let i = 0; i < m; i++) H[i][j] = (dot(gp, basis[i]) - dot(gm, basis[i])) / (2 * h);
    }
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) { const s = (H[i][j] + H[j][i]) / 2; H[i][j] = s; H[j][i] = s; }

    const g = basis.map(b => dot(gradient, b));
    let step: number[] | null = null;
    let lam = damping;
    for (let tries = 0; tries < 12 && !step; tries++) {
      step = solveDamped(H, g, lam);
      if (!step) lam = lam === 0 ? 1e-4 : lam * 10;
    }
    if (!step) break;
    const dirDeriv = step.reduce((s, v, i) => s + v * g[i], 0);
    if (!(dirDeriv < 0)) break;

    // Armijo-Liniensuche entlang des Tangentialschritts
    let t = 1, accepted = false;
    let trial = theta, trialEval = { objective, gradient };
    for (let ls = 0; ls < 40; ls++) {
      trial = along(theta, step, t);
      center(trial, n); // numerische Hygiene; der Schritt ist bereits tangential
      trialEval = evaluate(trial);
      if (trialEval.objective <= objective + 1e-4 * t * dirDeriv) { accepted = true; break; }
      t /= 2;
    }
    if (!accepted) break;
    theta.set(trial);
    objective = trialEval.objective;
    gradient = trialEval.gradient;
    gn = projectedGradientNorm(gradient, n, estimateRho);
    damping = lam > 0 ? lam / 10 : 0;
    iterations++;
  }
  return { iterations, gradientNorm: gn, converged: gn <= tol };
}

export function buildLayout(matches: readonly FitMatch[], extra?: Iterable<number>): Layout {
  const set = new Set<number>();
  for (const m of matches) { set.add(m.homeId); set.add(m.awayId); }
  if (extra) for (const id of extra) set.add(id);
  const ids = [...set].sort((a, b) => a - b);
  return { ids, index: new Map(ids.map((id, i) => [id, i])) };
}

export function fitRatings(matches: readonly FitMatch[], options: FitOptions): FitResult {
  const { params } = options;
  const usable = matches.filter(m => m.weight > 0 && Number.isFinite(m.homeGoals) && Number.isFinite(m.awayGoals));
  const layout = buildLayout(usable, options.teamIds);
  const n = layout.ids.length;

  const centerA = new Float64Array(n);
  const centerD = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const id = layout.ids[i];
    centerA[i] = options.ridgeCenter?.attack?.get(id) ?? 0;
    centerD[i] = options.ridgeCenter?.defense?.get(id) ?? 0;
  }
  centerCenters(centerA);
  centerCenters(centerD);

  const theta = new Float64Array(HEAD + 2 * n);
  theta[IDX_MU] = options.init?.mu ?? 0;
  theta[IDX_HOME] = options.init?.home ?? 0;
  theta[IDX_RHO] = params.rho;
  for (let i = 0; i < n; i++) {
    const id = layout.ids[i];
    theta[HEAD + i] = options.init?.attack?.get(id) ?? centerA[i];
    theta[HEAD + n + i] = options.init?.defense?.get(id) ?? centerD[i];
  }
  center(theta, n);

  const toRatings = (): Ratings => {
    const attack = new Map<number, number>();
    const defense = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      attack.set(layout.ids[i], theta[HEAD + i]);
      defense.set(layout.ids[i], theta[HEAD + n + i]);
    }
    return { mu: theta[IDX_MU], home: theta[IDX_HOME], rho: theta[IDX_RHO], attack, defense };
  };

  let ess = 0;
  for (const m of usable) ess += m.weight;

  if (usable.length === 0) {
    return {
      ratings: toRatings(),
      diagnostics: {
        converged: false, iterations: 0, adamIterations: 0, adamConverged: false, newtonIterations: 0,
        gradientNorm: NaN, objective: NaN, clippedShare: 0,
        effectiveSampleSize: 0, matches: 0, reason: 'no-data',
      },
    };
  }

  // Adam
  const mom = new Float64Array(theta.length);
  const vel = new Float64Array(theta.length);
  const { learningRate: lr, adamBeta1: b1, adamBeta2: b2 } = params;
  const eps = 1e-8;

  let prev: Float64Array | null = null;
  let prevObjective: number | null = null;
  let streak = 0;
  let adamIterations = 0;
  let adamConverged = false;

  for (let step = 1; step <= params.maxIterations; step++) {
    const { objective, gradient } = objectiveAndGradient(theta, usable, layout, params, centerA, centerD);

    if (prev !== null && prevObjective !== null) {
      let maxChange = 0;
      for (let k = 0; k < theta.length; k++) {
        const c = Math.abs(theta[k] - prev[k]);
        if (c > maxChange) maxChange = c;
      }
      const relObj = Math.abs(objective - prevObjective) / Math.max(Math.abs(objective), 1e-12);
      streak = (maxChange < params.convergenceTolerance && relObj < params.objectiveTolerance) ? streak + 1 : 0;
      if (streak >= params.convergenceWindow && adamIterations >= params.minIterations) {
        adamConverged = true;
        break;
      }
    }
    prev = Float64Array.from(theta);
    prevObjective = objective;

    if (!params.estimateRho) gradient[IDX_RHO] = 0;
    const bc1 = 1 - Math.pow(b1, step);
    const bc2 = 1 - Math.pow(b2, step);
    for (let k = 0; k < theta.length; k++) {
      mom[k] = b1 * mom[k] + (1 - b1) * gradient[k];
      vel[k] = b2 * vel[k] + (1 - b2) * gradient[k] * gradient[k];
      theta[k] -= lr * (mom[k] / bc1) / (Math.sqrt(vel[k] / bc2) + eps);
    }
    if (!params.estimateRho) theta[IDX_RHO] = params.rho;
    center(theta, n);
    adamIterations = step;
  }

  // Stufe 2: Newton-Politur im Tangentialraum der Zentrierung (rho nur, wenn geschaetzt)
  const evaluate = (t: Float64Array) => {
    const r = objectiveAndGradient(t, usable, layout, params, centerA, centerD);
    return { objective: r.objective, gradient: r.gradient };
  };
  const newton = newtonPolish(theta, n, params.estimateRho, evaluate, params.gradientTolerance, params.newtonMaxIterations);

  const final = objectiveAndGradient(theta, usable, layout, params, centerA, centerD);
  return {
    ratings: toRatings(),
    diagnostics: {
      converged: newton.converged,
      iterations: adamIterations + newton.iterations,
      adamIterations,
      adamConverged,
      newtonIterations: newton.iterations,
      gradientNorm: newton.gradientNorm,
      objective: final.objective,
      clippedShare: final.clipped / usable.length,
      effectiveSampleSize: ess,
      matches: usable.length,
      reason: newton.converged ? 'converged' : 'max-iterations',
    },
  };
}

export interface LambdaPair {
  lambdaH: number;
  lambdaA: number;
  clippedH: boolean;
  clippedA: boolean;
}

/** Torerwartungen einer Paarung aus den Ratings, mit Kappung. */
export function lambdasFor(ratings: Ratings, homeId: number, awayId: number, params: ModelParams): LambdaPair {
  const aH = ratings.attack.get(homeId), dH = ratings.defense.get(homeId);
  const aA = ratings.attack.get(awayId), dA = ratings.defense.get(awayId);
  if (aH === undefined || dH === undefined) throw new Error(`Kein Rating fuer Team ${homeId}`);
  if (aA === undefined || dA === undefined) throw new Error(`Kein Rating fuer Team ${awayId}`);
  const rawH = Math.exp(ratings.mu + ratings.home + aH + dA);
  const rawA = Math.exp(ratings.mu + aA + dH);
  return {
    lambdaH: clip(rawH, params.lambdaMin, params.lambdaMax),
    lambdaA: clip(rawA, params.lambdaMin, params.lambdaMax),
    clippedH: rawH < params.lambdaMin || rawH > params.lambdaMax,
    clippedA: rawA < params.lambdaMin || rawA > params.lambdaMax,
  };
}
