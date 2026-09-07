// Oeffentliche Schnittstelle des Prognosekerns.

export type * from './types.ts';

export { DEFAULT_PARAMS, MODEL_VERSION, withParams, type ModelParams } from './model/params.ts';
export { timeWeight, ageInDays } from './model/weights.ts';
export { buildMatrix, dcTau, poissonPmf, outcomeProbs, outcomeOf, expectedGoals } from './model/matrix.ts';
export { fitRatings, lambdasFor, type FitMatch, type FitOptions, type FitResult } from './model/fit.ts';
export { temper, logPool, redistribute, normalizeProbs } from './model/blend.ts';
export {
  conditionalMode, globalMode, tipGameMode, tipPoints, argmaxOutcome, rankedScores, roundToHundred,
  type DecisionRule, type ScoredScore, type ConditionalDecision, type TipGameDecision,
} from './model/decision.ts';
export { deriveStats, type DerivedStats } from './model/derived.ts';
export { estimateTranslation, promotedPriors, promotedTeams, TRANSLATION_BOUNDS, type PromotedTranslation, type PromotedPriors } from './model/promoted.ts';
export { simulateSeason, baseTable, compareRows, seedFor, type SeasonSimulation, type TeamSimulation } from './model/simulation.ts';
export { mulberry32, hashSeed } from './model/random.ts';

export {
  OpenLigaSource, normalizeSeason, normalizeMatch, pickFinalResult, dedupe, validateSeason, teamsOf, BL_SHAPE,
  type SeasonSource, type DataIssue, type RawMatch, type OpenLigaOptions,
} from './data/openliga.ts';
export { normalizeLiveMatch, liveStatus, LIVE_WINDOW_HOURS, type LiveMatch, type LiveStatus } from './data/live.ts';
export { seasonOf, seasonLabel } from './data/season.ts';

export {
  attachMarkets, marketFor, findEvent, devigPower, normalizeTeamName, fetchOddsEvents, SPORT_KEY,
  type MarketProbs, type MarketOptions, type AttachedMarkets, type OddsEvent, type BookmakerQuote,
} from './market/odds.ts';

export {
  loadDataset, prepareSeasonModel, buildForecast, buildForecasts, buildSeasonSimulation,
  type SeasonDataset, type SeasonModel, type Forecast, type ForecastOptions,
} from './forecast.ts';

export {
  logLoss, brier, rps, summarize, summarizeTips, compareOnSameSubset, isSurprise, actualOutcome, currentMatchday, lastEvaluatedMatchday,
  type MetricSummary, type EvaluatedForecast, type SameSubsetComparison,
} from './evaluation/metrics.ts';
