# wmforecast · Claude Code Context

Leitfaden fur die Entwicklung der WM-Prognose-PWA im Apple-iOS-Design.
Diese Datei ersetzt bei einem neuen Repo die CLAUDE.md und wird von Claude Code bei jedem Start gelesen.

Aktuelle Version: **1.0.0**

---

## Projekt

WM-Prognose-App auf Basis des bewahrten Poisson-Modells aus BLforecast (Bundesliga).
Oberfläche im Apple-iOS-Design (iOS 17 Human Interface Guidelines). Ziel ist eine PWA,
die sich auf dem iPhone anfühlt wie eine native App. Das Modell prognostiziert Gruppenspiele
und K.o.-Runden der Weltmeisterschaft mit 1X2-Wahrscheinlichkeiten.

---

## Stack

- React 18, TypeScript, Vite 5
- CSS Modules, keine UI-Library, keine Tailwind
- Schriftart: **Geist** (Variable Font, selbst gehostet), SF Pro als Fallback
- Deployment: GitHub Pages, statisch (`npm run deploy`)
- Daten: eigene JSON-Datendatei fur WM-Spielplan + optional The Odds API fur Marktquoten
- Font-Package: `geist` (npm), `geist/font/geist-variable` als woff2 in `src/assets/`

### package.json (Startpunkt)

```json
{
  "name": "wmforecast",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "deploy": "gh-pages -d dist"
  },
  "dependencies": {
    "geist": "^1.7.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "gh-pages": "^6.1.1",
    "typescript": "^5.5.3",
    "vite": "^5.3.1"
  }
}
```

---

## Dateistruktur

```
src/
├── assets/
│   └── Geist-Variable.woff2         Variable Font, von Vite gebundled
├── styles/
│   ├── tokens.css                   Alle Design-Variablen, Light + Dark
│   └── globals.css                  Reset, Body-Styles, @font-face Geist
├── components/
│   ├── MatchCard.tsx                Spielkarte (Tipp, Kategorie, Ergebnis)
│   ├── MatchCard.module.css
│   ├── MatchDetailSheet.tsx         Bottom-Sheet mit Modell-Details (swipe to close)
│   ├── MatchDetailSheet.module.css
│   ├── ProbabilityBar.tsx           1X2-Balken (6px, grün/grau/orange)
│   ├── ProbabilityBar.module.css
│   ├── SplashScreen.tsx             Animierter Ladescreen
│   ├── SplashScreen.module.css
│   ├── TeamLogo.tsx                 Flagge/Wappen mit Fallback-Initialen
│   └── TeamLogo.module.css
├── screens/
│   ├── GroupScreen.tsx              Gruppenphase: Spiele gruppiert nach Gruppe (A-H)
│   ├── GroupScreen.module.css
│   ├── KnockoutScreen.tsx           K.o.-Runden: Achtelfinale bis Finale
│   └── KnockoutScreen.module.css
├── lib/
│   ├── poisson.ts                   Poisson-Modell + Dixon-Coles + Draw-Boost
│   ├── calibration.ts               Platt-Scaling (buildCalib, applyCalib, shrinkToMean)
│   ├── schedule.ts                  WM-Spielplan (statische JSON-Daten)
│   ├── fetchOdds.ts                 The Odds API (Marktquoten als MarketProbs)
│   ├── useMatches.ts                React Hook: Datenaggregation, Kalibrierung, State
│   ├── useTheme.ts                  Dark/Light Mode Toggle
│   └── nations.ts                   NATIONS-Map (name, kurz, farbe) + TEAM_STATS
├── App.tsx
└── main.tsx
scripts/
└── backtest.mjs                     Node.js Backtest fur Parameteroptimierung
```

---

## Designsprache

Apple iOS 17 Human Interface Guidelines. Zwei nicht verhandelbare Prinzipien:

1. **Flach und ruhig.** Keine Verläufe, keine Schlagschatten, keine Neoneffekte.
   Karten auf Grau, Inhalte auf Karten gesetzt, dazwischen Weissraum.
2. **Tokens zuerst.** Jede Farbe, jeder Radius, jeder Abstand kommt aus `tokens.css`.

