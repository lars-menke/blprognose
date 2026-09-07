# BLforecast — Prognosekern

Gegnerbereinigtes, zeitgewichtetes Poisson/Dixon-Coles-Modell fuer die
Bundesliga mit Markt-Blend, Entscheidungsebene und Monte-Carlo-Saisonsimulation.
**Framework-frei:** kein React, kein Server, kein DOM. Laeuft identisch im
Browser, auf einem Worker und in einem Backtest-Skript.

Das ist Phase 1 des Neuaufbaus. Oberflaeche und Persistenz (Prognose-Freeze,
Lernuebersicht) folgen in eigenen Phasen und bauen auf dieser Bibliothek auf.

## Schnellstart

```bash
npm install --legacy-peer-deps   # vitest 4 stolpert sonst ueber einen npm-Peer-Bug
npm run typecheck
npm test                         # 78 Tests, ~1 s, komplett offline (synthetische Ligen)
npm run backtest -- --seasons 2023,2024,2025   # braucht Netz: api.openligadb.de
npm run backtest -- --seasons 2023,2024,2025 --params halfLifeDays=180   # Ablation
npm run backtest -- --seasons 2023,2024,2025 --out .cache/runs/a.json     # je Spiel exportieren
npm run compare -- .cache/runs/a.json .cache/runs/b.json                  # gepaarter Vergleich zweier Laeufe
```

## Was das Modell tut

| Schicht | Kern |
|---|---|
| Teamstaerken | `λ_H = exp(μ + h + a_H + d_A)`, `λ_A = exp(μ + a_A + d_H)` — gemeinsamer Fit aller Angriffs-/Abwehrwerte, Ridge-regularisiert, jeden Schritt zentriert |
| Aktualitaet | Zeitgewicht `exp(-ln2 · t / 210 Tage)`. Das ist der **einzige** Form-Mechanismus — kein zusaetzlicher Form-Blend |
| Optimierer | Zwei Stufen. (1) Adam (lr 0.045) mit dem spezifizierten Kriterium: Parameteraenderung < 2e-6 **und** relative Zielfunktionsaenderung < 1e-9 ueber 20 Schritte, ab Schritt 120, max 850. (2) Newton-Politur im Tangentialraum der Zentrierung; **konvergiert** heisst: projizierter Gradient ≤ 1e-6. Grund: Adams Kriterium misst nur den Schrittkollaps und blieb messbar 0,024 ueber dem Minimum stehen -- startwertabhaengig |
| Kappung | λ ∈ [0.30, 4.50] nur in der **Prognose**. In der Schaetzung seit 4.2.1 nicht mehr: die Kappung in der Likelihood erzeugte einen Knick, auf dem das Optimum nach einem 8:0 neun Spieltage lang sass und kein Gradientenkriterium erfuellbar war (`docs/backtest-4.2.0.md`) |
| Matrix | Poisson × Dixon-Coles (ρ = −0.10), mindestens 0..10 Tore, erweitert bis Restmasse ≤ 5e-9. **Kein** Remis-Boost, **keine** Vielfalts-Regel |
| Aufsteiger | `0.60 · Zweitliga-Rating + ln(Uebersetzungsfaktor)`; Faktor aus frueheren Aufsteigern geschaetzt (Grenzen 0.72–0.96 / 1.04–1.35), Fallback 0.85/1.15 |
| Markt | The Odds API, Power-De-vig, logarithmischer Pool `norm(p_model^0.6 · p_market^0.4)`, Temperatur 1.10 Modell / 1.00 Markt |
| Entscheidung | drei Regeln getrennt: bedingter Modus, globaler Modus, Erwartungspunkte 4/3/2. Standard-Hauptregel: `tipGame` (umschaltbar) |
| Spielprofil | BTTS, Ueber 2,5, erwartete Tore — **ausschliesslich** Zellsummen der finalen Matrix |
| Simulation | zieht vollstaendige Scores aus **denselben** finalen Matrizen, deterministisch (Seed aus Spiel-IDs + Ergebnissen) |

Alle Parameter: `src/model/params.ts`. Vollstaendige Beschreibung und die
Befunde, aus denen dieser Neuaufbau hervorging: `docs/review-4.1.1.md`.

## Was gegenueber 4.1.1 korrigiert ist

Die fuenf reproduzierten Fehler des Reviews sind hier von vornherein
geschlossen — jeder mit Regressionstest:

1. Spielprofil aus der finalen Matrix statt aus den Basis-Lambdas (`derived.ts`)
2. Live-Endstand: offizieller Resultateintrag hat Vorrang vor unvollstaendiger Torliste (`live.ts`)
3. Aktueller Spieltag wird **je Saison** bestimmt — Vorsaison-Spieltag 34 uebersteuert Spieltag 2 nicht (`metrics.ts`)
4. Quoten muessen vor **beiden** Anstosszeiten liegen (OpenLigaDB und Quotenereignis) (`odds.ts`)
5. Saisonsimulation liest die finalen Matrizen der Prognosen — kein zweiter Rechenweg ohne Markt (`simulation.ts`, `forecast.ts`)

