// Orchestrator: Datensatz -> Teamstaerken -> Prognoseobjekt -> Saisonsimulation.
//
// DIE eine Rechenkette. Matchkarte, Spielprofil und Saisonsimulation lesen
// alle aus demselben Forecast-Objekt: dieselbe finale Matrix, dieselben
// abgeleiteten Werte. Ein zweiter Rechenweg fuer einen einzelnen Screen ist
// hier strukturell nicht vorgesehen -- er waere ein zweites Modell.

import type { FitDiagnostics, MatchRecord, OutcomeProbs, Ratings, Score, ScoreMatrix, TeamInfo } from './types.ts';
import { DEFAULT_PARAMS, MODEL_VERSION, type ModelParams } from './model/params.ts';
import { ageInDays, timeWeight } from './model/weights.ts';
import { fitRatings, lambdasFor, type FitMatch } from './model/fit.ts';
import { buildMatrix } from './model/matrix.ts';
import { logPool, redistribute, temper } from './model/blend.ts';
import { conditionalMode, globalMode, roundToHundred, tipGameMode, type ConditionalDecision, type DecisionRule, type ScoredScore, type TipGameDecision } from './model/decision.ts';
import { deriveStats, type DerivedStats } from './model/derived.ts';
import { estimateTranslation, promotedPriors, promotedTeams, type PromotedPriors, type PromotedTranslation } from './model/promoted.ts';
import { simulateSeason, type SeasonSimulation } from './model/simulation.ts';
import { teamsOf, validateSeason, type DataIssue, type SeasonSource } from './data/openliga.ts';
import type { MarketProbs, MarketRejection } from './market/odds.ts';

// ---------------------------------------------------------------------------
// Datensatz
// ---------------------------------------------------------------------------

export interface SeasonDataset {
  season: number;
  /** BL1-Saison S: kompletter Spielplan, gespielt und offen. */
  current: MatchRecord[];
  /** BL1-Vorsaisons, juengste zuerst: [S-1, S-2]. */
  previousBl1: MatchRecord[][];
  /** BL2-Vorsaisons, juengste zuerst: [S-1, S-2, S-3]. */
  previousBl2: MatchRecord[][];
  issues: DataIssue[];
}

export interface LoadOptions {
  bl1Back?: number;
  bl2Back?: number;
}

/** Laedt alle sechs Saisonabrufe parallel und prueft den aktuellen Spielplan. */
export async function loadDataset(source: SeasonSource, season: number, opts: LoadOptions = {}): Promise<SeasonDataset> {
  const bl1Back = opts.bl1Back ?? 2, bl2Back = opts.bl2Back ?? 3;
  const bl1Years = Array.from({ length: bl1Back }, (_, i) => season - 1 - i);
  const bl2Years = Array.from({ length: bl2Back }, (_, i) => season - 1 - i);
  const [current, ...rest] = await Promise.all([
    source.loadSeason('bl1', season),
    ...bl1Years.map(y => source.loadSeason('bl1', y)),
    ...bl2Years.map(y => source.loadSeason('bl2', y)),
  ]);
  const issues = validateSeason(current);
  const errors = issues.filter(i => i.level === 'error');
  if (errors.length) {
    throw new Error(`Spielplan ${season} unbrauchbar: ${errors.map(e => e.message).join('; ')}`);
  }
  return {
    season,
    current,
    previousBl1: rest.slice(0, bl1Back),
    previousBl2: rest.slice(bl1Back),
    issues,
  };
}

// ---------------------------------------------------------------------------
// Saisonmodell
// ---------------------------------------------------------------------------

export interface SeasonModel {
  season: number;
  asOf: Date;
  params: ModelParams;
  modelVersion: string;
  /** Finaler gemeinsamer Fit (Vorsaisons + abgeschlossene aktuelle Spiele). */
  ratings: Ratings;
  /** Vorbereitender Fit nur auf den BL1-Vorsaisons. */
  historical: Ratings;
  bl2Ratings: Ratings | null;
  translation: PromotedTranslation;
  promoted: number[];
  priors: PromotedPriors;
  teams: TeamInfo[];
  diagnostics: {
    final: FitDiagnostics;
    historical: FitDiagnostics;
    bl2: FitDiagnostics | null;
  };
}

function isTraining(m: MatchRecord, asOf: Date): boolean {
  return m.finished && m.homeGoals !== null && m.awayGoals !== null && Date.parse(m.kickoff) < asOf.getTime();
}

function toFitMatches(matches: readonly MatchRecord[], asOf: Date, params: ModelParams): FitMatch[] {
  const out: FitMatch[] = [];
  for (const m of matches) {
    if (!isTraining(m, asOf)) continue;
    out.push({
      homeId: m.homeId, awayId: m.awayId,
      homeGoals: m.homeGoals!, awayGoals: m.awayGoals!,
      weight: timeWeight(ageInDays(m.kickoff, asOf), params.halfLifeDays),
    });
  }
  return out;
}

