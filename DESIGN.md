# Designsystem · BLforecast

Designsprache: Apple iOS. Diese Datei beschreibt die Patterns, die in allen Screens gelten. Jede neue Komponente orientiert sich an diesen Regeln, neue Farben und Abstände kommen ausschliesslich aus `src/styles/tokens.css`.

## Prinzipien

1. **Flach, ruhig, systemnah.** Keine Verläufe, keine Schlagschatten, keine Glas- oder Blur-Effekte ausser der Tab-Bar-Backdrop.
2. **Inhalt vor Deko.** Ein Match, eine Zahl, ein Team. Die Karten sind Container, keine Bühnen.
3. **Konsistente Rhythmik.** Alles läuft auf dem 4er-Raster. Typografie nutzt zwei Gewichte: 400 und 700 (500 nur für Sekundär-Emphase).
4. **Zahlen bleiben stehen.** `tabular-nums` überall, wo Ziffern auftreten.

## Farbsystem

Siehe `tokens.css` für alle Werte. Die wichtigen Rollen:

| Rolle               | Variable            | Verwendung                             |
|---------------------|---------------------|----------------------------------------|
| Seitenhintergrund   | `--bg-page`         | `<body>`, Screens                      |
| Kartenhintergrund   | `--bg-card`         | MatchCard, TableRow-Container          |
| Füllung Control     | `--bg-fill`         | Segmented Control, Pill-Buttons        |
| Track               | `--bg-track`        | Progress-Bars, Slider-Rails            |
| Primärtext          | `--text-primary`    | Titel, Teamnamen, Scores               |
| Sekundärtext        | `--text-secondary`  | Labels, Meta-Infos                     |
| Tertiärtext         | `--text-tertiary`   | Score-Trennzeichen, Disabled           |
| Blau                | `--system-blue`     | Aktionen, aktive Nav-Tabs, Links       |
| Grün                | `--system-green`    | Heimsieg-Wahrscheinlichkeit, Form S    |
| Orange              | `--system-orange`   | Auswärtssieg, Relegations-Playoff      |
| Rot                 | `--system-red`      | Niederlage-Form N, Abstiegsplatz       |
| Gelb                | `--system-yellow`   | Top-Tipp-Badge, Highlights             |
| Grau neutral        | `--system-neutral`  | Unentschieden, Form U                  |

Dark Mode wechselt automatisch via `prefers-color-scheme`. Für manuelles Umschalten `<html data-theme="dark">` setzen.

## Typografie

Systemfont `-apple-system` über den Stack in `--font-sans`. Zwei bis drei Gewichte:

| Rolle         | Grösse | Gewicht | Letter-Spacing |
|---------------|--------|---------|----------------|
| Large Title   | 30 px  | 700     | -0.7 px        |
| Title 1       | 24 px  | 700     | -0.4 px        |
| Title 2       | 20 px  | 700     | -0.2 px        |
| Headline      | 17 px  | 700     | 0              |
| Body          | 15 px  | 400     | 0              |
| Callout       | 14 px  | 500     | 0              |
| Subhead       | 13 px  | 400     | 0              |
| Footnote      | 12 px  | 400     | 0              |
| Caption 1     | 11 px  | 400     | 0              |
| Caption 2     | 10 px  | 500     | 0.3 px (Uppercase-Labels) |

## Radien

| Element                | Radius                       |
|------------------------|------------------------------|
| Karte                  | `--radius-card` (12 px)      |
| Control (Segmented)    | `--radius-control` (9 px)    |
| Segmented-Thumb        | 7 px                         |
| Button                 | `--radius-button` (8 px)     |
| Logo-Kachel            | `--radius-logo` (4 px)       |
| Pill-Indikatoren       | `--radius-pill` (999 px)     |

## Abstände

4er-Raster via `--space-1` bis `--space-8`. Innerhalb von Karten typischerweise `--space-3` (12 px) Padding. Zwischen Karten `--space-2` (8 px) Abstand. Screen-Seitenrand `--space-4` (16 px) bis `--space-5` (20 px).

## Trennlinien

