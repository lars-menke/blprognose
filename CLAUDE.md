# BLforecast · Claude Code Context

Leitfaden für die Weiterentwicklung der Bundesliga-Prognose-PWA im Apple-iOS-Design. Diese Datei wird von Claude Code bei jedem Start gelesen.

## Projekt

Bundesliga-Prognose-App mit Poisson-basiertem Statistikmodell, Form-Blending, Marktkorrektur und Monte-Carlo-Saisonprognose. Oberfläche im Apple-iOS-Design (iOS 17 Human Interface Guidelines). Ziel ist eine PWA, die sich auf dem iPhone anfühlt wie eine native App.

Aktuelle Version: **2.0.1**

> **Vor dem ersten Lauf mit echten Daten:** `docs/beta-checkliste.md` abarbeiten.
> Die gesamte Migration entstand ohne Netzwerkzugriff — Punkt 1 der Liste
> (Vereins-Maps gegen den echten 26/27-Kader) kann alles Weitere unbrauchbar
> machen und scheitert lautlos.

Das Projekt teilt seine Herkunft mit `wmforecast` (WM-2026-Prognose-App, forkte ursprünglich BLforecasts Poisson-Modell). Nach der WM 2026 wurden die dortigen Lernprotokoll-, Wett-Radar- und Kalibrierungs-Erkenntnisse zurück nach BLforecast portiert (siehe `docs/bl-migration-playbook.md` und `docs/calibration-analysis.md`). BLforecasts eigener Modellkern (Dixon-Coles-Draw-Boost, Monokultur-Schutz, echter Heim-/Auswärtssplit) war dabei bereits weiter entwickelt als wmforecast und wurde beibehalten statt überschrieben.

## Stack

- React 18, TypeScript, Vite 5
- CSS Modules, keine UI-Library, keine Tailwind
- Schriftart: **Geist** (Variable Font, selbst gehostet in `src/assets/`), SF Pro als Fallback
- Deployment: GitHub Pages, statisch (`npm run deploy`)
- Daten: OpenLigaDB-API (Spieltage, Ergebnisse, Logos), Fallback football-data.org, The Odds API (Marktquoten)
- Tests: Vitest (`npm test`)
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
│   ├── MatchDetailSheet.tsx     Bottom-Sheet mit Modell-Details, Modell-vs-Markt (swipe to close)
│   ├── ProbabilityBar.tsx       1X2-Balken (6px, grün/grau/orange)
│   ├── SplashScreen.tsx         Animierter Ladescreen
│   ├── TabBar.tsx               Tab-Navigation (Spieltag / Tabelle / Saison / Modell)
│   └── TeamLogo.tsx             Vereinswappen mit Fallback-Initialen
├── screens/
│   ├── MatchdayScreen.tsx       Spieltag-Liste nach Datum gruppiert, Wett-Radar-Panel
│   ├── TableScreen.tsx          Tabelle mit CL/EL/Conference/Abstiegs-Badges
│   ├── SeasonScreen.tsx         Saisonprognose (Monte-Carlo, 5000 Simulationen)
│   └── ProfileScreen.tsx        "Modell"-Tab: Einstellungen (Cluster-Gliederung), Modell-Erklärung, Lernprotokoll-Export
├── lib/
│   ├── poisson.ts               Poisson + Dixon-Coles + Draw-Boost + Dissens-Signal + Markt-Blend (MARKET_BLEND)
│   ├── calibration.ts           Platt-Scaling (buildCalib, applyCalib, shrinkToMean)
│   ├── openligadb.ts            OpenLigaDB-API (fetchSeason, fetchPrevSeason, buildDynST, buildDynSTWithPriors, buildForm)
│   ├── footballData.ts          football-data.org Fallback, falls OpenLigaDB ausfaellt
│   ├── fetchOdds.ts             The Odds API (MarketProbs fuer Modell + RawOdds fuer Wett-Radar)
│   ├── learnLog.ts              Lernprotokoll v2 (Zeitreihe Modell/Markt-Snapshots), Odds-Freeze bei Anpfiff
│   ├── betRadar.ts              Wett-Radar (EV, Kelly) + Paper-Trading-Konto
│   ├── settings.ts              Wett-Radar an/aus (kein Modell-Modus-Schalter -- ein Modell, keine Parallelwelten)
│   ├── modelChain.ts            DIE Rechenkette: Statistik + Markt + Kalibrierung, einmal pro Session, von allen Hooks geteilt
│   ├── useMatchday.ts           React Hook: Spieltag-Ansicht, Lernprotokoll, Wett-Radar, State
│   ├── useSeason.ts             React Hook: Monte-Carlo-Saisonprognose (nutzt dieselbe modelChain)
│   ├── useStandings.ts          React Hook: Tabellenberechnung
│   ├── useLogos.ts              React Hook: Vereinswappen laden
│   ├── useTheme.ts              Dark/Light Mode Toggle
│   ├── clubs.ts                 CLUBS-Map (name, kurz, farbe) + FALLBACK_STATS (18 Vereine)
│   └── backtest.ts              Browser-Backtest (window.__backtest), massgebliche Abnahme-Referenz
├── App.tsx
└── main.tsx
scripts/
├── analyze-learnlog.mjs         Alpha-Sweep + Dissens-Analyse auf dem Lernprotokoll-Export (Werkzeug fuer die Re-Validierung)
├── backtest-run.mjs             Node.js Backtest (eigenstaendige Kopie, vor der WM-Migration -- src/lib/backtest.ts ist aktuell)
└── param-sweep.mjs              Grid Search fuer Modell-Parameter (dito)
docs/
├── bl-migration-playbook.md     Plan der WM->BL-Rueckmigration (Phasen 0-6)
├── calibration-analysis.md      WM-Kalibrierungsanalyse (Startwerte fuer alpha, Dissens-Signal)
├── beta-checkliste.md           Erster Lauf mit echten Daten: was zu pruefen ist, in welcher Reihenfolge
└── backups/                     WM-Lernprotokoll-Exporte (Archiv)
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

