export type Club = {
  code: string;     // Kurzcode für das Logo, z. B. "FCB"
  name: string;     // Anzeigename kurz, z. B. "Bayern"
  fullName: string; // Langname, z. B. "FC Bayern München"
  color: string;    // CSS-Variable aus tokens.css
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
  WOB: { code: 'WOB', name: 'Wolfsburg',   fullName: 'VfL Wolfsburg',             color: 'var(--club-wob)', textOnColor: 'light' },
  SCF: { code: 'SCF', name: 'Freiburg',    fullName: 'SC Freiburg',               color: 'var(--club-scf)', textOnColor: 'light' },
  SVW: { code: 'SVW', name: 'Bremen',      fullName: 'SV Werder Bremen',          color: 'var(--club-svw)', textOnColor: 'light' },
  TSG: { code: 'TSG', name: 'Hoffenheim',  fullName: '1899 Hoffenheim',           color: 'var(--club-tsg)', textOnColor: 'light' },
  MAI: { code: 'MAI', name: 'Mainz',       fullName: '1. FSV Mainz 05',           color: 'var(--club-mai)', textOnColor: 'light' },
  HEI: { code: 'HEI', name: 'Heidenheim',  fullName: '1. FC Heidenheim',          color: 'var(--club-hei)', textOnColor: 'light' },
  S04: { code: 'S04', name: 'Schalke',     fullName: 'FC Schalke 04',             color: 'var(--club-s04)', textOnColor: 'light' },
  HSV: { code: 'HSV', name: 'Hamburg',     fullName: 'Hamburger SV',              color: 'var(--club-hsv)', textOnColor: 'light' },
  BSC: { code: 'BSC', name: 'Hertha',      fullName: 'Hertha BSC',                color: 'var(--club-bsc)', textOnColor: 'light' },
  KOE: { code: 'KOE', name: 'Köln',        fullName: '1. FC Köln',                color: 'var(--club-koe)', textOnColor: 'light' },
};