0.33 px Hairline in `--separator`. Im Dark Mode wird sie automatisch sichtbarer über `rgba(84,84,88,0.65)`. Niemals volle 1 px Linien verwenden, die wirken sofort unscharf.

## Komponenten-Patterns

### MatchCard

Karte mit Meta-Zeile (Datum, Ort, optional TOP-TIPP-Badge), Body (zwei Teamzeilen links, Prognose-Score rechts), Wahrscheinlichkeits-Leiste unten. Bei Tap Überleitung zum Detail-Screen.

Breakpoints: füllt die verfügbare Breite in der Liste, keine feste Breite.

### ProbabilityBar

Dreigeteilte horizontale Leiste, 4 px hoch, Grün-Grau-Orange. Darunter die Prozente in Caption 2, tabular-nums, gleichmässig über die Breite verteilt (`justify-content: space-between`).

### TableRow

Zeile mit 3 px breitem Farbbalken links (European-Spot-Indikator), Position, Logo, Teamname, Punkte. Trennlinie zwischen den Zeilen ist eine Hairline, eingerückt um die Breite des Balkens + Position + Logo (≈46 px), damit die Linie nicht unter dem Balken durchläuft (iOS-Mail-Stil).

### SegmentedControl

`--bg-fill` als Hintergrund, 2 px Padding, darin die Segmente als Buttons. Aktives Segment hat `--bg-card` als Hintergrund, keine Schatten. Font-size Footnote, Weight 500 für aktiv, 400 für inaktiv. Inaktive Segmente haben zusätzlich `opacity: 0.6`.

### LargeTitle

`<header>` mit `<h1>` in Large-Title-Grösse und optional `<p>` in Footnote-Grau. Padding links/rechts Screen-Standard, oben Screen-Abstand, unten klein.

### TabBar

Sticky bottom, 68 px hoch, `--bg-tabbar` Backdrop mit `backdrop-filter: blur(20px)`. Oben Hairline-Separator. 4 Tabs gleichmässig verteilt, je Icon 24 px + Label 10 px Caption.

### FormIndicator

Kreis 18 px, darin ein Buchstabe S/U/N. Farbe Grün/Grau/Rot. In Reihe für die letzten fünf Spiele.

### ConfidenceMeter

Fünf kleine Pillen 18×5 px mit 3 px Gap. Gefüllt in `--system-blue`, leer in `--text-tertiary`.

## Icon

Master-SVG liegt in `public/app-icon.svg`. Palette: `--icon-bg #0A1628`, `--icon-accent #F4C430`, `--icon-white #FFFFFF`. Die iOS-Grössen werden aus der SVG via `render_icons.py` als PNGs erzeugt und in `public/` beziehungsweise in `AppIcon.appiconset` abgelegt.

## Screens

| Screen                    | Zweck                                              |
|---------------------------|----------------------------------------------------|
| `MatchdayScreen`          | Spieltag-Übersicht mit Match-Karten                |
| `MatchDetailScreen`       | Detail zu einem Spiel: Score, 1X2, xG, Form        |
| `TableScreen`             | Aktuelle Bundesliga-Tabelle mit Europa-Markern     |
| `SeasonPredictionScreen`  | Simulierte Endtabelle mit Delta-Pfeilen            |
| `ProfileScreen`           | Modell-Settings, Datenquelle, Info                 |

## Tests

Visuelle Prüfungen manuell im Browser:

1. Light und Dark Mode über DevTools → Rendering → `prefers-color-scheme`.
2. iPhone-Breiten im DevTools-Gerätemodus (375, 390, 430 px).
3. Safari auf dem iPhone, über Home-Screen-Shortcut installieren und Safe-Area-Verhalten prüfen.

## Don'ts

- Keine Tailwind-Klassen.
- Keine Icon-Fonts (`lucide-react`, `react-icons`).
- Keine `position: fixed` ausserhalb von Tab-Bar und Safe-Area-Logik.
- Keine em-Dashes (–) im UI-Text.
- Keine Schriftart-Overrides, nie `Inter`, `Roboto`, `Poppins`.
- Keine farbigen Schatten. Schatten insgesamt vermeiden.