Schriftart: **Geist** (Variable, 100-900) mit SF Pro Fallback.

---

## tokens.css (vollstandig)

```css
/* tokens.css — BLforecast / wmforecast Design-Tokens */

:root {
  /* Hintergründe (Light) */
  --bg-page:        #F2F2F7;
  --bg-card:        #FFFFFF;
  --bg-fill:        rgba(118, 118, 128, 0.12);
  --bg-fill-strong: rgba(118, 118, 128, 0.24);
  --bg-track:       #F2F2F7;
  --bg-tabbar:      rgba(249, 249, 249, 0.94);

  /* Text (Light) */
  --text-primary:   #000000;
  --text-secondary: #8E8E93;
  --text-tertiary:  #C7C7CC;
  --text-on-accent: #FFFFFF;

  /* Systemfarben (Light) */
  --system-blue:    #007AFF;
  --system-green:   #34C759;
  --system-orange:  #FF9500;
  --system-red:     #FF3B30;
  --system-yellow:  #FFCC00;
  --system-teal:    #5AC8FA;
  --system-gray:    #8E8E93;
  --system-neutral: #C7C7CC;

  /* Trennlinien */
  --separator:        rgba(60, 60, 67, 0.18);
  --separator-opaque: rgba(60, 60, 67, 0.36);

  /* Typografie */
  --font-sans:
    'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
    'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, monospace;

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  --size-large-title: 30px;
  --size-title-1:     24px;
  --size-title-2:     20px;
  --size-headline:    17px;
  --size-body:        15px;
  --size-callout:     14px;
  --size-subhead:     13px;
  --size-footnote:    12px;
  --size-caption-1:   11px;
  --size-caption-2:   10px;

  /* Radien */
  --radius-card:            12px;
  --radius-control:         9px;
  --radius-segmented-thumb: 7px;
  --radius-button:          8px;
  --radius-logo:            4px;
  --radius-pill:            999px;

  /* Abstände (4er-Raster) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;

  /* Linien */
  --hairline: 0.33px;

  /* Focus */
  --focus-ring: 0 0 0 3px rgba(0, 122, 255, 0.4);

  /* Icon-Palette */
  --icon-bg:     #0A1628;
  --icon-accent: #F4C430;
  --icon-white:  #FFFFFF;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-page:        #000000;
    --bg-card:        #1C1C1E;
    --bg-fill:        rgba(118, 118, 128, 0.24);
    --bg-fill-strong: rgba(118, 118, 128, 0.36);
    --bg-track:       #2C2C2E;
    --bg-tabbar:      rgba(28, 28, 30, 0.94);
    --text-primary:   #FFFFFF;
    --text-secondary: #98989E;
    --text-tertiary:  #6C6C70;
    --system-blue:    #0A84FF;
    --system-green:   #30D158;
    --system-orange:  #FF9F0A;
    --system-red:     #FF453A;
    --system-yellow:  #FFD60A;
    --system-teal:    #64D2FF;
    --system-gray:    #98989E;
    --system-neutral: #636366;
    --separator:        rgba(84, 84, 88, 0.65);
    --separator-opaque: rgba(84, 84, 88, 0.85);
  }
}

html[data-theme='dark'] {
  color-scheme: dark;
  --bg-page:        #000000;
  --bg-card:        #1C1C1E;
  --bg-fill:        rgba(118, 118, 128, 0.24);
  --bg-fill-strong: rgba(118, 118, 128, 0.36);
  --bg-track:       #2C2C2E;
  --bg-tabbar:      rgba(28, 28, 30, 0.94);
  --text-primary:   #FFFFFF;
  --text-secondary: #98989E;
  --text-tertiary:  #6C6C70;
  --system-blue:    #0A84FF;
  --system-green:   #30D158;
  --system-orange:  #FF9F0A;
  --system-red:     #FF453A;
  --system-yellow:  #FFD60A;
  --system-teal:    #64D2FF;
  --system-gray:    #98989E;
  --system-neutral: #636366;
  --separator:        rgba(84, 84, 88, 0.65);
  --separator-opaque: rgba(84, 84, 88, 0.85);
}
```

---

## globals.css (vollstandig)

