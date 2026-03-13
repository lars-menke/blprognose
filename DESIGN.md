# BL Tick-R — Design System: Lambdark Neo

> Dieses Dokument ist die verbindliche Design-Referenz für die BL Tick-R PWA.  
> Alle UI-Entscheidungen (Farben, Abstände, Typografie, Komponenten) werden hier festgelegt.

---

## 1. Philosophie

**Lambdark Neo** ist eine Weiterentwicklung des Lambdark Design Systems: dunkel, dicht, terminal-nah. Die Ästhetik vereint Sportticker-Funktionalität mit futuristischer Display-Qualität.

Kern-Prinzipien:
- **Data-first**: Informationen sofort lesbar, null Ablenkung
- **Atmosphärisch**: Grid-Background, CRT-Scanlines, Glow-Effekte erzeugen Tiefe
- **Konsistent**: Einheitliches Token-System für alle Farben, Radien, Abstände
- **Mobile-first**: Optimiert für 390–430 px Breite (max-width: 420 px)

---

## 2. Color Tokens

Alle Farben als CSS Custom Properties. Niemals Hex-Werte direkt verwenden — immer Tokens.

```css
:root {
  /* Backgrounds */
  --bg:        #09090c;   /* App-Hintergrund */
  --bg2:       #0f0f14;   /* Sekundärer Hintergrund */
  --surface:   #13131a;   /* Karten, Panel */
  --surface2:  #1a1a24;   /* Hover-Zustand, erhöhte Ebene */

  /* Borders */
  --border:    #1e1e2e;   /* Standard-Border */
  --border2:   #2a2a3e;   /* Verstärkte Border */

  /* Brand / Akzente */
  --yellow:    #e8f032;   /* Primärer Akzent — Logos, Punkte, aktive Elemente */
  --cyan:      #32d4f0;   /* Sekundärer Akzent — Tabelle, Rang, Links */
  --magenta:   #f032c0;   /* Tertiärer Akzent — Gradienten, Live-Leiste */

  /* Text */
  --text:      #d0d4e0;   /* Primärer Text */
  --muted:     #454860;   /* Sekundärer Text, Labels, Beschriftungen */

  /* Status */
  --live:      #f03260;   /* Live-Indikator, rote Karte */
  --win:       #32f0a0;   /* Sieg (Form-Dots) */
  --draw:      #454860;   /* Unentschieden (Form-Dots, = --muted) */
  --loss:      #f03260;   /* Niederlage (Form-Dots, = --live) */
}
```

### Semantische Verwendung

| Token | Verwendung |
|---|---|
| `--yellow` | Logo-Glow, aktive Nav-Items, Punkte-Spalte, Live-Score |
| `--cyan` | Tabellenrang Top-3, Section-Counts, Links |
| `--magenta` | Live-Leiste Gradient (`--live` → `--magenta`), dekorative Akzente |
| `--live` | Live-Pulse-Dot, rote Karten, Verlust-Form-Dots |
| `--muted` | Zeit-Labels, Stadion-Name, sekundäre Stats, inaktive Nav-Items |

---

## 3. Typografie

### Font Stack

```css
/* Display / Überschriften / Scores */
font-family: 'Bebas Neue', sans-serif;

/* Code / Monospace / Zeitangaben / Labels / Stats */
font-family: 'DM Mono', monospace;

/* Fließtext / Teamnames / Nav-Labels */
font-family: 'DM Sans', sans-serif;
```

### Google Fonts Import

```html
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
```

### Typografie-Hierarchie

| Rolle | Font | Size | Weight | Letter-spacing |
|---|---|---|---|---|
| Logo | Bebas Neue | 32px | — | 0.12em |
| Score groß | Bebas Neue | 44px | — | 0.06em |
| Team-Kürzel | Bebas Neue | 26px | — | 0.06em |
| Tabellen-Abbr | Bebas Neue | 16px | — | 0.06em |
| Punkte | Bebas Neue | 20px | — | 0.06em |
| Section-Labels | DM Mono | 9px | 400 | 0.25em |
| Minuten-Badge | DM Mono | 9px | 400 | 0.08em |
| Zeit-Badges | DM Mono | 9px | 400 | 0.12em |
| Stats / Form | DM Mono | 11–12px | 400 | — |
| Team Vollname | DM Sans | 9px | 300 | 0.04em |
| Stadt / Sub | DM Sans | 9px | 300 | — |
| Nav-Labels | DM Mono | 8px | 400 | 0.15em |

