# BLforecast · Claude Code Context

Leitfaden für die Weiterentwicklung der Bundesliga-Prognose-PWA im Apple-iOS-Design. Diese Datei wird von Claude Code bei jedem Start gelesen.

## Projekt

Bundesliga-Prognose-App mit Poisson-basiertem Statistikmodell und Form-Blending. Oberfläche im Apple-iOS-Design (iOS 17 Human Interface Guidelines). Ziel ist eine PWA, die sich auf dem iPhone anfühlt wie eine native App.

Aktuelle Version: **1.6.0**

## Stack

- React 18, TypeScript, Vite 5
- CSS Modules, keine UI-Library, keine Tailwind
- Schriftart: **Geist** (Variable Font, selbst gehostet in `src/assets/`), SF Pro als Fallback
- Deployment: GitHub Pages, statisch (`npm run deploy`)
- Daten: OpenLigaDB-API (Spieltage, Ergebnisse, Logos), The Odds API (Marktquoten)
- Font-Package: `geist` (npm)

## Dateistruktur

```
src/
├── assets/
│   └── Geist-Variable.woff2     Variable Font, von Vite gebundled
├── styles/
│   ├── tokens.css               Alle Design-Variablen, Light + Dark
│   └── globals.css              Reset, Body-Styles, @font-face Geist
├── components/
│   ├── MatchCard.tsx            Spielkarte (Tipp, Kategorie, Ergebnis)
│   ├── MatchCard.module.css
│   ├── MatchDetailSheet.tsx     Bottom-Sheet mit Modell-Details (swipe to close)
│   ├── MatchDetailSheet.module.css
│   ├── ProbabilityBar.tsx       1X2-Balken (6px, grün/grau/orange)
│   ├── ProbabilityBar.module.css
│   ├── SplashScreen.tsx         Animierter Ladescreen
│   ├── SplashScreen.module.css
│   ├── TeamLogo.tsx             Vereinswappen mit Fallback-Initialen
│   └── TeamLogo.module.css
├── screens/
│   ├── MatchdayScreen.tsx       Hauptscreen: Spieltag-Liste mit Gruppen nach Datum
│   └── MatchdayScreen.module.css
├── lib/
│   ├── poisson.ts               Poisson-Modell + Dixon-Coles + Draw-Boost
│   ├── calibration.ts           Platt-Scaling (buildCalib, applyCalib, shrinkToMean)
│   ├── openligadb.ts            OpenLigaDB-API (fetchSeason, fetchPrevSeason, buildDynST, buildForm)
│   ├── fetchOdds.ts             The Odds API (Marktquoten als MarketProbs)
│   ├── useMatchday.ts           React Hook: Datenaggregation, Kalibrierung, State
│   ├── useTheme.ts              Dark/Light Mode Toggle
│   ├── clubs.ts                 CLUBS-Map (name, kurz, farbe) + FALLBACK_STATS
│   └── backtest.ts              Browser-Backtest (window.__backtest)
├── App.tsx
└── main.tsx
scripts/
├── backtest-run.mjs             Node.js Backtest (2024+2025, rolling calibration)
└── param-sweep.mjs              Grid Search für optimale Modell-Parameter
```

## Designsprache

Apple iOS, mit zwei nicht verhandelbaren Prinzipien:

1. **Flach und ruhig.** Keine Verläufe, keine Schlagschatten, keine Neoneffekte. Karten liegen auf Grau, Inhalte sind auf die Karten gesetzt, dazwischen Weissraum.
2. **Tokens zuerst.** Jede Farbe, jeder Radius, jeder Abstand kommt aus `tokens.css`. iOS-Systemfarben für Interaktion, native iOS-Ratio für Radien und Abstände.

Schriftart: **Geist** (Variable, 100–900) mit SF Pro Fallback. Kein weiteres Font-Paket.

## Komponenten-Regeln

- **CSS Modules.** Jede Komponente bekommt ihr eigenes `Name.module.css`. Keine globalen Klassen ausser den Resets in `globals.css`.
- **Tokens statt Hardcode.** Fehlende Werte in `tokens.css` ergänzen, nicht lokal hardcoden.
- **Dark Mode automatisch.** Durch `prefers-color-scheme` + `html[data-theme='dark']` und Tokens. Niemals `if (darkMode)` in Komponenten.
- **Tabular Numbers.** Alle Zahlen im UI: `font-variant-numeric: tabular-nums` oder `data-numeric`-Attribut.
- **Spielzeit-Gruppen.** Matches werden in MatchdayScreen nach Datum gruppiert (Section-Header "Sa 26.04").
- **TOP-Tipps.** Karten mit `fp >= 0.70` bekommen goldenen Outline-Rahmen + TOP-Badge.

## Modell (Kurzreferenz)

- Poisson + Dixon-Coles (DC_RHO = -0.13)
- Form-Blending: 60% Saison-Statistik + 40% gewichtete Formkurve (DECAY = 0.72)
- Draw-Boost: DRAW_BOOST_MAX = 0.15, DRAW_BOOST_RANGE = 0.40
- Platt-Kalibrierung: aus 2024 + 2025 Saison (rolling, kein Data-Leakage)
- Newton-Raphson Marktkorrektur auf Buchmacher-Quoten
- Backtest-Genauigkeit: 54.2% 1X2, 15.8% Remis erkannt, 69.2% TOP-Tipps

## Muster-Workflow für Claude Code

1. Lies `tokens.css` für vorhandene Variablen.
2. Lies `MatchCard.tsx` als Referenz-Komponente (Struktur, CSS-Module, Tokens).
3. Neue Komponente nach demselben Schema bauen.
4. TypeScript-Check: `npx tsc --noEmit`
5. Build + Deploy: `npm run build && npm run deploy`
6. Version in `package.json` bumpen (Minor bei Features, Patch bei Fixes).

## Nicht machen

- Kein Tailwind, kein styled-components, kein Emotion.
- Keine UI-Libraries (shadcn, MUI, Ant Design, Chakra).
- Keine Icon-Pakete ausser SF-Symbols-Nachbauten als Inline-SVG.
- Keine Animationen schwerer als `transition: opacity/transform 0.3s`.
- Keine Schatten oder Verläufe (ausser Blur im Sheet-Overlay).
- Keine em-Dashes im UI-Text oder in Commit-Messages.
- Kein separates Deployment pro Feature — Änderungen bündeln.

## Nächste Schritte

- [ ] Bundesliga-Tabelle (eigener Tab, aus Saison-Daten ableitbar)
- [ ] Favoriten-Filter mit LocalStorage
- [ ] Saisonprognose per Monte-Carlo-Simulation (10 000 Saisons)
- [ ] Tab-Bar Navigation (Spieltag / Tabelle / Saison)
- [ ] PWA Service Worker (Offline-Support, Cache-Strategie)
- [ ] Push-Notifications zu Spielbeginn (siehe BL Ticker für Pattern)