```css
@import './tokens.css';

@font-face {
  font-family: 'Geist';
  src: url('../assets/Geist-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

*,
*::before,
*::after { box-sizing: border-box; }

html, body, #root { margin: 0; padding: 0; height: 100%; }

html {
  -webkit-text-size-adjust: 100%;
  color-scheme: light dark;
}

body {
  font-family: var(--font-sans);
  font-size: var(--size-body);
  font-weight: var(--weight-regular);
  line-height: 1.4;
  color: var(--text-primary);
  background: var(--bg-page);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

button {
  font-family: inherit;
  font-size: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
}

button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--radius-button);
}

a { color: var(--system-blue); text-decoration: none; }

.num, [data-numeric] { font-variant-numeric: tabular-nums; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0;
  margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
  white-space: nowrap; border: 0;
}

/* Safe-Area-Insets fur iOS-PWA im Home-Screen-Modus */
.safe-top    { padding-top:    env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-left   { padding-left:   env(safe-area-inset-left); }
.safe-right  { padding-right:  env(safe-area-inset-right); }
```

---

## Modell: poisson.ts (vollstandig ubertragen)

Kopiere `poisson.ts` unverandert aus BLforecast. Die Logik ist turnierfähig:
- Poisson + Dixon-Coles-Korrektur (DC_RHO = -0.13)
- Form-Blending: 60% Saison-Statistik + 40% gewichtete Formkurve (FORM_WEIGHT = 0.40, DECAY = 0.72)
- Draw-Boost: DRAW_BOOST_MAX = 0.15, DRAW_BOOST_RANGE = 0.40
- Newton-Raphson Marktkorrektur auf Buchmacher-Quoten (12 Iterationen, damp = 0.5)
- Lambda-Grenzen: [0.3, 4.5]
- Tormatrix: 0..7 pro Team (M = 7), mit dcTau-Korrektur fur 0:0, 1:0, 0:1, 1:1

### Wichtige Typen

```typescript
export type TeamStats = {
  rank: number;
  hGF: number; hGA: number;   // Heimschnitt: Tore geschossen/kassiert
  aGF: number; aGA: number;   // Auswärtsschnitt
};

export type FormData = { gf: number; ga: number } | null;
export type MarketProbs = { h: number; d: number; a: number };  // Prozentpunkte (0-100)
export type Outcome = 'H' | 'D' | 'A';

export type CalcResult = {
  pH: number; pD: number; pA: number;     // kalibrierte Wahrscheinlichkeiten
  naturalTipp: string | null;              // z.B. "2:1"
  wo: Outcome;
  srt: Array<[string, number]>;            // alle Ergebnisse sortiert nach Wahrscheinlichkeit
  lH: number; lA: number;                  // effektive Lambda-Werte
  fp: number;                              // max(pH, pD, pA) = Konfidenz
  drawBlocked: boolean;
  goalRuleApplied: boolean;
  favScoreRuleApplied: boolean;
  lambdaDiff: number;
  effectiveDrawThreshold: number;
  marketApplied: boolean;
  calibrated: boolean;
};
```

### Anpassungen fur WM

Fur internationale Teams gibt es kein Heim/Auswaerts-Splitting wie in der Liga.
Losung: WM-Spiele werden immer mit neutralem Feld berechnet.
Dazu `hGF == aGF` und `hGA == aGA` setzen (symmetrisch), oder einen eigenen Neutral-Modus implementieren:

```typescript
// Neutral-ground: nutze Durchschnitt aus Heim- und Auswaertswerten
const effH = (stats.hGF + stats.aGF) / 2;
const effA = (stats.hGA + stats.aGA) / 2;
// lH = lA aus der Sicht, wer zu Heim/Auswaerts zugewiesen wird, spielt keine Rolle
```

---

## Kalibrierung: calibration.ts (vollstandig ubertragen)

Kopiere `calibration.ts` unverandert aus BLforecast.

```typescript
export type CalibParams = {
  aH: number; bH: number;
  aD: number; bD: number;
  aA: number; bA: number;
  n: number;
};

export type CalibSample = {
  pH: number; pD: number; pA: number;
  actual: 'H' | 'D' | 'A';
};
```

