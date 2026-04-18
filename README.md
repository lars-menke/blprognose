# BL Prognose · iOS Starter

Startpunkt für die Bundesliga-Prognose-PWA im Apple-iOS-Design. Enthält das Designsystem, Referenz-Komponenten, einen beispielhaften Spieltag-Screen und das komplette App-Icon-Set.

## Einrichten

```bash
npm install
npm run dev
```

Vite startet auf `http://localhost:5173`, der Spieltag-Screen rendert mit Beispieldaten. Dark Mode per Betriebssystem oder DevTools (Rendering → `prefers-color-scheme`).

## Build und Deploy

```bash
npm run build
npm run preview        # lokale Vorschau des Production-Builds
npm run deploy         # via gh-pages, sofern GitHub-Remote eingerichtet
```

`vite.config.ts` ist auf relative Asset-Pfade konfiguriert (`base: './'`), damit GitHub Pages im Unterverzeichnis funktioniert (Pattern aus dem BL-Ticker-Projekt).

## Wichtige Dateien

- `CLAUDE.md` — Kontext für Claude Code, wird bei jedem Start gelesen
- `DESIGN.md` — Designsystem-Referenz mit allen Tokens und Patterns
- `src/styles/tokens.css` — zentrale Design-Tokens, Light + Dark
- `src/components/MatchCard.tsx` — Muster-Komponente

## Icon neu rendern

Das Master-Icon liegt in `public/app-icon.svg`. Wenn du es änderst, generierst du alle iOS-Grössen neu mit:

```bash
pip install cairosvg
python3 render_icons.py
```

Die PNGs landen in `public/AppIcon.appiconset/`.

## Arbeitsweise mit Claude Code

Im Projektverzeichnis `claude` starten. Erste Nachricht:

> Lies CLAUDE.md und DESIGN.md, dann zeig mir kurz die Dateistruktur und bestätige, dass du das Designsystem verstanden hast.

Danach inkrementell weiterbauen: neue Screens, neue Komponenten, Datenanbindung. Claude Code orientiert sich an der MatchCard als Referenz-Pattern.