- Poisson + Dixon-Coles (DC_RHO = -0.13), echter Heim-/Auswärtssplit (kein Neutral-Ground)
- Form-Blending: 60% Saison-Statistik + 40% gewichtete Formkurve (DECAY = 0.72)
- Kaltstart-Prior (Spieltag 1-5): Vorsaison-Statistik geglättet mit Live-Statistik, Gewicht n/(n+6); Aufsteiger nutzen Liga-Durchschnitt minus Malus
- Draw-Boost: DRAW_BOOST_MAX = 0.15, DRAW_BOOST_RANGE = 0.40 — greift **nur ohne Marktquote**; mit Quote ist das Remis dort schon eingepreist, ein Aufschlag würde systematisch über dem Markt landen
- Dissens-Signal: favorisieren Modell und Markt unterschiedliche Seiten, zusätzlicher Remis-Aufschlag (DISSENS_DRAW_BOOST_MAX = 0.08, unkalibrierter WM-Startwert). Setzt eine Marktquote voraus, schließt sich also mit dem strukturellen Boost gegenseitig aus
- Eine Rechenkette: Spieltag-Prognose und Monte-Carlo-Saisonsimulation ziehen beide aus `modelChain.ts` (gleiche Statistik, gleiche Quoten, gleiche Kalibrierung) — kein Parallelmodell
- Platt-Kalibrierung: rollierend aus der laufenden + vorherigen Saison (kein Data-Leakage), nur ohne Marktquote angewendet
- Newton-Raphson findet das markt-implizite Lambda, geblendet mit MARKET_BLEND = 0.4 (60% Modell / 40% Markt, WM-Startwert -- nach den ersten 5 BL-Spieltagen re-validieren)
- Backtest-Genauigkeit (Stand vor der WM-Migration, Saison 2025/26): 54.2% 1X2, 15.8% Remis erkannt, 69.2% TOP-Tipps -- nach den ersten BL-Spieltagen 2026/27 mit dem neuen Modell neu erheben

## Muster-Workflow für Claude Code

