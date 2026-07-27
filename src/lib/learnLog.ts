// Passives Lernprotokoll: speichert eine Zeitreihe aus Modell-/Markt-Snapshots
// (ein Eintrag pro Quotenupdate) plus das Endergebnis. Dient zur empirischen
// Nachjustierung von MARKET_BLEND/DISSENS_DRAW_BOOST_MAX (siehe poisson.ts)
// und friert die Marktquote zum Anpfiff ein, damit In-Play-Bewegungen nicht
// mehr in Anzeige und Wett-Radar durchschlagen.

import type { MarketProbs } from './poisson';

// v2 = Zeitreihen-Format (snapshots[] je Spiel), analog zum WM-Lernlog v2.
// v1 (flach, ein Snapshot je Spiel) hat es in BLforecast nie in den Umlauf
// geschafft; die Migration liest einen eventuell vorhandenen v1-Key einmalig
// ein, damit fruehe Beta-Installationen ihre Historie behalten.
const LOG_KEY = 'bl_learnlog_v2';
const LEGACY_KEY = 'bl_learnlog_v1';
const MAX_SNAPSHOTS_PER_MATCH = 200; // Deckel gegen unbegrenztes Wachstum

export type LearnSnapshot = {
  ts: number;             // Date.now() beim Schreiben dieses Snapshots
  lH_model: number;       // reines Modell-Lambda (vor Marktkorrektur)
  lA_model: number;
  lH_blend: number;       // tatsaechlich genutztes, marktgeblendetes Lambda
  lA_blend: number;
  oddsH: number;          // Marktwahrscheinlichkeit in Prozent (wie MarketProbs)
  oddsD: number;
  oddsA: number;
};

export type LearnEntry = {
  matchId: string;              // z.B. "fcb-bvb-5"
  kickoff: string;               // ISO-String
  snapshots: LearnSnapshot[];    // chronologisch, aelteste zuerst
  actual: 'H' | 'D' | 'A' | null;
};

// In-Memory-Spiegel des Protokolls. getFrozenOdds wird pro Spiel einmal
// aufgerufen (34 Spieltage x 9 Spiele, plus Vorsaison, plus Saison-Sim) --
// ohne Cache waere das je ein voller JSON.parse des gesamten Logs, also
// mehrere hundert Parses und sekundenlange Blockade des Main-Threads,
// wachsend mit der Protokollgroesse.
let _cache: LearnEntry[] | null = null;

function loadLog(): LearnEntry[] {
  if (_cache) return _cache;
  try {
    const stored = localStorage.getItem(LOG_KEY) ?? localStorage.getItem(LEGACY_KEY);
    _cache = stored ? JSON.parse(stored) : [];
  } catch { _cache = []; }
  return _cache!;
}

function saveLog(entries: LearnEntry[]): void {
  _cache = entries;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch { /* storage full */ }
}

function sameSnapshot(a: LearnSnapshot, b: Omit<LearnSnapshot, 'ts'>): boolean {
  const eps = 1e-6;
  return Math.abs(a.oddsH - b.oddsH) < eps
    && Math.abs(a.oddsD - b.oddsD) < eps
    && Math.abs(a.oddsA - b.oddsA) < eps;
}

// Wird bei jedem Laden aufgerufen, wenn Marktquoten verfuegbar sind. Haengt
// nur dann einen neuen Snapshot an, wenn sich die Quote seit dem letzten
// Aufruf tatsaechlich geaendert hat -- dedupliziert wiederholte Aufrufe
// innerhalb desselben Odds-Cache-Fensters statt Rauschen zu schreiben.
export function logPreMatch(entry: {
  matchId: string;
  kickoff: string;
  lH_model: number; lA_model: number;
  lH_blend: number; lA_blend: number;
  oddsH: number; oddsD: number; oddsA: number;
}): void {
  const entries = loadLog();
  const idx = entries.findIndex(e => e.matchId === entry.matchId);
  const snapshot: LearnSnapshot = {
    ts: Date.now(),
    lH_model: entry.lH_model, lA_model: entry.lA_model,
    lH_blend: entry.lH_blend, lA_blend: entry.lA_blend,
    oddsH: entry.oddsH, oddsD: entry.oddsD, oddsA: entry.oddsA,
  };

  if (idx >= 0) {
    const existing = entries[idx];
    const last = existing.snapshots[existing.snapshots.length - 1];
    if (!last || !sameSnapshot(last, snapshot)) {
      existing.snapshots.push(snapshot);
      if (existing.snapshots.length > MAX_SNAPSHOTS_PER_MATCH) {
        existing.snapshots.splice(0, existing.snapshots.length - MAX_SNAPSHOTS_PER_MATCH);
      }
    }
  } else {
    entries.push({ matchId: entry.matchId, kickoff: entry.kickoff, snapshots: [snapshot], actual: null });
  }
  saveLog(entries);
}

// Wird aufgerufen, sobald ein Spiel beendet ist -- traegt das Ergebnis nach.
export function logPostMatch(matchId: string, actual: 'H' | 'D' | 'A'): void {
  const entries = loadLog();
  const idx = entries.findIndex(e => e.matchId === matchId);
  if (idx >= 0 && entries[idx].actual !== actual) {
    entries[idx].actual = actual;
    saveLog(entries);
  }
}

export function readLog(): LearnEntry[] {
  return loadLog();
}

export function getMatchHistory(matchId: string): LearnSnapshot[] {
  return loadLog().find(e => e.matchId === matchId)?.snapshots ?? [];
}

export function exportLogText(): string {
  return JSON.stringify(loadLog(), null, 2);
}

export function logStats(): { total: number; withOutcome: number } {
  const entries = loadLog();
  return {
    total: entries.length,
    withOutcome: entries.filter(e => e.actual !== null).length,
  };
}

// Odds-Freeze: sobald der Anpfiff verstrichen ist, wird die letzte vor dem
// Kickoff geloggte Quote zurueckgegeben statt der aktuell live geladenen --
// verhindert, dass In-Play-Quotenspruenge Anzeige oder Wett-Radar verfaelschen.
export function getFrozenOdds(matchId: string, kickoffISO: string, liveOdds: MarketProbs | null): MarketProbs | null {
  const started = kickoffISO !== '' && Date.now() >= new Date(kickoffISO).getTime();
  if (!started) return liveOdds;
  const history = getMatchHistory(matchId);
  const last = history[history.length - 1];
  if (last) return { h: last.oddsH, d: last.oddsD, a: last.oddsA };
  return liveOdds;
}
