// Aktueller Parametersatz (Modell 4.1.1 -> 4.2.0). Werte aus dem Review
// vom 07.09.2026, Abschnitt 6. Sie gelten als historisch freigegeben, NICHT
// als nachgewiesen optimal: eine vollstaendig dokumentierte innere Suche mit
// Auswahlprotokoll liegt nicht vor. Aenderungen nur nach einem sauberen
// Vergleich auf einem getrennten Zeitraum (siehe docs/review-4.1.1.md,
// Abschnitt 18, Prioritaet 3).

export interface ModelParams {
  /** Zeitgewichtung: nach so vielen Tagen zaehlt ein Spiel halb. */
  halfLifeDays: number;
  ridgeAttack: number;
  ridgeDefense: number;
  /** Regularisierung von Torniveau und Heimvorteil. */
  ridgeLeague: number;
  /** Nur relevant, wenn estimateRho = true. */
  ridgeRho: number;
  rho: number;
  estimateRho: boolean;
  /** Vorsaisonrating als Startwert bestehender Vereine (Anteil). */
  priorReliability: number;
  /** Abschwaechung des Zweitligaratings bei Aufsteigern. */
  promotedReliability: number;
  /** Uebersetzungs-Fallback Angriff (Faktor auf Liga-Schnitt). */
  promotedAttackFactor: number;
  /** Uebersetzungs-Fallback Abwehr. */
  promotedDefenseFactor: number;
  /** Direkter Log-Prior, falls gar kein Zweitligarating vorliegt. */
  promotedFallbackAttackLog: number;
  promotedFallbackDefenseLog: number;
  lambdaMin: number;
  lambdaMax: number;
  maxIterations: number;
  learningRate: number;
  adamBeta1: number;
  adamBeta2: number;
  /** Maximale endgueltige Parameteraenderung fuer Konvergenz. */
  convergenceTolerance: number;
  /** Relative Aenderung der regularisierten Zielfunktion fuer Konvergenz. */
  objectiveTolerance: number;
  /** Beide Kriterien ueber so viele aufeinanderfolgende Schritte. */
  convergenceWindow: number;
  /** Abbruch fruehestens nach so vielen Schritten. */
  minIterations: number;
  /**
   * Newton-Politur nach Adam: konvergiert gilt erst, wenn max|dJ/dtheta| darunter
   * liegt. Adams Parameter-/Zielfunktions-Kriterium misst nur, ob sein Schritt
   * kollabiert ist -- bei Warmstart passiert das messbar VOR dem Optimum
   * (falsche Konvergenz, Parameter 4e-3 daneben). Der Gradient ist das
   * Kriterium, das das Review (5.5) als fehlend benannt hat.
   */
  gradientTolerance: number;
  newtonMaxIterations: number;
  /** Abflachung der Modellwahrscheinlichkeiten. */
  modelTemperature: number;
  /** Abflachung der fairen Marktverteilung (1.0 = unveraendert). */
  marketTemperature: number;
  /** Exponentengewicht des Marktanteils im logarithmischen Pool. */
  marketAlpha: number;
  /** Ziehungen je Saisonsimulation. */
  simulationRuns: number;
  /** Suchraum je Seite fuer die Tippspiel-Optimierung (0..N Tore). */
  tipSearchMaxGoals: number;
}

export const MODEL_VERSION = '4.2.0';

export const DEFAULT_PARAMS: Readonly<ModelParams> = Object.freeze({
  halfLifeDays: 210,
  ridgeAttack: 4,
  ridgeDefense: 4.5,
  ridgeLeague: 1.6,
  ridgeRho: 12,
  rho: -0.10,
  estimateRho: false,
  priorReliability: 0.95,
  promotedReliability: 0.60,
  promotedAttackFactor: 0.85,
  promotedDefenseFactor: 1.15,
  promotedFallbackAttackLog: -0.27,
  promotedFallbackDefenseLog: 0.17,
  lambdaMin: 0.30,
  lambdaMax: 4.50,
  maxIterations: 850,
  learningRate: 0.045,
  adamBeta1: 0.9,
  adamBeta2: 0.999,
  convergenceTolerance: 2e-6,
  objectiveTolerance: 1e-9,
  convergenceWindow: 20,
  minIterations: 120,
  gradientTolerance: 1e-6,
  newtonMaxIterations: 30,
  modelTemperature: 1.10,
  marketTemperature: 1.00,
  marketAlpha: 0.40,
  simulationRuns: 10_000,
  tipSearchMaxGoals: 6,
});

/** Erzeugt einen vollstaendigen Parametersatz mit Ueberschreibungen. */
export function withParams(overrides: Partial<ModelParams> = {}): ModelParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}