- `buildCalib(samples, minSamples = 45)`: Platt-Skalierung via Gradient-Descent auf Log-Loss
- `applyCalib(pH, pD, pA, params)`: Sigmoid-Transformation, normalisiert auf Summe 1
- `shrinkToMean(pH, pD, pA)`: Fallback (Shrink 0.88 zum Prior 1/3)

Fur WM: Kalibrierung entweder aus WM-2022-Daten vorberechnen und als Konstante hardcoden,
oder aus Länderspiel-Daten der letzten 12 Monate aufbauen.

---

## Datenschicht: Hybrid-Ansatz (statisch + Live-API)

OpenLigaDB entfallt komplett. Die Datenschicht besteht aus drei Schichten:

| Schicht | Quelle | Aktualisierung |
|---|---|---|
| Spielplan (Ansetzungen) | statisches JSON `schedule.ts` | einmalig, vor Turnierbeginn |
| Ergebnisse (Spielstand) | football-data.org API | Live wahrend Turnier |
| Marktquoten | The Odds API | 6h-Cache |

---

## schedule.ts (statischer Spielplan)

```typescript
// src/lib/schedule.ts

export type WmMatch = {
  id: string;             // z.B. "1" (API-ID) oder "GER-SUI-G1"
  apiId: number;          // football-data.org match ID
  group: string;          // "A" bis "L" (WM 2026: 12 Gruppen), oder "R32","R16","QF","SF","3RD","F"
  stage: WmStage;
  home: string;           // 3-letter FIFA code, z.B. "GER"
  away: string;
  kickoff: string;        // ISO-8601 UTC
};

export type WmStage =
  | 'GROUP_STAGE'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL';

// WM 2026: 48 Teams, 12 Gruppen (A-L), 104 Spiele
// Gruppenphase: 11. Juni - 2. Juli 2026
// K.o.-Runde: 4. Juli - 19. Juli 2026
export const WM_SCHEDULE: WmMatch[] = [
  { id: 'MEX-RSA-G1', apiId: 1, group: 'A', stage: 'GROUP_STAGE',
    home: 'MEX', away: 'RSA', kickoff: '2026-06-11T20:00:00Z' },
  // ... alle 104 Spiele (apiId aus football-data.org holen)
];
```

---

## fetchResults.ts (football-data.org API)

Ersetzt `openligadb.ts` vollstandig fur Ergebnisse.

```typescript
// src/lib/fetchResults.ts

const FD_BASE = 'https://api.football-data.org/v4';
const FD_KEY = import.meta.env.VITE_FD_API_KEY ?? '';
const WC_CODE = 'WC';               // competition code fur FIFA World Cup
const CACHE_KEY = 'wm_results_v1';
const CACHE_TTL = 3 * 60 * 1000;   // 3 Minuten (Free-Tier: 10 req/min)

// Exaktes Response-Schema der football-data.org v4 API
type FdMatch = {
  id: number;
  utcDate: string;
  status: 'SCHEDULED' | 'LIVE' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  stage: string;             // "GROUP_STAGE", "ROUND_OF_16", "QUARTER_FINALS" etc.
  group: string | null;      // "GROUP_A" ... "GROUP_L" (nur Gruppenphase)
  homeTeam: { id: number; name: string; shortName: string; tla: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string; crest: string };
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
    duration: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
    fullTime:  { home: number | null; away: number | null };
    halfTime:  { home: number | null; away: number | null };
    extraTime: { home: number | null; away: number | null };
    penalties: { home: number | null; away: number | null };
  };
};

// Mapping: football-data.org tla -> FIFA-Code in nations.ts
// Nötig weil die API teils abweichende 3-Letter-Codes verwendet
const TLA_MAP: Record<string, string> = {
  GER: 'GER', BRA: 'BRA', FRA: 'FRA', ARG: 'ARG',
  ENG: 'ENG', ESP: 'ESP', POR: 'POR', NED: 'NED',
  USA: 'USA', MEX: 'MEX', CAN: 'CAN',
  // ... alle 48 Nationen
};

export type MatchResult = {
  apiId: number;
  g1: number;
  g2: number;
  finished: boolean;
};

export async function fetchResults(): Promise<Record<number, MatchResult>> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  if (!FD_KEY) return {};

  try {
    const r = await fetch(
      `${FD_BASE}/competitions/${WC_CODE}/matches`,
      { headers: { 'X-Auth-Token': FD_KEY } }
    );
    if (!r.ok) return {};

    const { matches }: { matches: FdMatch[] } = await r.json();

    const data: Record<number, MatchResult> = {};
    for (const m of matches) {
      if (m.status !== 'FINISHED') continue;
      data[m.id] = {
        apiId: m.id,
        g1: m.score.fullTime.home ?? 0,
        g2: m.score.fullTime.away ?? 0,
        finished: true,
      };
    }

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch { /* storage full */ }

    return data;
  } catch {
    return {};
  }
}
```

