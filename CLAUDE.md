# BLforecast · Claude Code Context

Leitfaden für die Weiterentwicklung der Bundesliga-Prognose-PWA im Apple-iOS-Design. Diese Datei wird von Claude Code bei jedem Start gelesen.

## Projekt

Bundesliga-Prognose-App mit Poisson-basiertem Statistikmodell und Form-Blending. Oberfläche vollständig im Apple-iOS-Design (iOS 17 Human Interface Guidelines). Ziel ist eine PWA, die sich auf dem iPhone anfühlt wie eine native App.

Kernlogik (Modell, Datenaggregation) existiert bereits aus dem Vorgängerprojekt. Dieses Repository fokussiert auf die neue UI-Schicht.

## Stack

- React 18, TypeScript, Vite 5
- CSS Modules, keine UI-Library, keine Tailwind
- Deployment: GitHub Pages, statisch
- Daten: OpenLigaDB-API oder eigene Datenquelle

## Designsprache

Apple iOS, mit zwei nicht verhandelbaren Prinzipien:

1. **Flach und ruhig.** Keine Verläufe, keine Schlagschatten, keine Neoneffekte. Karten liegen auf Grau, Inhalte sind auf die Karten gesetzt, dazwischen Weissraum.
2. **System zuerst.** SF Pro als Schrift, iOS-Systemfarben für Interaktion, native iOS-Ratio für Radien, Abstände und Hairlines. Alles was nach Material Design oder Web-Framework riecht, ist falsch.

Weitere Details siehe `DESIGN.md`.

## Dateistruktur

```
src/
├── styles/
│   ├── tokens.css           Alle Design-Variablen, Light + Dark
│   └── globals.css          Reset, Body-Styles, Schriftart
├── components/              Wiederverwendbare UI-Bausteine
│   ├── MatchCard.tsx
│   ├── MatchCard.module.css
│   ├── ProbabilityBar.tsx
│   ├── TableRow.tsx
│   ├── SegmentedControl.tsx
│   ├── LargeTitle.tsx
│   ├── TabBar.tsx
│   ├── TeamLogo.tsx
│   └── FormIndicator.tsx
├── screens/                 Vollständige Screen-Assemblies
│   ├── MatchdayScreen.tsx
│   ├── MatchDetailScreen.tsx
│   ├── TableScreen.tsx
│   └── SeasonPredictionScreen.tsx
├── lib/                     Modell, Datenzugriff, Utilities
│   ├── poisson.ts
│   ├── fetchMatches.ts
│   └── clubs.ts             Vereinsfarben und Kurzcodes
└── App.tsx
```

## Komponenten-Regeln

- **CSS Modules.** Jede Komponente bekommt ihr eigenes `Name.module.css`. Keine globalen Klassen ausser den Resets in `globals.css`.
- **Tokens statt Hardcode.** Jede Farbe, jeder Radius, jeder Abstand kommt aus `tokens.css`. Wenn ein Wert fehlt, in `tokens.css` ergänzen, nicht lokal hardcoden.
- **Dark Mode automatisch.** Durch `prefers-color-scheme` und Tokens wechseln alle Komponenten von selbst. Niemals `if (darkMode)` in Komponenten.
- **Tabular Numbers.** Jede Zahl die im UI erscheint bekommt `font-variant-numeric: tabular-nums`, damit Prognose-Scores und Prozente ruhig bleiben.
- **Props sind klein.** Jede Komponente nimmt nur was sie braucht. Kein Dependency-Injection-Theater.

## Muster-Workflow für Claude Code

Wenn ich eine neue Funktion oder einen neuen Screen baue, läuft das so:

1. Lies `DESIGN.md` für das Pattern, das gebraucht wird.
2. Schau in `tokens.css`, welche Variablen existieren.
3. Schau in `components/MatchCard.tsx` als Referenz, wie eine Komponente aussieht (Struktur, CSS-Module-Verknüpfung, Tokens-Nutzung).
4. Baue die neue Komponente nach demselben Schema.
5. Prüfe Light und Dark Mode im Browser (DevTools, Rendering-Tab, `prefers-color-scheme`).
6. Keine Inline-Styles ausser für dynamische Werte (z. B. Prozent-Breiten einer Wahrscheinlichkeits-Leiste).

## Nicht machen

- Kein Tailwind, kein styled-components, kein Emotion.
- Keine UI-Libraries (shadcn, MUI, Ant Design, Chakra).
- Keine Icon-Pakete ausser SF-Symbols-Nachbauten als Inline-SVG.
- Keine Animationen schwerer als ein `transition: opacity 0.2s`.
- Keine Schatten, Verläufe, Blur-Effekte ausserhalb der Tab-Bar-Backdrop.
- Keine Schriftart ausser dem System-Stack.
- Keine em-Dashes im UI-Text oder in Commit-Messages.

## Icon

Das App-Icon liegt in `public/app-icon.svg` als Master (1024 viewBox, skalierbar). Für iOS-Home-Screen-Shortcuts:

```html
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
```

PNGs in allen iOS-Grössen werden via `render_icons.py` aus der SVG generiert (siehe Icon-Pack).

## Nächste Schritte

- [ ] `MatchdayScreen` mit echten Daten verdrahten
- [ ] `MatchDetailScreen` mit xG-Berechnung
- [ ] Tabelle aus Saison-Daten ableiten
- [ ] Saisonprognose per Monte-Carlo-Simulation (10 000 Saisons)
- [ ] Favoriten-Filter mit LocalStorage
- [ ] PWA-Manifest und Service Worker
- [ ] Push-Notifications zu Spielbeginn (siehe BL Ticker für Pattern)
