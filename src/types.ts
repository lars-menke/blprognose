// Gemeinsame Typen des Prognosekerns. Bewusst framework-frei: kein React,
// kein DOM, kein Server. Alles hier laeuft identisch im Browser, auf einem
// Worker und in einem Backtest-Skript.

export type League = 'bl1' | 'bl2';

/** 1X2-Ausgang aus Heimsicht. */
export type Outcome = 'H' | 'D' | 'A';

/** Wahrscheinlichkeiten 0..1, Summe 1. */
export interface OutcomeProbs {
  H: number;
  D: number;
  A: number;
}

/**
 * Ein Spiel in vereinheitlichter Form. Vereine werden ueber die numerische
 * OpenLigaDB-Team-ID identifiziert, nicht ueber Namen -- Namen aendern sich
 * (Sponsoren, Schreibweisen), IDs nicht. Das beseitigt die frueher fragilste
 * Stelle des Systems: von Hand gepflegte Namens-Maps, die bei jedem Auf-/
 * Abstieg lautlos brachen.
 */
export interface MatchRecord {
  id: number;
  league: League;
  /** Saison-Startjahr: 2026 = Spielzeit 2026/27. */
  season: number;
  matchday: number;
  /** Anstoss als ISO-8601-UTC-String. */
  kickoff: string;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeLogo?: string;
  awayLogo?: string;
  finished: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface TeamInfo {
  id: number;
  name: string;
  shortName: string;
  logo?: string;
}

/** Geschaetzte Teamstaerken eines Fits. */
export interface Ratings {
  /** Ligaweites Torniveau (log-Skala). */
  mu: number;
  /** Globaler Heimvorteil (log-Skala). */
  home: number;
  /** Dixon-Coles-Korrektur. */
  rho: number;
  /** Angriffsstaerke je Team-ID, auf Mittelwert 0 zentriert. */
  attack: Map<number, number>;
  /** Abwehranfaelligkeit je Team-ID (positiv = schwaechere Abwehr), Mittelwert 0. */
  defense: Map<number, number>;
}

export interface FitDiagnostics {
  /** Projizierter Gradient <= gradientTolerance -- das massgebliche Kriterium. */
  converged: boolean;
  /** Adam- plus Newton-Schritte. */
  iterations: number;
  adamIterations: number;
  /** Das Parameter-/Zielfunktions-Kriterium der Spezifikation (Adam-Stufe). Informativ. */
  adamConverged: boolean;
  newtonIterations: number;
  /**
   * Projizierter Gradient am Ende: max ueber |dJ/dmu|, |dJ/dh|, (|dJ/drho|) und
   * die um den Blockmittelwert bereinigten Angriffs-/Abwehrgradienten. Der rohe
   * Gradient verschwindet am zentrierten Optimum nicht (Gauge-Offset -2 rL mu / n).
   */
  gradientNorm: number;
  /** Regularisierte Zielfunktion (zu minimieren) beim Abbruch. */
  objective: number;
  /**
   * Anteil der Trainingsspiele, bei denen mindestens ein Lambda ausserhalb
   * [lambdaMin, lambdaMax] liegt. Diagnose: haeufig = Datenfehler oder zu
   * schwache Regularisierung (v2.1, Abschnitt 6). Gekappt wird nur in der
   * Prognose, in der Schaetzung nur bei clipInTraining.
   */
  clippedShare: number;
  /** Summe der Zeitgewichte = effektive Stichprobengroesse. */
  effectiveSampleSize: number;
  matches: number;
  reason: 'converged' | 'max-iterations' | 'no-data';
}

/** Ein 1X2-Wahrscheinlichkeitsvektor plus vollstaendige Ergebnismatrix. */
export interface ScoreMatrix {
  /** cells[i][j] = P(Heim i Tore, Auswaerts j Tore), Summe 1. */
  cells: number[][];
  probs: OutcomeProbs;
}

export interface Score {
  home: number;
  away: number;
}