Dazu: Vereins-Identitaet ueber numerische IDs statt gepflegter Namens-Maps,
Modell/Markt/Blend-Vergleich nur auf derselben Spielmenge, Quotenalter und
Mindestanzahl Buchmacher als Optionen, Versionsnummer im Backtest aus dem Code.

## Struktur

```
src/
  types.ts              gemeinsame Typen
  model/
    params.ts           Parametersatz, MODEL_VERSION
    weights.ts          Zeitgewichtung
    fit.ts              regularisierter Poisson/DC-Fit (Adam), analytischer Gradient
    matrix.ts           Tor-/Ergebnismatrix
    blend.ts            Temperatur, Log-Pool, Rueckverteilung
    decision.ts         drei Auswahlregeln, 4/3/2-Punkte
    derived.ts          Spielprofil aus der Matrix
    promoted.ts         Zweitliga-Uebersetzung, Priors
    simulation.ts       Monte-Carlo-Saison
    random.ts           deterministischer Zufall
  data/
    openliga.ts         Laden, Normalisieren, Deduplizieren, Pruefen
    live.ts             Live-Status und Spielstand
    season.ts           Saisonzuordnung (1. Juli)
    cache.ts            Datei-Cache fuer Skripte
  market/odds.ts        The Odds API, Zuordnung, De-vig, Zeitregeln
  evaluation/metrics.ts Log-Loss, Brier, RPS (ungeteilt), Punkte, gleiche Teilmenge
  forecast.ts           Orchestrator: Datensatz -> Modell -> Prognoseobjekt -> Simulation
scripts/backtest.ts     Roll-forward-Ruecktest gegen Liga-Poisson-Basis, --params fuer Ablationen, --out je Spiel
scripts/compare.ts      gepaarter Bootstrap zweier Laeufe (Log-Loss, Brier, RPS, Treffer, Punkte, je Saison)
tests/                  78 Tests, u.a. Finite-Differenzen-Gradient, Parameter-Rueckgewinnung, Startwert-Unabhaengigkeit, Knick-Reproduktion
docs/backtest-4.2.0.md  erster Ruecktest auf echten Daten, Befund und Fix
docs/backtest-4.2.1.md  Abnahme 4.2.1, Ablationen, Entscheidung
```

## Was belegt ist — und was nicht

Belegt (Tests, offline): Gradient stimmt mit Finite-Differenzen ueberein
(< 1e-5), der Fit gewinnt die Parameter einer synthetischen Liga zurueck,
Warm- und Kaltstart erreichen dasselbe Optimum (< 1e-5), projizierter
Gradient am Ende ≤ 1e-6, alle Matrix-/Blend-Invarianten, alle fuenf
Review-Fehler.

Ein Befund aus dem Bau, der auch 4.1.1 betrifft: Das dort verwendete
Konvergenzkriterium (Parameteraenderung + Zielfunktionsaenderung) erklaert
Adam fuer konvergiert, sobald sein Schritt kollabiert -- nicht, wenn der
Gradient null ist. Gemessen: ein Warmstart wurde 4,5e-3 neben dem Optimum
als konvergiert gemeldet, und beide Startarten blieben 0,024 ueber dem
Minimum. Deshalb die Newton-Stufe mit projiziertem Gradienten. Am Modell
aendert das nichts, am Nachweis viel.

**Belegt auf echten Daten (4.2.0, 07.09.2026, `docs/backtest-4.2.0.md`):**
Roll-forward ueber 2023/24 bis 2025/26, 918 Spiele, reiner Modellpfad:
1X2 52,61 %, Log-Loss 0,99047, exakt (bedingt) 8,17 %. Referenz 4.1.1 auf
denselben Spielen: 52,51 % / 0,99025 / 8,28 %. Der Neuaufbau reproduziert
4.1.1 auf Rauschniveau. Gegen die Liga-Poisson-Basis: Log-Loss −0,091,
Bootstrap-Intervall [−0,126; −0,079].

Derselbe Lauf zeigte acht nicht konvergierte Fits (2023/24, Spieltage
10–18): das Optimum sass nach dem 8:0 Bayern–Darmstadt exakt auf der
Kappungsgrenze, wo die in der Likelihood gekappte Zielfunktion einen Knick
hat. 4.2.1 nimmt die Kappung aus der Schaetzung. **Abnahme 4.2.1**
(`docs/backtest-4.2.1.md`): 0 von 102 Fits nicht konvergiert, Log-Loss
0,99042, 1X2 52,72 %; nur 2023/24 hat sich bewegt. Ablationen dort:
Halbwertszeit 180 und ρ-Schaetzung schlechter, ρ = −0,13 leicht besser
(Kandidat, kein Nachweis auf getrenntem Zeitraum).

Weiter offen: Marktgewicht 0.40 und Temperaturen sind nicht auf BL-Daten
validiert (braucht historische Quoten), kein unangetasteter Testzeitraum,
keine innere Parametersuche. Siehe `docs/review-4.1.1.md`, Abschnitt 18.