function scale(map: Map<number, number>, f: number): Map<number, number> {
  return new Map([...map].map(([k, v]) => [k, v * f]));
}

export function prepareSeasonModel(data: SeasonDataset, asOf: Date, params: ModelParams = DEFAULT_PARAMS): SeasonModel {
  const priorBl1 = data.previousBl1.flat();

  // 1. Historisches Modell (nur Vorsaisons)
  const historicalFit = fitRatings(toFitMatches(priorBl1, asOf, params), { params });

  // 2. Aufsteiger, Uebersetzung, Zweitliga-Rating
  const promoted = promotedTeams(data.current, data.previousBl1[0] ?? []);
  const pairs = data.previousBl1
    .map((bl1, i) => ({ season: data.season - 1 - i, bl1, bl2: data.previousBl2[i + 1] ?? [] }))
    .filter(p => p.bl1.length && p.bl2.length);
  const translation = estimateTranslation(pairs, params);
  const bl2Last = data.previousBl2[0] ?? [];
  const bl2Fit = bl2Last.length ? fitRatings(toFitMatches(bl2Last, asOf, params), { params }) : null;
  const priors = promotedPriors(promoted, bl2Fit?.ratings ?? null, translation, params);

  // 3. Finaler gemeinsamer Fit: bestehende Vereine starten bei 0.95 x Vorsaison
  //    (Ridge-Zentrum 0), Aufsteiger starten am Prior UND werden dorthin
  //    regularisiert (ihre Zweitligadaten sind hier nicht enthalten).
  const initAttack = scale(historicalFit.ratings.attack, params.priorReliability);
  const initDefense = scale(historicalFit.ratings.defense, params.priorReliability);
  for (const id of promoted) { initAttack.set(id, priors.attack.get(id)!); initDefense.set(id, priors.defense.get(id)!); }
  const teams = teamsOf(data.current);
  const finalFit = fitRatings(toFitMatches([...priorBl1, ...data.current], asOf, params), {
    params,
    teamIds: teams.map(t => t.id),
    init: { mu: historicalFit.ratings.mu, home: historicalFit.ratings.home, attack: initAttack, defense: initDefense },
    ridgeCenter: { attack: priors.attack, defense: priors.defense },
  });

  return {
    season: data.season, asOf, params, modelVersion: MODEL_VERSION,
    ratings: finalFit.ratings, historical: historicalFit.ratings, bl2Ratings: bl2Fit?.ratings ?? null,
    translation, promoted, priors, teams,
    diagnostics: { final: finalFit.diagnostics, historical: historicalFit.diagnostics, bl2: bl2Fit?.diagnostics ?? null },
  };
}

// ---------------------------------------------------------------------------
// Prognoseobjekt
// ---------------------------------------------------------------------------

export interface Forecast {
  id: number;
  season: number;
  matchday: number;
  kickoff: string;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  modelVersion: string;
  /** Rechenstichtag (ISO). */
  generatedAt: string;
  /** Basis-Torerwartungen: keine Schuss-xG und nicht zwingend die Mittelwerte der finalen Matrix. */
  lambda: { home: number; away: number; clippedHome: boolean; clippedAway: boolean };
  /** 1X2 direkt aus Poisson/Dixon-Coles. */
  rawModelProbabilities: OutcomeProbs;
  /** Temperierte reine Modellverteilung. */
  modelProbabilities: OutcomeProbs;
  /** Finale 1X2-Verteilung (= modelProbabilities, wenn kein Markt). */
  probabilities: OutcomeProbs;
  /** Gerundete Darstellungswerte, Summe exakt 100. */
  probs: { H: number; D: number; A: number };
  modelProbs: { H: number; D: number; A: number };
  path: 'model' | 'blend';
  market: MarketProbs | null;
  marketRejection: string | null;
  /** Finale Matrix -- Grundlage fuer Score, Spielprofil UND Saisonsimulation. */
  scoreMatrix: ScoreMatrix;
  /** Temperierte Modellmatrix ohne Markt (Transparenz). */
  modelScoreMatrix: ScoreMatrix;
  decisions: {
    primaryRule: DecisionRule;
    primary: Score;
    conditional: ConditionalDecision;
    global: ScoredScore;
    tipGame: TipGameDecision;
    /** Globaler Modus der temperierten Modellmatrix ohne Markt. */
    modelGlobal: ScoredScore;
  };
  derived: DerivedStats;
  diagnostics: {
    converged: boolean;
    iterations: number;
    rho: number;
    homeAdvantage: number;
    promotedHome: boolean;
    promotedAway: boolean;
    translation: { attackFactor: number; defenseFactor: number; source: PromotedTranslation['source']; observations: number };
    effectiveSampleSize: number;
  };
}

export interface ForecastOptions {
  markets?: ReadonlyMap<number, MarketProbs>;
  marketRejections?: readonly MarketRejection[];
  /**
   * Hauptregel. Empfehlung: 'tipGame' (Erwartungspunkte 4/3/2) -- nutzt die
   * ganze Matrix und behandelt Remis ohne Sonderregel. 'conditional' ist die
   * Regel aus 4.1.1 (tippte 3 Remis in 918 Spielen). Produktentscheidung.
   */
  primaryRule?: DecisionRule;
}