### Authentifizierung

```
Header: X-Auth-Token: <dein-api-key>
```

API-Key kostenlos registrieren: https://www.football-data.org/client/register

### Rate-Limits Free-Tier

| Plan | Requests/Minute | Anmerkung |
|---|---|---|
| Free (unauthentifiziert) | 100/24h, nur Competitions-Liste | nicht nutzbar |
| Free (registriert) | 10 req/min | ausreichend fur WM |
| Standard | 30 req/min | - |

Response-Header zur Überwachung: `X-Requests-Available-Minute`, `X-RequestCounter-Reset`
HTTP 429 bei Überschreitung.

### Umgebungsvariable (.env)

```
VITE_FD_API_KEY=dein_key_hier
VITE_ODDS_API_KEY=dein_key_hier
```

---

## Nationendaten: nations.ts

Analog zu `clubs.ts`. Enthalt fur jede Nation: Code, Name, Kurzname, Flaggen-Emoji,
Teamfarbe, und historische Statistiken als `TeamStats`.

```typescript
import type { TeamStats } from './poisson';

export type Nation = {
  code: string;          // "GER"
  name: string;          // "Deutschland"
  shortName: string;     // "DFB"
  flag: string;          // Flaggen-Emoji "🇩🇪"
  color: string;         // CSS-Variable oder Hex
  textOnColor: 'light' | 'dark';
};

export const NATIONS: Record<string, Nation> = {
  GER: { code: 'GER', name: 'Deutschland', shortName: 'DFB', flag: '🇩🇪', color: '#000000', textOnColor: 'light' },
  // ... alle 32 Nationen
};

// Historische Länderspiel-Statistiken (letzte 2 Jahre, gewichtet)
// Da WM auf neutralem Boden: hGF = aGF (symmetrisch)
export const NATION_STATS: Record<string, TeamStats> = {
  GER: { rank: 1, hGF: 1.85, hGA: 0.95, aGF: 1.85, aGA: 0.95 },
  // ...
};
```

---

## Marktquoten: fetchOdds.ts

Kopiere `fetchOdds.ts` aus BLforecast und passe an:
- Sport-Key andern: `soccer_germany_bundesliga` -> `soccer_world_cup` (The Odds API)
- `ODDS_TEAM_MAP` auf WM-Nationen anpassen
- Cache-Key: `wm_odds_v1`
- Umgebungsvariable: `VITE_ODDS_API_KEY`

```typescript
const CACHE_KEY = 'wm_odds_v1';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

const ODDS_TEAM_MAP: Record<string, string> = {
  'Germany': 'GER',
  'Brazil': 'BRA',
  'France': 'FRA',
  // ... alle Nationen wie sie die Odds API benennt
};
```

---

## React Hook: useMatches.ts

Zusammenfuhrung aller Datenquellen. Analogie zu `useMatchday.ts`, aber vereinfacht:
kein dynamisches `buildDynST` (Teamstatistiken sind pre-game statisch).

