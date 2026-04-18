import type { TeamStats } from './poisson';

export type Club = {
  code: string;
  name: string;
  fullName: string;
  color: string;
  textOnColor: 'light' | 'dark';
};

export const CLUBS: Record<string, Club> = {
  FCB: { code: 'FCB', name: 'Bayern',      fullName: 'FC Bayern München',         color: 'var(--club-fcb)', textOnColor: 'light' },
  B04: { code: 'B04', name: 'Leverkusen',  fullName: 'Bayer 04 Leverkusen',       color: 'var(--club-b04)', textOnColor: 'light' },
  RBL: { code: 'RBL', name: 'Leipzig',     fullName: 'RB Leipzig',                color: 'var(--club-rbl)', textOnColor: 'light' },
  SGE: { code: 'SGE', name: 'Frankfurt',   fullName: 'Eintracht Frankfurt',       color: 'var(--club-sge)', textOnColor: 'light' },
  VFB: { code: 'VFB', name: 'Stuttgart',   fullName: 'VfB Stuttgart',             color: 'var(--club-vfb)', textOnColor: 'light' },
  BVB: { code: 'BVB', name: 'Dortmund',    fullName: 'Borussia Dortmund',         color: 'var(--club-bvb)', textOnColor: 'dark'  },
  FCA: { code: 'FCA', name: 'Augsburg',    fullName: 'FC Augsburg',               color: 'var(--club-fca)', textOnColor: 'light' },
  BMG: { code: 'BMG', name: "M'gladbach",  fullName: "Borussia Mönchengladbach",  color: 'var(--club-bmg)', textOnColor: 'light' },
  WOB: { code: 'WOB', name: 'Wolfsburg',   fullName: 'VfL Wolfsburg',             color: 'var(--club-wob)', textOnColor: 'dark'  },
  SCF: { code: 'SCF', name: 'Freiburg',    fullName: 'SC Freiburg',               color: 'var(--club-scf)', textOnColor: 'light' },
  SVW: { code: 'SVW', name: 'Bremen',      fullName: 'SV Werder Bremen',          color: 'var(--club-svw)', textOnColor: 'light' },
  TSG: { code: 'TSG', name: 'Hoffenheim',  fullName: 'TSG 1899 Hoffenheim',       color: 'var(--club-tsg)', textOnColor: 'light' },
  MAI: { code: 'MAI', name: 'Mainz',       fullName: '1. FSV Mainz 05',           color: 'var(--club-mai)', textOnColor: 'light' },
  HEI: { code: 'HEI', name: 'Heidenheim', fullName: '1. FC Heidenheim',          color: 'var(--club-hei)', textOnColor: 'light' },
  UNI: { code: 'UNI', name: 'Union',       fullName: '1. FC Union Berlin',        color: 'var(--club-uni)', textOnColor: 'light' },
  STP: { code: 'STP', name: 'St. Pauli',   fullName: 'FC St. Pauli',              color: 'var(--club-stp)', textOnColor: 'light' },
  HSV: { code: 'HSV', name: 'Hamburg',     fullName: 'Hamburger SV',              color: 'var(--club-hsv)', textOnColor: 'light' },
  KOE: { code: 'KOE', name: 'Köln',        fullName: '1. FC Köln',                color: 'var(--club-koe)', textOnColor: 'light' },
};

// Fallback-Saisonstatistiken (Stand ca. ST23, 2025/26) für den Fall dass API-Daten fehlen
export const FALLBACK_STATS: Record<string, TeamStats> = {
  FCB: { rank:  1, hGF: 2.72, hGA: 0.72, aGF: 2.00, aGA: 1.00 },
  BVB: { rank:  2, hGF: 2.25, hGA: 0.83, aGF: 1.67, aGA: 1.17 },
  TSG: { rank:  3, hGF: 2.20, hGA: 1.20, aGF: 1.55, aGA: 1.67 },
  VFB: { rank:  4, hGF: 2.00, hGA: 1.08, aGF: 1.50, aGA: 1.62 },
  RBL: { rank:  5, hGF: 1.92, hGA: 1.00, aGF: 1.50, aGA: 1.42 },
  B04: { rank:  6, hGF: 1.83, hGA: 0.92, aGF: 1.42, aGA: 1.42 },
  SCF: { rank:  7, hGF: 1.45, hGA: 1.00, aGF: 1.09, aGA: 1.33 },
  SGE: { rank:  8, hGF: 1.67, hGA: 1.17, aGF: 1.25, aGA: 1.50 },
  UNI: { rank:  9, hGF: 1.17, hGA: 1.17, aGF: 0.92, aGA: 1.50 },
  FCA: { rank: 10, hGF: 1.58, hGA: 1.42, aGF: 1.08, aGA: 1.83 },
  HSV: { rank: 11, hGF: 1.42, hGA: 1.08, aGF: 0.92, aGA: 1.42 },
  KOE: { rank: 12, hGF: 1.33, hGA: 1.42, aGF: 0.92, aGA: 1.75 },
  MAI: { rank: 13, hGF: 1.17, hGA: 1.25, aGF: 0.75, aGA: 1.58 },
  BMG: { rank: 14, hGF: 1.25, hGA: 1.33, aGF: 0.92, aGA: 1.67 },
  WOB: { rank: 15, hGF: 1.25, hGA: 1.50, aGF: 0.83, aGA: 1.92 },
  STP: { rank: 16, hGF: 1.08, hGA: 1.42, aGF: 0.75, aGA: 1.75 },
  SVW: { rank: 17, hGF: 1.17, hGA: 1.58, aGF: 0.75, aGA: 1.83 },
  HEI: { rank: 18, hGF: 1.00, hGA: 1.75, aGF: 0.67, aGA: 2.00 },
};
