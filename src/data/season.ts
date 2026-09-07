// Saisonzuordnung: Die Spielzeit wechselt am 1. Juli. Saison 2026 = 2026/27.

export function seasonOf(date: Date): number {
  const month = date.getUTCMonth(); // 0 = Januar
  const year = date.getUTCFullYear();
  return month >= 6 ? year : year - 1;
}

export function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
}
