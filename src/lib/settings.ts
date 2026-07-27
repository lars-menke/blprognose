// Wett-Radar: EV-basierte Wettvorschlaege ein-/ausblenden. Ausgeschaltet
// bleibt die App ein reines Prognosemodell ohne Wettbezug. Kein
// Modell-Modus-Schalter (anders als wmforecast): BLforecast nutzt eine
// einzige Rechenkette -- die WM-Lektion war, dass ein Elo-Parallelmodell
// ohne empirischen Nachweis mehr Komplexitaet als Nutzen bringt.

const BET_RADAR_KEY = 'bl_betradar_v1';

export function isBetRadarEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(BET_RADAR_KEY) === 'off') {
      return false;
    }
  } catch { /* ignore */ }
  return true;
}

export function setBetRadarEnabled(on: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BET_RADAR_KEY, on ? 'on' : 'off');
  } catch { /* ignore */ }
}
