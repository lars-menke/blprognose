# Ruecktest 4.2.0 auf 2023/24 bis 2025/26

Lauf vom 07.09.2026, 11:11 UTC, GitHub Codespace, `npm run backtest -- --seasons 2023,2024,2025`.
Modell 4.2.0, `DEFAULT_PARAMS` unveraendert, reiner Modellpfad (keine historischen Quoten).
Roll-forward je Spieltag: Stichtag eine Minute vor der ersten Partie, Training nur mit Spielen davor.

## Ergebnis

| | n | 1X2 | exakt cond | exakt global | exakt tipGame | Log-Loss | LL Score | Brier | RPS | Pkt/Spiel |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2023/24 Modell | 306 | 51,63 % | 9,48 % | 14,38 % | 10,78 % | 0,97363 | 3,04743 | 0,58073 | 0,38775 | 1,330 |
| 2023/24 Basis | 306 | 43,79 % | 7,52 % | 13,40 % | 7,52 % | 1,07619 | 3,20843 | 0,65128 | 0,45654 | 1,105 |
| 2024/25 Modell | 306 | 51,31 % | 7,19 % | 7,19 % | 6,21 % | 1,01766 | 3,11049 | 0,60878 | 0,41993 | 1,271 |
| 2024/25 Basis | 306 | 38,56 % | 5,23 % | 8,50 % | 5,23 % | 1,09534 | 3,23655 | 0,66553 | 0,47724 | 0,977 |
| 2025/26 Modell | 306 | 54,90 % | 7,84 % | 11,44 % | 8,17 % | 0,98013 | 3,08192 | 0,58133 | 0,39693 | 1,369 |
| 2025/26 Basis | 306 | 43,79 % | 8,50 % | 11,11 % | 8,50 % | 1,07167 | 3,22193 | 0,64855 | 0,46330 | 1,150 |
| **Gesamt Modell** | 918 | **52,61 %** | 8,17 % | 11,00 % | 8,39 % | **0,99047** | 3,07995 | 0,59028 | 0,40154 | 1,324 |
| Gesamt Basis | 918 | 42,05 % | 7,08 % | 11,00 % | 7,08 % | 1,08107 | 3,22230 | 0,65512 | 0,46569 | 1,077 |

Basis = Liga-Poisson mit ligaweiten Heim-/Auswaertsintensitaeten aus demselben Trainingsfenster, gleiche Temperatur.

Log-Loss-Differenz Modell minus Basis: **-0,09059**, gepaarter Bootstrap 95 % [-0,12648; -0,07852]. Das Modell ist auf allen drei Saisons klar besser als die Basis; das Intervall liegt weit von 0.

Remis-Tipps: 0 bei allen drei Regeln. Haeufigste Primaerscores (conditional): 2:1 43,46 %, 1:2 26,91 %, 1:0 10,13 %, 2:0 8,61 %, 0:1 4,90 %; 11 verschiedene Scores.

## Einordnung gegen 4.1.1

Referenz aus `docs/review-4.1.1.md` auf denselben 918 Spielen: 1X2 52,51 %, Log-Loss 0,99025, exakt (bedingt) 8,28 %.

| | 4.1.1 | 4.2.0 | Differenz |
|---|---:|---:|---:|
| 1X2 | 52,51 % | 52,61 % | +1 Spiel |
| Log-Loss | 0,99025 | 0,99047 | +0,00022 |
| exakt cond | 8,28 % | 8,17 % | -1 Spiel |

Der Neuaufbau reproduziert 4.1.1 auf Rauschniveau. Das ist der Nachweis, dass Fit, Zeitgewichtung, Matrix und Entscheidungsregeln korrekt portiert sind. Die geaenderten Aufsteiger-Priors (Uebersetzung aus Zweitligaratings statt Liga-Schnitt mit Malus) bewegen die Gesamtguete nicht messbar; sie wirken nur auf 2 von 18 Vereinen in den ersten Spieltagen.

## Befund: acht Fits nicht konvergiert

2023/24, Spieltage 10 bis 18, jeweils 880 Schritte (850 Adam + 30 Newton). Keine Warnung in den anderen Saisons.

Ursache, synthetisch reproduziert (`tests/model-core.test.ts`, Test "Knick"): 4.1.1 und 4.2.0 kappen Lambda auch waehrend der Schaetzung auf [0,30; 4,50] und setzen den Daten-Gradienten ausserhalb auf 0. Die Zielfunktion hat damit an der Grenze einen Knick. Ein extremes Ergebnis (am 9. Spieltag 2023/24 das 8:0 Bayern gegen Darmstadt) schiebt das Lambda dieser Paarung von unten mit `(x - lambda) * w` an die Grenze; von oben ist das Spiel stumm, Ridge und uebrige Spiele ziehen zurueck. Das Optimum liegt exakt auf dem Knick, dort existiert kein Punkt mit Gradient 0. Adam pendelt bis zum Limit, Newton kriecht an den Knick, der projizierte Gradient bleibt in der Groessenordnung des einseitigen Schubs. Sobald das Zeitgewicht des 8:0 gegenueber den nachfolgenden Spielen genug gesunken ist (ab Spieltag 19), verlaesst das Optimum die Grenze und alles konvergiert wieder.

Auf die Guete hat das keinen messbaren Einfluss: Der gefundene Punkt ist das Minimum der so definierten Zielfunktion, nur das Kriterium ist unerfuellbar. Es ist aber ein Konstruktionsfehler der Zielfunktion, und in Phase 2 wuerde jeder Freeze mit `converged = false` zu Recht als unsauber markiert.

Fix in 4.2.1: Kappung nur noch in der Prognose (`lambdasFor`), nicht in der Likelihood. Die Zielfunktion ist damit glatt und strikt konvex; Ausreisser daempft der Ridge (ein 8:0 verschiebt das Angriffsrating um etwa 0,1 mehr als mit Kappung). Der Anteil der Trainingsspiele mit Lambda ausserhalb der Grenzen bleibt als `clippedShare` Diagnosewert. Das alte Verhalten ist ueber `clipInTraining=true` fuer die Ablation erreichbar.

## Naechster Lauf

```bash
npm run backtest -- --seasons 2023,2024,2025
npm run backtest -- --seasons 2023,2024,2025 --params clipInTraining=true
```

Erwartung fuer 4.2.1: keine Konvergenzwarnung, Gesamtguete innerhalb von etwa 0,002 Log-Loss um 4.2.0, Abweichung nur in 2023/24. Groessere Abweichungen sind zu erklaeren, nicht wegzuoptimieren.

Weitere Ablationen mit `--params` (Werte aus `docs/modelknowledge-v2.1`, dort als "per Walk-forward bestimmen" gekennzeichnet):

```bash
npm run backtest -- --seasons 2023,2024,2025 --params halfLifeDays=180
npm run backtest -- --seasons 2023,2024,2025 --params rho=-0.13
npm run backtest -- --seasons 2023,2024,2025 --params estimateRho=true
npm run backtest -- --seasons 2023,2024,2025 --params priorReliability=0.75
```

## Was dieser Test nicht belegt

Kein Marktvergleich (keine historischen Quoten), kein unangetasteter aeusserer Testzeitraum, keine innere Parametersuche. Die drei Saisons sind dieselben, auf denen 4.1.1 bewertet wurde. Der Test belegt die korrekte Portierung und den Vorteil gegenueber der Liga-Poisson-Basis; er belegt nicht, dass die Parameter optimal sind, und nichts ueber den Vorteil gegenueber Buchmachern. Siehe `docs/review-4.1.1.md`, Abschnitte 15 und 18.