export function buildForecast(model: SeasonModel, match: MatchRecord, opts: ForecastOptions = {}): Forecast {
  const { params } = model;
  const rule = opts.primaryRule ?? 'tipGame';
  const lam = lambdasFor(model.ratings, match.homeId, match.awayId, params);
  const raw = buildMatrix(lam.lambdaH, lam.lambdaA, model.ratings.rho);
  const modelProbs = temper(raw.probs, params.modelTemperature);

  const market = opts.markets?.get(match.id) ?? null;
  const rejection = opts.marketRejections?.find(r => r.matchId === match.id)?.reason ?? null;
  let finalProbs = modelProbs;
  let path: Forecast['path'] = 'model';
  if (market) {
    const marketProbs = temper(market.probabilities, params.marketTemperature);
    finalProbs = logPool(modelProbs, marketProbs, params.marketAlpha);
    path = 'blend';
  }

  const scoreMatrix = redistribute(raw, finalProbs);
  const modelScoreMatrix = redistribute(raw, modelProbs);

  const conditional = conditionalMode(scoreMatrix);
  const global = globalMode(scoreMatrix);
  const tipGame = tipGameMode(scoreMatrix, params.tipSearchMaxGoals);
  const primary: Score = rule === 'conditional' ? { home: conditional.score.home, away: conditional.score.away }
    : rule === 'global' ? { home: global.home, away: global.away }
    : tipGame.score;

  const promotedSet = new Set(model.promoted);
  return {
    id: match.id, season: match.season, matchday: match.matchday, kickoff: match.kickoff,
    homeId: match.homeId, awayId: match.awayId, homeName: match.homeName, awayName: match.awayName,
    modelVersion: model.modelVersion,
    generatedAt: model.asOf.toISOString(),
    lambda: { home: lam.lambdaH, away: lam.lambdaA, clippedHome: lam.clippedH, clippedAway: lam.clippedA },
    rawModelProbabilities: raw.probs,
    modelProbabilities: modelProbs,
    probabilities: finalProbs,
    probs: roundToHundred(finalProbs),
    modelProbs: roundToHundred(modelProbs),
    path,
    market,
    marketRejection: market ? null : rejection,
    scoreMatrix,
    modelScoreMatrix,
    decisions: { primaryRule: rule, primary, conditional, global, tipGame, modelGlobal: globalMode(modelScoreMatrix) },
    derived: deriveStats(scoreMatrix),
    diagnostics: {
      converged: model.diagnostics.final.converged,
      iterations: model.diagnostics.final.iterations,
      rho: model.ratings.rho,
      homeAdvantage: model.ratings.home,
      promotedHome: promotedSet.has(match.homeId),
      promotedAway: promotedSet.has(match.awayId),
      translation: {
        attackFactor: model.translation.attackFactor, defenseFactor: model.translation.defenseFactor,
        source: model.translation.source, observations: model.translation.observations,
      },
      effectiveSampleSize: model.diagnostics.final.effectiveSampleSize,
    },
  };
}

/** Prognosen fuer alle Spiele, die zum Stichtag noch nicht begonnen haben. */
export function buildForecasts(model: SeasonModel, matches: readonly MatchRecord[], opts: ForecastOptions = {}): Forecast[] {
  const asOfMs = model.asOf.getTime();
  return matches
    .filter(m => !m.finished && Date.parse(m.kickoff) > asOfMs)
    .map(m => buildForecast(model, m, opts));
}

/**
 * Saisonsimulation aus den finalen Matrizen der Prognosen. Offene Spiele ohne
 * Prognose (z.B. bereits laufend) erhalten die reine Modellmatrix -- der
 * einzige Fall, in dem hier gerechnet statt gelesen wird, und er ist markiert.
 */
export function buildSeasonSimulation(model: SeasonModel, forecasts: readonly Forecast[], runs = model.params.simulationRuns, seasonMatches: readonly MatchRecord[] = []): SeasonSimulation & { modelOnlyMatches: number } {
  const finalMatrices = new Map<number, ScoreMatrix>();
  for (const f of forecasts) finalMatrices.set(f.id, f.scoreMatrix);
  let modelOnly = 0;
  for (const m of seasonMatches) {
    if (m.finished || finalMatrices.has(m.id)) continue;
    const lam = lambdasFor(model.ratings, m.homeId, m.awayId, model.params);
    const raw = buildMatrix(lam.lambdaH, lam.lambdaA, model.ratings.rho);
    finalMatrices.set(m.id, redistribute(raw, temper(raw.probs, model.params.modelTemperature)));
    modelOnly++;
  }
  const sim = simulateSeason(model.teams.map(t => t.id), seasonMatches, finalMatrices, runs);
  return { ...sim, modelOnlyMatches: modelOnly };
}
