# CLAUDE.md — BL Prognose

AI assistant reference for the **BL Prognose** repository.

---

## Project Overview

**BL Prognose** is a single-file, client-side web application that generates match score predictions for the German Bundesliga (season 2025/26) using a Poisson probability model. It is designed for use with the Kicktipp platform.

**Key facts:**
- Entirely self-contained in one file: `index.html` (~1,020 lines, ~64 KB)
- Zero external dependencies (no npm, no build tools, no frameworks)
- No server, no database, no API — all data is hardcoded
- Vanilla HTML5 / CSS3 / ES6+ JavaScript only
- Google Fonts loaded via CDN (Bebas Neue, DM Mono, DM Sans)

---

## File Structure

```
blprognose/
├── index.html   ← entire application (HTML + CSS + JS in one file)
└── CLAUDE.md    ← this file
```

There is no `package.json`, no build config, no test runner, and no CI/CD pipeline.

---

## Architecture

The single `index.html` is divided into three logical sections:

| Section | Approx. Lines | Purpose |
|---------|--------------|---------|
| `<style>` block | 1–380 | Complete CSS (variables, layout, components) |
| `<body>` HTML | 381–450 | DOM structure (splash, header, tabs, modals) |
| `<script>` block | 451–1020 | All application logic |

### JavaScript Structure (inside `<script>`)

```
Constants & Configuration   (lines ~451–460)
Team Stats (ST)             (lines ~396–415)  ← updated each gameday
Match Data (MATCHES)        (lines ~427–448)  ← updated each gameday
Core Calculation Engine     (lines ~461–690)
Render Functions            (lines ~691–850)
UI / Event Handlers         (lines ~851–1005)
initApp() entry point       (lines ~1006–1014)
```

---

## Data Model

### Team Statistics (`ST` constant)

Updated after each Spieltag. One entry per club:

```javascript
const ST = {
  BMU: { rank:1, hGF:2.72, hGA:0.72, aGF:2.00, aGA:1.00 },
  // ...18 teams total
};
```

| Field | Meaning |
|-------|---------|
| `rank` | Current league table position |
| `hGF` | Home goals scored per game (season avg) |
| `hGA` | Home goals conceded per game (season avg) |
| `aGF` | Away goals scored per game (season avg) |
| `aGA` | Away goals conceded per game (season avg) |

**Team codes:** `BMU`, `BVB`, `TSG`, `VFB`, `RBL`, `B04`, `SCF`, `SGE`, `FCU`, `FCA`, `HSV`, `KOE`, `M05`, `BMG`, `WOB`, `STP`, `SVW`, `FCH`

### Match Data (`MATCHES` constant)

One object per fixture for the current Spieltag:

```javascript
const MATCHES = [
  {
    id:      'fca-koe',        // unique slug
    home:    'FCA',            // team code
    away:    'KOE',            // team code
    kickoff: 'Fr 27.02 · 20:30',
    p:  { h:42.7, d:27.5, a:29.8 },  // API market probabilities (%)
    hForm: { gf:1.60, ga:1.40 },      // avg goals last 5 home games
    aForm: { gf:1.00, ga:1.80 },      // avg goals last 5 away games
  },
  // ...up to 9 matches
];
```

### Configuration Constants

```javascript
const DRAW_THRESHOLD       = 0.30;   // Standard draw block threshold
const DRAW_THRESHOLD_TIGHT = 0.27;   // Tighter threshold for close matches
const MONO_MAX             = 2;      // Max times same score can appear per gameday
const FAV_MIN_GOALS_LAMBDA = 2.0;    // λ above which favorite must score ≥2
const FORM_WEIGHT          = 0.40;   // Weight of recent 5-game form (vs season avg)
const lgAvgH = 1.65;                 // League avg home goals
const lgAvgA = 1.45;                 // League avg away goals
const lgDefH = 1.30;                 // League avg home conceded
const lgDefA = 1.55;                 // League avg away conceded
```

---

## Prediction Engine

### Step 1 — Lambda Calculation (Expected Goals)

Combines season statistics and recent form via the `FORM_WEIGHT` blend:

```
blendedHomeAttack = (hGF * (1 - FORM_WEIGHT)) + (hForm.gf * FORM_WEIGHT)
blendedHomeDef   = (hGA * (1 - FORM_WEIGHT)) + (hForm.ga * FORM_WEIGHT)

λ_home = blendedHomeAttack * (awayGA / lgDefA)
λ_away = blendedAwayAttack * (homeGA / lgDefH)
```

### Step 2 — API Market Correction (Rule 5)

Adjusts raw λ values so the Poisson model's win/draw/away probabilities converge toward external betting market probabilities (stored in `p` on each match).

### Step 3 — Attack Mode

When `strategy === 'attack'`, both lambdas are multiplied by 1.07 (+7%).

### Step 4 — Poisson Score Matrix

Calculates P(home=i, away=j) for all i,j in 0..7 using:

```
P(k, λ) = e^(-λ) * λ^k / k!
```

### Step 5 — Rules Engine

Five rules are applied in order to the raw natural tipp:

| Rule | Name | Condition | Effect |
|------|------|-----------|--------|
| 1 | Draw Hardness | P(draw) < threshold | Block draw; pick higher-prob team |
| 2 | Minimum Goal | P(team scores ≥1) ≥ 50% | Team cannot have 0 goals in tipp |
| 3 | Favorite Minimum | Favorite λ ≥ 2.0 | Favorite must score ≥ 2 goals |
| 4 | Monoculture Protection | Same score used > `MONO_MAX` times | Pick next-best distinct score |
| 5 | API Market Correction | Always | λ blended toward market odds |

### Prediction Result Object

`calcSingle(match)` returns:

```javascript
{
  pH, pD, pA,           // Final win/draw/away probabilities
  naturalTipp,          // Raw best score from Poisson matrix
  tipp,                 // Final score after rules
  wo,                   // Outcome: 'H' | 'D' | 'A'
  cat,                  // Category label (e.g. "🔴 50/50")
  cc,                   // CSS class for category
  srt,                  // All scores sorted by probability
  lH, lA,               // Final λ home / away
  ins,                  // Array of insight messages shown in detail panel
  fp,                   // Favorite probability
  drawBlocked,          // Was draw rule applied?
  goalRuleApplied,      // Was minimum goal rule applied?
  adjusted,             // Was monoculture protection applied?
}
```

---

## UI Structure

### Tabs

| Tab | ID | Contents |
|-----|----|----------|
| Spieltag | `#page-spiel` | Match cards for current gameday |
| Tipp-Übersicht | `#page-summ` | Summary grid of all predictions |
| Manuell | `#page-man` | Manual free-form match calculator |

### Key DOM Elements

| Element | Purpose |
|---------|---------|
| `#splash` | Animated intro screen (2.4s) |
| `#spieltagSelector` | Modal to choose Spieltag 1–34 |
| `#overlay` | Semi-transparent backdrop for detail panel |
| `#detailPanel` | Slide-in panel with full match analysis |
| `#strategyToggle` | Safe / Attack mode button |
| `#copyBtn` | Copy predictions to clipboard |

### Render Functions

| Function | Purpose |
|----------|---------|
| `recalcAll()` | Runs calcSingle() for all matches, stores in `results`, triggers renders |
| `renderGames()` | Builds all match cards in `#page-spiel` |
| `renderSummary()` | Builds summary grid in `#page-summ` |
| `openDetail(id)` | Populates and opens the detail panel |
| `renderManual()` | Renders the manual calculation tab |

---

## CSS Design System

All tokens are CSS custom properties on `:root`:

```css
--bg:     #08080e;  /* page background */
--s1:     #10101a;  /* surface level 1 */
--s2:     #17172a;  /* surface level 2 */
--s3:     #1f1f38;  /* surface level 3 */
--border: #252540;  /* borders */
--acc:    #e4ff3c;  /* primary accent (neon yellow) */
--acc2:   #3cffe0;  /* secondary accent (cyan) */
--red:    #ff4d6a;  /* error / away win */
--orange: #ffb03c;  /* warning / draw */
--green:  #3cff8f;  /* success / home win */
--purple: #c084fc;  /* adjusted prediction */
--text:   #dde0f5;  /* body text */
--white:  #f0f4ff;  /* headings */
```

Typography:
- **Bebas Neue** — display headings
- **DM Mono** — statistics, scores, codes
- **DM Sans** — body text, labels

---

## Development Workflow

### How to Run

Open `index.html` directly in any modern browser. No server needed.

```bash
# Option 1: direct file open
open index.html

# Option 2: simple local server (if needed for CORS)
python3 -m http.server 8000
```

### How to Update for a New Spieltag

1. **Update `ST`** — refresh team statistics after latest results
2. **Update `MATCHES`** — replace with fixtures for the new gameday
   - Set correct `kickoff` strings
   - Set `p` (API market probabilities from betting odds)
   - Set `hForm` / `aForm` (last 5 game averages for each side)
3. **Update the UI label** for the current Spieltag number

### No Tests / No Build

- There is no test suite. Validate changes manually in the browser.
- There is no build step. Edit `index.html` and refresh.
- There is no linter config. Follow the existing code style (2-space indent, single quotes in JS, German variable names where contextual).

---

## Key Conventions

- **Language:** UI strings and comments are in **German**. Code identifiers are a mix of German abbreviations and English.
- **Abbreviations:** `lH`/`lA` = lambda home/away; `hGF`/`hGA` = home goals for/against; `aGF`/`aGA` = away; `ST` = Statistiken; `NM` = Namen.
- **No side effects at module level** — all computation is triggered from `initApp()` or user events.
- **Global state** is minimal: `strategy`, `mFH` (manual form history), `results` cache.
- **Monoculture protection** (`MONO_MAX = 2`) must remain intact — it's essential for Kicktipp diversity.
- Do **not** introduce external libraries or build tools unless the project scope changes fundamentally.
- Keep all code in the single `index.html` file unless the project explicitly migrates to a multi-file structure.

---

## Git Info

- **Remote:** `http://local_proxy@127.0.0.1:56749/git/lars-menke/blprognose`
- **Primary branch:** `master`
- **Commit signing:** SSH key signing is enabled by default
- **Only committed file:** `index.html` (initial upload by `lars-menke`)
