// Aktueller Parametersatz (Modell 4.1.1 -> 4.2.0 -> 4.2.1). Werte aus dem
// Review vom 07.09.2026, Abschnitt 6. Sie gelten als historisch freigegeben,
// NICHT als nachgewiesen optimal: eine vollstaendig dokumentierte innere Suche
// mit Auswahlprotokoll liegt nicht vor. Aenderungen nur nach einem sauberen
// Vergleich auf einem getrennten Zeitraum (siehe docs/review-4.1.1.md,
// Abschnitt 18, Prioritaet 3).
//
// 4.2.0 reproduziert 4.1.1 auf 2023-2025 (docs/backtest-4.2.0.md): 1X2
// 52,61 % vs 52,51 %, Log-Loss 0,99047 vs 0,99025. 4.2.1 aendert nur die
// Kappung waehrend der Schaetzung (clipInTraining), siehe dort.

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
  /**
   * Kappung auch INNERHALB der Likelihood (Verhalten 4.1.1/4.2.0). Erzeugt
   * einen Knick der Zielfunktion: Liegt das Optimum genau auf der Grenze --
   * gemessen im Ruecktest 2023/24 ab dem 8:0 Bayern-Darmstadt, Spieltage
   * 10-18 -- ist dort KEIN Gradientenkriterium erfuellbar (einseitiger
   * Gradient (x - lambda) w von unten, 0 von oben). Seit 4.2.1 aus: die
   * Kappung ist eine Sicherheitsgrenze der Prognose (lambdasFor), die
   * Schaetzung bleibt glatt; Ausreisser daempft der Ridge. Der Schalter
   * bleibt fuer die Ablation im Ruecktest (--params clipInTraining=true).
   */
  clipInTraining: boolean;
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

export const MODEL_VERSION = '4.2.1';

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
  clipInTraining: false,
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
