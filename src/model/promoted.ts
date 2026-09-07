// Aufsteiger: Uebersetzung von Zweitliga-Ratings in Bundesliga-Priors.
//
// Ein Aufsteiger hat vor Spieltag 1 keine Bundesliga-Daten. Statt Liga-
// Durchschnitt minus geratenem Malus nutzt das Modell seine tatsaechliche
// Zweitliga-Leistung, abgeschwaecht (promotedReliability 0.60) und um einen
// historisch geschaetzten Uebersetzungsfaktor verschoben:
//
//   prior_attack  = 0.60 * attack_BL2  + ln(attackFactor)
//   prior_defense = 0.60 * defense_BL2 + ln(defenseFactor)
//
// Der Faktor beschreibt, wie stark die RELATIVE Torquote eines Aufsteigers
// beim Wechsel nach oben typischerweise faellt (Angriff) bzw. steigt (Abwehr).
// Er wird aus frueheren Aufsteigern geschaetzt: relative geglaettete Torquote
// in der ersten BL1-Saison geteilt durch die relative Torquote in der letzten
// BL2-Saison, gewichtet nach Spielzahl, gemittelt im Log-Raum, begrenzt.
//
// Das ist eine kleine, begrenzte historische Schaetzung, kein eigenes
// Aufsteigermodell. Unter vier Beobachtungen greift der Fallback 0.85/1.15;
// fehlt sogar ein Zweitligarating, der direkte Log-Prior -0.27/0.17
// (entspricht ca. 0.76/1.19 -- bewusst nicht identisch mit dem
// Uebersetzungs-Fallback, siehe Review 5.4).
//
// Der Prior dient im finalen Fit als Startwert UND als Ridge-Zentrum. Das ist
// kein Doppelzaehlen: die Zweitligaspiele sind im Bundesliga-Fit nicht
// enthalten. Bestehende Vereine bekommen dagegen nur einen Startwert und ein
// Ridge-Zentrum bei 0 -- ihre Vorsaison steckt bereits als Trainingsdaten drin.

import type { MatchRecord, Ratings } from '../types.ts';
import type { ModelParams } from './params.ts';

export interface PromotedTranslation {
  attackFactor: number;
  defenseFactor: number;
  observations: number;
  source: 'estimated' | 'fallback';
  /** Einzelbeobachtungen fuer Diagnose. */
  samples: Array<{ teamId: number; season: number; attack: number; defense: number; weight: number }>;
}

export const TRANSLATION_BOUNDS = {
  attack: [0.72, 0.96] as const,
  defense: [1.04, 1.35] as const,
  minGamesPerSeason: 20,
  minObservations: 4,
  /** Glaettung der Torquoten: (Tore + k * Ligaschnitt) / (Spiele + k). */
  smoothing: 5,
};

export function teamIdsOf(matches: readonly MatchRecord[]): Set<number> {
  const s = new Set<number>();
  for (const m of matches) { s.add(m.homeId); s.add(m.awayId); }
  return s;
}

/** Aufsteiger = aktuelle Vereine, die im unmittelbar vorherigen BL1-Bestand fehlen. */
export function promotedTeams(current: readonly MatchRecord[], previousBl1: readonly MatchRecord[]): number[] {
  const prev = teamIdsOf(previousBl1);
  return [...teamIdsOf(current)].filter(id => !prev.has(id)).sort((a, b) => a - b);
}

interface TeamRates { games: number; gf: number; ga: number }

function teamRates(matches: readonly MatchRecord[]): { perTeam: Map<number, TeamRates>; leagueGf: number; leagueGa: number } {
  const perTeam = new Map<number, TeamRates>();
  let totalGoals = 0, totalTeamGames = 0;
  for (const m of matches) {
    if (!m.finished || m.homeGoals === null || m.awayGoals === null) continue;
    const h = perTeam.get(m.homeId) ?? { games: 0, gf: 0, ga: 0 };
    const a = perTeam.get(m.awayId) ?? { games: 0, gf: 0, ga: 0 };
    h.games++; h.gf += m.homeGoals; h.ga += m.awayGoals;
    a.games++; a.gf += m.awayGoals; a.ga += m.homeGoals;
    perTeam.set(m.homeId, h); perTeam.set(m.awayId, a);
    totalGoals += m.homeGoals + m.awayGoals; totalTeamGames += 2;
  }
  const avg = totalTeamGames ? totalGoals / totalTeamGames : 1.4;
  return { perTeam, leagueGf: avg, leagueGa: avg };
}