```typescript
// src/lib/useMatches.ts

import { useState, useEffect } from 'react';
import { WM_SCHEDULE, type WmStage } from './schedule';
import { fetchResults } from './fetchResults';
import { fetchOdds } from './fetchOdds';
import { recalcMatches, type MatchResult } from './poisson';
import { NATION_STATS } from './nations';
import { HARDCODED_CALIB } from './calibration';  // vorberechnete WM-Kalibrierung

export type MatchEntry = {
  id: string;
  apiId: number;
  group: string;
  stage: WmStage;
  home: string;
  away: string;
  kickoff: string;
  result: MatchResult;
  actual: { g1: number; g2: number } | null;
  finished: boolean;
};

export type MatchesState = {
  loading: boolean;
  error: string | null;
  stage: 'group' | 'knockout';
  selectedGroup: string;
  matches: MatchEntry[];
  hasMarket: boolean;
  setStage: (s: 'group' | 'knockout') => void;
  setSelectedGroup: (g: string) => void;
};

export function useMatches(): MatchesState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'group' | 'knockout'>('group');
  const [selectedGroup, setSelectedGroup] = useState('A');
  const [resultsMap, setResultsMap] = useState<Record<number, { g1: number; g2: number; finished: boolean }>>({});
  const [oddsMap, setOddsMap] = useState<Record<string, import('./poisson').MarketProbs>>({});

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [results, odds] = await Promise.all([fetchResults(), fetchOdds()]);
        if (cancelled) return;
        setResultsMap(results);
        setOddsMap(odds);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ladefehler');
          setLoading(false);
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Spiele zusammenbauen
  const matchInputs = WM_SCHEDULE.map(m => ({
    id: m.id,
    home: m.home,
    away: m.away,
    p: oddsMap[`${m.home}-${m.away}`] ?? null,
    hForm: null,   // keine Formkurve bei WM (zu wenige Spiele)
    aForm: null,
  }));

  const calcResults = recalcMatches(matchInputs, NATION_STATS, {}, HARDCODED_CALIB);

  const matches: MatchEntry[] = WM_SCHEDULE.map(m => {
    const res = resultsMap[m.apiId];
    return {
      id: m.id,
      apiId: m.apiId,
      group: m.group,
      stage: m.stage,
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      result: calcResults[m.id],
      actual: res ? { g1: res.g1, g2: res.g2 } : null,
      finished: res?.finished ?? false,
    };
  }).filter(m => m.result);

  const hasMarket = matches.some(m => m.result.marketApplied);

  return { loading, error, stage, selectedGroup, matches, hasMarket, setStage, setSelectedGroup };
}
```

### Datenfluss (Reihenfolge)

```
WM_SCHEDULE (statisch)
    │
    ├─► fetchResults()   football-data.org → welche Spiele sind fertig + Endstand
    ├─► fetchOdds()      The Odds API → Marktquoten fur laufende/nächste Spiele
    │
    ▼
recalcMatches(NATION_STATS, HARDCODED_CALIB)
    │
    ▼
MatchEntry[] (Prognose + ggf. Ergebnis)
```

### Kein buildDynST / kein buildForm

Im Gegensatz zur Bundesliga gibt es bei der WM keine rollierenden Saisonstatistiken.
`NATION_STATS` sind fix (historische Länderspieldaten, pre-game berechnet).
`hForm` / `aForm` = `null` fur alle Spiele (zu wenige WM-Spiele fur sinnvolle Formkurve).
Draw-Boost und Kalibrierung bleiben aktiv.

---

## Komponenten-Regeln

- **CSS Modules.** Jede Komponente `Name.tsx` + `Name.module.css`. Keine globalen Klassen ausser Reset.
- **Tokens statt Hardcode.** Fehlende Werte in `tokens.css` erganzen, nie lokal hardcoden.
- **Dark Mode automatisch.** `prefers-color-scheme` + `html[data-theme='dark']` via Tokens. Kein `if (darkMode)`.
- **Tabular Numbers.** Alle Zahlen: `font-variant-numeric: tabular-nums` oder `data-numeric`-Attribut.
- **TOP-Tipps.** Karten mit `fp >= 0.70` bekommen goldenen Outline-Rahmen + TOP-Badge.
- **Kategorie-Logik:** `fp >= 0.70` = Favorit (gold), `fp >= 0.55` = Kante (blau), sonst = 50/50 (grau).

### MatchCard-Struktur (Referenz-Komponente)