**Regel**: Alle Labels und Timestamps → DM Mono. Alle Display-Zahlen und Kürzel → Bebas Neue. Fließtext und Beschreibungen → DM Sans.

---

## 4. Atmosphärische Hintergrund-Effekte

Diese Effekte werden einmalig auf `body` gesetzt und gelten global.

```css
/* CRT-Scanlines — subtiles Retro-Feeling */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.06) 2px,
    rgba(0, 0, 0, 0.06) 4px
  );
  pointer-events: none;
  z-index: 999;
}

/* Subtiles Raster-Grid */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(50, 212, 240, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(50, 212, 240, 0.025) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  z-index: 0;
}
```

Alle App-Inhalte brauchen `position: relative; z-index: 1;` um über den Overlays zu liegen.

---

## 5. Layout & Spacing

```css
.app {
  max-width: 420px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
  min-height: 100vh;
}
```

### Spacing-Skala

Keine flexiblen Werte — nur diese definierten Stufen verwenden:

| Token | Wert | Verwendung |
|---|---|---|
| `--space-xs` | 4px | Gap zwischen kleinen Chips |
| `--space-sm` | 8px | Gap in Grids, kompakte Padding |
| `--space-md` | 12px | Karten-Padding seitlich, Section-Padding |
| `--space-lg` | 16px | Karten-Padding, Nav-Padding |
| `--space-xl` | 18px | Header-Padding |
| `--space-2xl` | 24px | Großer vertikaler Abstand |

---

## 6. Komponenten

### 6.1 App Header (sticky)

```
┌─────────────────────────────────────┐
│ BL·TICK·R  │ Bundesliga · 2024/25   │  🔔
│            │ Spieltag_26            │ LIVE●
├─────────────────────────────────────┤
│  Live    Spielplan   Tabelle  Stats │
└─────────────────────────────────────┘
```

- **Hintergrund**: `rgba(9,9,12,0.97)` + `backdrop-filter: blur(20px)`
- **Border-bottom**: `1px solid var(--border2)`
- **Logo**: Bebas Neue, 32px, `var(--yellow)`, `text-shadow: 0 0 30px rgba(232,240,50,0.5), 0 0 60px rgba(232,240,50,0.15)`
- **Divider-Linie** zwischen Logo und Meta: `1px`, `28px` hoch, `var(--border2)`
- **Season/Matchday**: DM Mono 9px `var(--muted)` / 11px `var(--cyan)`
- **Live-Indicator**: DM Mono 10px `var(--live)` + pulsierender Dot (Animation siehe unten)
- **Notification-Button**: 30×30px, `var(--surface)`, Border `var(--border2)`, Hover → Border `var(--cyan)`; gelber Dot oben rechts als Badge

**Live-Pulse Animation:**
```css
@keyframes livePulse {
  0%   { box-shadow: 0 0 0 0px rgba(240, 50, 96, 0.6); }
  70%  { box-shadow: 0 0 0 8px rgba(240, 50, 96, 0); }
  100% { box-shadow: 0 0 0 0px rgba(240, 50, 96, 0); }
}
```

**Tab-Leiste:**
- Hintergrund: transparent (erbt vom Header)
- Inaktiv: `var(--muted)`, DM Mono 9px, Letter-spacing 0.18em
- Aktiv: `var(--yellow)`, `text-shadow: 0 0 12px rgba(232,240,50,0.4)`, `border-bottom: 2px solid var(--yellow)`

---

### 6.2 Section Header

```
── LIVE JETZT ──────────────────── 2 Spiele
```

```css
.section-head {
  padding: 16px 18px 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
```

- **Label**: DM Mono 9px, Letter-spacing 0.25em, `var(--muted)`, uppercase
- **Linie**: `flex: 1`, `height: 1px`, `var(--border)`
- **Count/Sub-Info**: DM Mono 9px, `var(--cyan)`

---

### 6.3 Match Card

```
┌──────────────────────────────────────┐  ← Border 1px var(--border)
│ 1. BL · 15:30   [67']   Allianz Arena│  ← match-top
│                                      │
│  FCB          3:1          BVB       │  ← score-grid
│  Bayern München              Dortmund│
│                                      │
│ ⚽Kane 12'  ⚽Kane 34'  ⚽Müller 55' │  ← goal-strip
│ ⚽Guirassy 41'  ■Can 63'             │
└──────────────────────────────────────┘
```