function smoothedRelative(r: TeamRates, leagueAvg: number, k: number, field: 'gf' | 'ga'): number {
  return ((r[field] + k * leagueAvg) / (r.games + k)) / leagueAvg;
}

/**
 * Schaetzt die Uebersetzungsfaktoren aus Paaren (BL1-Saison S, BL2-Saison S-1).
 * @param pairs  Liste von { bl1: Spiele der BL1-Saison S, bl2: Spiele der BL2-Saison S-1 }
 */
export function estimateTranslation(
  pairs: ReadonlyArray<{ season: number; bl1: readonly MatchRecord[]; bl2: readonly MatchRecord[] }>,
  params: ModelParams,
): PromotedTranslation {
  const k = TRANSLATION_BOUNDS.smoothing;
  const samples: PromotedTranslation['samples'] = [];
  for (const { season, bl1, bl2 } of pairs) {
    const r1 = teamRates(bl1), r2 = teamRates(bl2);
    const bl2Ids = teamIdsOf(bl2);
    for (const id of teamIdsOf(bl1)) {
      if (!bl2Ids.has(id)) continue; // kein Aufsteiger aus dieser BL2-Saison
      const a = r1.perTeam.get(id), b = r2.perTeam.get(id);
      if (!a || !b || a.games < TRANSLATION_BOUNDS.minGamesPerSeason || b.games < TRANSLATION_BOUNDS.minGamesPerSeason) continue;
      const attack = smoothedRelative(a, r1.leagueGf, k, 'gf') / smoothedRelative(b, r2.leagueGf, k, 'gf');
      const defense = smoothedRelative(a, r1.leagueGa, k, 'ga') / smoothedRelative(b, r2.leagueGa, k, 'ga');
      samples.push({ teamId: id, season, attack, defense, weight: Math.min(a.games, b.games) });
    }
  }
  if (samples.length < TRANSLATION_BOUNDS.minObservations) {
    return { attackFactor: params.promotedAttackFactor, defenseFactor: params.promotedDefenseFactor, observations: samples.length, source: 'fallback', samples };
  }
  const wsum = samples.reduce((s, x) => s + x.weight, 0);
  const logA = samples.reduce((s, x) => s + x.weight * Math.log(x.attack), 0) / wsum;
  const logD = samples.reduce((s, x) => s + x.weight * Math.log(x.defense), 0) / wsum;
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
  return {
    attackFactor: clamp(Math.exp(logA), TRANSLATION_BOUNDS.attack),
    defenseFactor: clamp(Math.exp(logD), TRANSLATION_BOUNDS.defense),
    observations: samples.length,
    source: 'estimated',
    samples,
  };
}

export interface PromotedPriors {
  attack: Map<number, number>;
  defense: Map<number, number>;
  source: Map<number, 'bl2-rating' | 'log-fallback'>;
}

export function promotedPriors(
  promotedIds: readonly number[],
  bl2Ratings: Ratings | null,
  translation: PromotedTranslation,
  params: ModelParams,
): PromotedPriors {
  const attack = new Map<number, number>(), defense = new Map<number, number>();
  const source = new Map<number, 'bl2-rating' | 'log-fallback'>();
  const lnA = Math.log(translation.attackFactor), lnD = Math.log(translation.defenseFactor);
  for (const id of promotedIds) {
    const a2 = bl2Ratings?.attack.get(id), d2 = bl2Ratings?.defense.get(id);
    if (a2 !== undefined && d2 !== undefined) {
      attack.set(id, params.promotedReliability * a2 + lnA);
      defense.set(id, params.promotedReliability * d2 + lnD);
      source.set(id, 'bl2-rating');
    } else {
      attack.set(id, params.promotedFallbackAttackLog);
      defense.set(id, params.promotedFallbackDefenseLog);
      source.set(id, 'log-fallback');
    }
  }
  return { attack, defense, source };
}