```tsx
// Akkurate Wiedergabe der BLforecast-Struktur:
<button className={`${styles.card}${topTip ? ` ${styles.cardTop}` : ''}`} onClick={onClick}>
  <div className={`${styles.accentStripe} ${styles[cat.stripe]}`} />
  <div className={styles.inner}>
    <div className={styles.header}>
      <span className={styles.meta}>{kickoff}</span>
      <div className={styles.badges}>
        {topTip && <span className={`${styles.badge} ${styles.badgeTop}`}>TOP</span>}
        <span className={`${styles.badge} ${styles[cat.badge]}`}>{cat.label}</span>
      </div>
    </div>
    <div className={styles.body}>
      {/* Teams mit Flagge/Logo + Tipp-Score */}
    </div>
    <ProbabilityBar home={result.pH} draw={result.pD} away={result.pA} />
  </div>
</button>
```

### ProbabilityBar

Horizontaler Dreiteiler (Heim / Remis / Auswarts):
- Hohe: 6px
- Heim: `var(--system-green)`
- Remis: `var(--system-neutral)`
- Auswarts: `var(--system-orange)`
- Übergänge: keine Animation, statisch

### TeamLogo / FlagDisplay

Fur WM: Flaggen-Emoji als primares Display, Fallback: Initialen des Nation-Codes.
Kein externes Bild-Fetch notwendig.

---

## Navigation / Screens

### GroupScreen.tsx

Zeigt Gruppenphase. Section-Header pro Gruppe ("Gruppe A", "Gruppe B" ...).
Innerhalb jeder Gruppe: Spiele chronologisch sortiert.

```tsx
// Props
type Props = {
  group: string;          // "A"
  matches: MatchEntry[];
};
```

### KnockoutScreen.tsx

Zeigt K.o.-Runden. Section-Header pro Runde ("Achtelfinale", "Viertelfinale", ...).
K.o.-Spiele ohne Penaltyprognose (nur 90-Minuten-Ergebnis und Verlängerung zusammen).

### Tab-Bar

Zwei Tabs: "Gruppenphase" / "K.o.-Runde". Dritter Tab optional: "Tabelle" (Gruppentabellen).

---

## vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/wmforecast/',  // GitHub-Pages-Unterordner, an Repo-Namen anpassen
});
```

---

## PWA: index.html

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="WM 2026" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>WM 2026 Prognose</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## Muster-Workflow fur Claude Code

1. Lies `tokens.css` fur vorhandene Variablen.
2. Lies `MatchCard.tsx` + `MatchCard.module.css` als Referenz-Komponente.
3. Neue Komponente nach demselben Schema bauen (CSS Module, Tokens, kein Inline-Style).
4. TypeScript-Check: `npx tsc --noEmit`
5. Build + Deploy: `npm run build && npm run deploy`
6. Version in `package.json` bumpen (Minor bei Features, Patch bei Fixes).

---

## Nicht machen

- Kein Tailwind, kein styled-components, kein Emotion.
- Keine UI-Libraries (shadcn, MUI, Ant Design, Chakra).
- Keine Icon-Pakete ausser SF-Symbols-Nachbauten als Inline-SVG.
- Keine Animationen schwerer als `transition: opacity/transform 0.3s`.
- Keine Schatten oder Verläufe (ausser Blur im Sheet-Overlay).
- Keine em-Dashes im UI-Text oder in Commit-Messages.
- Kein separates Deployment pro Feature.
- Kein `if (darkMode)` in Komponenten.

---

## Nächste Schritte (Backlog)

- [ ] WM-2026-Spielplan komplett einpflegen (48 Gruppenspiele + K.o.-Bracket)
- [ ] Nationenstatistiken aus FIFA-Länderspieldaten (2024-2026) aufbauen
- [ ] Kalibrierung aus WM 2022 + WM 2018 vorberechnen und hardcoden
- [ ] Gruppentabellen-Tab (aus Ergebnisdaten ableitbar)
- [ ] Monte-Carlo Turnierprognose (10 000 Simulationen, Titelchancen je Nation)
- [ ] PWA Service Worker (Offline-Support, Cache-Strategie)
- [ ] The Odds API Anbindung fur WM-Marktquoten