**Base-Styles:**
```css
background: var(--surface);
border: 1px solid var(--border);
padding: 14px 16px;
position: relative;
overflow: hidden;
```

**Corner-Cut** (dekorativ, oben rechts):
```css
.match-card::after {
  content: '';
  position: absolute;
  top: 0; right: 0;
  border: 10px solid transparent;
  border-top-color: var(--border);
  border-right-color: var(--border);
}
```

**Live-Zustand** (`.is-live`):
```css
border-color: rgba(240, 50, 96, 0.3);
```

Linke Akzentleiste:
```css
.match-card.is-live::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, var(--live), var(--magenta));
  box-shadow: 0 0 12px rgba(240, 50, 96, 0.5);
}
```

Live Radial-Glow (überschreibt `::after` Corner-Cut — daher separates Pseudo-Element nicht möglich; alternativ als `::before` auf einem Inner-Wrapper):
```css
background: radial-gradient(ellipse at 50% 0%, rgba(240,50,96,0.06) 0%, transparent 70%);
```

**Hover:**
```css
border-color: rgba(232, 240, 50, 0.2);
transform: translateY(-1px);
```

**Einblend-Animation:**
```css
@keyframes cardIn {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
animation: cardIn 0.4s cubic-bezier(0.2, 0, 0, 1) both;
/* Delay pro Karte: nth-child(1) = 0.04s, (2) = 0.10s, (3) = 0.16s */
```

**Score Grid:**
```css
display: grid;
grid-template-columns: 1fr 80px 1fr;
align-items: center;
gap: 8px;
```

- Score: Bebas Neue 44px, live → `var(--yellow)` + `text-shadow: 0 0 25px rgba(232,240,50,0.5)`
- Team-Kürzel: Bebas Neue 26px, `#e0e4f0`
- Team-Vollname: DM Sans 9px 300, `var(--muted)`
- `.team-block.right` → `text-align: right`

---

### 6.4 Event / Goal Tags (goal-strip)

Tags unterhalb der Karte, horizontale Reihe mit Wrap.

```css
.goal-tag {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  padding: 3px 8px;
  border: 1px solid var(--border2);
  background: var(--surface2);
  display: flex;
  align-items: center;
  gap: 4px;
}
```

**Varianten:**

| Klasse | Border-Color | Text-Color |
|---|---|---|
| `.home` | `rgba(232,240,50,0.25)` | `var(--yellow)` |
| `.away` | `rgba(50,212,240,0.25)` | `var(--cyan)` |
| `.card-y` (gelb) | `rgba(240,200,50,0.25)` | `#f0c832` |
| `.card-r` (rot) | `rgba(240,50,96,0.25)` | `var(--live)` |
| `.sub` (Einwechslung) | `rgba(50,240,160,0.15)` | `#32f0a0` |

---

### 6.5 Minuten-Badge

```css
.match-minute-badge {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  background: rgba(240, 50, 96, 0.15);
  border: 1px solid rgba(240, 50, 96, 0.3);
  color: var(--live);
  padding: 2px 7px;
  letter-spacing: 0.08em;
}
```

---

### 6.6 Tabellen-Zeile

**Grid:**
```css
grid-template-columns: 22px 1fr 28px 36px 40px;
/* Spalten: #  |  Verein  |  Form  |  TD  |  Pkt */
```

**Rang-Farben:**
- Platz 1–3: `var(--cyan)`, Platz 1 zusätzlich `text-shadow: 0 0 8px rgba(50,212,240,0.5)`
- Platz 4–6 (Europa): `var(--muted)` mit leichtem Highlight (optional eigene Klasse)
- Abstiegszone: `var(--live)`

**Form-Dots:**
```css
.fd { width: 5px; height: 5px; border-radius: 1px; }
.fd.w { background: rgba(50, 240, 160, 0.8); }  /* Sieg */
.fd.d { background: var(--muted); }              /* Unentschieden */
.fd.l { background: rgba(240, 50, 96, 0.8); }   /* Niederlage */
```

**Punkte-Spalte:**
- Bebas Neue 20px, `var(--yellow)`, `text-shadow: 0 0 12px rgba(232,240,50,0.25)`

**Feature-Row** (hervorgehobene Zeile, z.B. eigenes Team):
```css
background: rgba(50, 212, 240, 0.04);
```

---

### 6.7 Bottom Navigation