1. Lies `tokens.css` für vorhandene Variablen.
2. Lies `MatchCard.tsx` als Referenz-Komponente (Struktur, CSS-Module, Tokens).
3. Neue Komponente nach demselben Schema bauen.
4. TypeScript-Check: `npx tsc --noEmit`
5. Tests: `npm test`
6. Build + Deploy: `npm run build && npm run deploy`
7. Version in `package.json` bumpen (Minor bei Features, Patch bei Fixes).

## Nicht machen

- Kein Tailwind, kein styled-components, kein Emotion.
- Keine UI-Libraries (shadcn, MUI, Ant Design, Chakra).
- Keine Icon-Pakete ausser SF-Symbols-Nachbauten als Inline-SVG.
- Keine Animationen schwerer als `transition: opacity/transform 0.3s`.
- Keine Schatten oder Verläufe (ausser Blur im Sheet-Overlay).
- Keine em-Dashes im UI-Text oder in Commit-Messages.
- Kein separates Deployment pro Feature — Änderungen bündeln.
- Kein Parallelmodell (z.B. Elo-Beimischung) ohne empirischen Nachweis -- WM-Lektion, siehe `docs/calibration-analysis.md`.

## Bekannte Lücken (Stand v2.0.0, WM-Rückmigration)

Diese Punkte brauchen echten Netzwerkzugriff auf OpenLigaDB/The Odds API zur Validierung und konnten in einer netzwerk-eingeschränkten Umgebung nicht empirisch geprüft werden:

- [ ] MARKET_BLEND (0.4) und DISSENS_DRAW_BOOST_MAX (0.08) sind unkalibrierte WM-Startwerte -- nach Spieltag 5 neu validieren: `ProfileScreen` → Lernprotokoll exportieren, dann `node scripts/analyze-learnlog.mjs <export.json>`. Achtung: `LOGGED_ALPHA` im Skript muss mit MARKET_BLEND übereinstimmen, sonst ist die Markt-Lambda-Rekonstruktion falsch.
- [ ] Kalibrierung wird weiterhin live im Browser aus OpenLigaDB-Historie gebaut (`buildCalib` in `modelChain.ts`), nicht als trainierte Konstante gebacken -- funktioniert, ist aber ein Cold-Start-Risiko in den ersten Spieltagen, wenn `fetchPrevSeason()` leer bleibt (dann greift `shrinkToMean`).
- [ ] `scripts/backtest-run.mjs` / `param-sweep.mjs` sind eigenstaendige JS-Kopien des Modells von vor der Migration (kein Markt-Blend, kein Dissens-Signal, kein Kaltstart-Prior) -- `src/lib/backtest.ts` (`window.__backtest()`) ist die aktuelle, massgebliche Referenz, weil sie denselben Code wie die App nutzt.
- [ ] `clubs.ts` FALLBACK_STATS spiegeln den letzten bekannten Stand der Saison 2025/26 -- die echte Saison 2026/27 (inkl. Auf-/Absteiger) kommt live aus OpenLigaDB; nur der Offline-Fallback ist potenziell veraltet.
- [ ] Odds-Freeze bei Anpfiff (`getFrozenOdds` in `learnLog.ts`) ist ungetestet gegen echte In-Play-Quotenbewegungen.
- [ ] Der Aufsteiger-Malus (`PROMOTED_GF_MALUS` 0.85 / `PROMOTED_GA_MALUS` 1.15 in `openligadb.ts`) ist gesetzt, aber nicht an historischen Aufsteiger-Saisons kalibriert.

## Nächste Schritte

- [x] Bundesliga-Tabelle (eigener Tab)
- [x] Saisonprognose per Monte-Carlo-Simulation
- [x] Tab-Bar Navigation (Spieltag / Tabelle / Saison / Modell)
- [x] Lernprotokoll, Wett-Radar, Modell-vs-Markt-Vergleich (WM-Rückmigration)
- [ ] Favoriten-Filter mit LocalStorage
- [ ] PWA Service Worker (Offline-Support, Cache-Strategie)
- [ ] Push-Notifications zu Spielbeginn (siehe BL Ticker für Pattern)
- [ ] Beta ~Mitte August 2026 (Supercup/Pokalrunde als Testlauf), danach Lernprotokoll ab Spieltag 1 scharf; Kalibrier-Analyse nach Spieltag 5 und in der Winterpause