```
┌─────────────────────────────────────┐
│  ▲              ← aktive Linie      │
│  ⚡     📅      📊      🔔         │
│ Live   Plan  Tabelle  Alerts        │
└─────────────────────────────────────┘
```

```css
position: fixed;
bottom: 0;
width: 100%;
max-width: 420px;
background: rgba(9, 9, 12, 0.98);
border-top: 1px solid var(--border2);
backdrop-filter: blur(20px);
z-index: 200;
```

**Nav-Item:**
- Inaktiv: `var(--muted)`, DM Mono 8px, Letter-spacing 0.15em
- Aktiv: `var(--yellow)` + `border-top: 2px solid var(--yellow)` + `box-shadow: 0 0 10px rgba(232,240,50,0.6)` auf der Linie
- Icon: 16px

---

## 7. Globale Interaktions-Patterns

### Hover
Alle klickbaren Elemente (Karten, Tabellen-Zeilen, Buttons):
```css
transition: background 0.15s, border-color 0.2s, transform 0.15s;
```

Karten: `transform: translateY(-1px)` + Border-Glow bei Hover.

### Fokus / Accessibility
```css
:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
```

### Scroll-Container
```css
html { scroll-behavior: smooth; }
body { overflow-x: hidden; }
```

---

## 8. Wiederkehrende Muster

### Glow-Texte
```css
/* Logo-Glow */
text-shadow: 0 0 30px rgba(232,240,50,0.5), 0 0 60px rgba(232,240,50,0.15);

/* Subtiler Cyan-Glow (Tabellenrang) */
text-shadow: 0 0 8px rgba(50,212,240,0.5);

/* Score Live-Glow */
text-shadow: 0 0 25px rgba(232,240,50,0.5);
```

### Transluzente Surfaces
Sticky Header, Bottom-Nav → immer `backdrop-filter: blur(...)` kombiniert mit semitransparentem `background`.

### Live-Akzentleiste
Alle Live-Inhalte bekommen eine `2px` linke Leiste mit `linear-gradient(to bottom, var(--live), var(--magenta))`.

---

## 9. Animationen

| Name | Verwendung | Dauer | Easing |
|---|---|---|---|
| `cardIn` | Match-Karten einblenden | 0.4s | `cubic-bezier(0.2,0,0,1)` |
| `livePulse` | Live-Dot Kreisanimation | 1.5s | `ease-in-out` |
| `blink` | Alternatives Live-Blinken | 1.2s | `ease-in-out` |

**Staggered Entry** — Karten erscheinen nacheinander:
```css
.match-card:nth-child(1) { animation-delay: 0.04s; }
.match-card:nth-child(2) { animation-delay: 0.10s; }
.match-card:nth-child(3) { animation-delay: 0.16s; }
/* +0.06s pro weiterer Karte */
```

---

## 10. Was niemals getan werden darf

- Keine weißen oder hellen Hintergründe (kein Light Mode)
- Keine Schriften außerhalb des definierten Stacks (kein Inter, Roboto, Arial)
- Keine Hex-Werte direkt im Code — immer CSS-Token
- Keine abgerundeten Ecken (`border-radius`) außer auf Dots/Pills (Kreise: 50%, Form-Dots: 1px)
- Kein `box-shadow` mit Farbe außerhalb der definierten Glow-Palette
- Kein Overflow-X auf dem App-Container
- Keine zusätzlichen Farben außerhalb der Token — bei Bedarf neue Token definieren

---

## 11. Vollständiges CSS-Grundgerüst

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #09090c; --bg2: #0f0f14;
  --surface: #13131a; --surface2: #1a1a24;
  --border: #1e1e2e; --border2: #2a2a3e;
  --yellow: #e8f032; --cyan: #32d4f0; --magenta: #f032c0;
  --text: #d0d4e0; --muted: #454860;
  --live: #f03260; --win: #32f0a0;
}

html { scroll-behavior: smooth; }

body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
}

/* CRT Scanlines */
body::before {
  content: '';
  position: fixed; inset: 0;
  background: repeating-linear-gradient(
    to bottom, transparent, transparent 2px,
    rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px
  );
  pointer-events: none; z-index: 999;
}

/* Grid */
body::after {
  content: '';
  position: fixed; inset: 0;
  background-image:
    linear-gradient(rgba(50,212,240,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(50,212,240,0.025) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none; z-index: 0;
}

.app {
  max-width: 420px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
```
