# Ruecktest 4.2.1 und Ablationen auf 2023/24 bis 2025/26

Laeufe vom 07.09.2026, 11:30 bis 11:33 UTC, GitHub Codespace, jeweils
`npm run backtest -- --seasons 2023,2024,2025 [--params ...]`. Reiner Modellpfad, 918 Spiele,
Roll-forward je Spieltag. Vorgaenger: `docs/backtest-4.2.0.md`.

## 1. Abnahme 4.2.1 (Kappung nur noch in der Prognose)

| | 4.2.0 | 4.2.1 | Erwartung |
|---|---:|---:|---|
| Fits nicht konvergiert | 8/102 | **0/102** | 0 |
| 1X2 | 52,61 % | 52,72 % | unveraendert bis 1 Spiel |
| Log-Loss | 0,99047 | 0,99042 | innerhalb 0,002 |
| exakt cond / global / tipGame | 8,17 / 11,00 / 8,39 % | 8,17 / 11,00 / 8,39 % | unveraendert |
| Pkt/Spiel | 1,324 | 1,326 | |
| Log-Loss vs Basis | −0,09059 [−0,12648; −0,07852] | −0,09065 [−0,12656; −0,07849] | |

Nur 2023/24 hat sich bewegt (Log-Loss 0,97363 auf 0,97347, 1X2 +1 Spiel), 2024/25 und 2025/26 sind bis zur letzten Stelle identisch. Genau das war die Erwartung: Der Knick trat nur nach dem 8:0 auf. Maximaler Anteil Trainingsspiele mit Lambda ausserhalb der Grenzen: 0,14 % (ein Spiel von rund 700), sonst 0.

**Gegenprobe** mit `--params clipInTraining=true`: reproduziert 4.2.0 exakt, inklusive der acht Warnungen an den Spieltagen 10, 12 bis 18 mit projizierten Gradienten zwischen 0,42 und 2,27. Der Schalter tut, was er soll.

**Abnahme bestanden.** 4.2.1 ist der freigegebene Stand.

## 2. Ablationen

Referenz ist 4.2.1 mit `DEFAULT_PARAMS`: Log-Loss 0,99042, 1X2 52,72 %, Pkt/Spiel 1,326.

| Variante | Log-Loss | Δ | 1X2 | exakt tipGame | Pkt/Spiel | je Saison Δ Log-Loss (23/24, 24/25, 25/26) |
|---|---:|---:|---:|---:|---:|---|
| **Default** (Halbwertszeit 210, ρ −0,10 fest) | 0,99042 | | 52,72 % | 8,39 % | 1,326 | |
| `halfLifeDays=180` (v2.1-Startwert) | 0,99061 | +0,00019 | 52,51 % | 8,61 % | 1,325 | −0,0013, +0,0010, +0,0009 |
| `rho=-0.13` (v2.1-Startwert) | 0,99019 | −0,00023 | 52,61 % | 8,93 % | 1,349 | −0,0008, −0,0000, +0,0001 |
| `estimateRho=true` (ρ per MLE, Ridge 12) | 0,99118 | +0,00076 | 52,72 % | 8,06 % | 1,314 | −0,0000, +0,0020, +0,0003 |

Einordnung der Groessenordnung: Der Abstand Modell zu Basis betraegt 0,091. Die Ablationen bewegen sich bei 0,0002 bis 0,0008, also um zwei Zehnerpotenzen darunter. Ohne gepaarten Vergleich der Je-Spiel-Differenzen ist keine dieser Zahlen als Signal belegt; dafuer gibt es jetzt `--out` und `npm run compare` (Abschnitt 4).

**Halbwertszeit 180:** in Summe schlechter, gewinnt 2023/24 und verliert die beiden anderen Saisons. 210 bleibt.

**ρ −0,13:** in Summe leicht besser, getragen fast nur von 2023/24; 2024/25 gleich, 2025/26 minimal schlechter. Auffaellig ist weniger der Log-Loss als die Entscheidungsebene: tipGame trifft 5 Spiele mehr exakt und holt 0,023 Punkte je Spiel mehr (rund 7 Punkte je Saison), und zum ersten Mal tippt eine Regel ein Remis. Das ist plausibel: ρ wirkt genau auf die Zellen 0:0, 1:1, 1:0, 0:1, die fuer die Punkteregel entscheidend sind. Kandidat, nicht Freigabe. Der Literaturwert −0,13 ist nicht auf diesen Saisons gewaehlt worden, das macht ihn glaubwuerdiger als einen gefitteten Wert, aber −0,10 aus 4.1.1 auch nicht nachweislich schlechter.

**ρ geschaetzt:** klar schlechter, vor allem 2024/25. Die MLE von ρ auf dem zeitgewichteten Trainingsfenster (rund 600 effektive Spiele, Ridge 12) ist offenbar zu unruhig; ein fester Wert generalisiert besser. `estimateRho` bleibt aus. Fuer eine spaetere Schaetzung waere ein festes ρ aus mehreren vollstaendigen Saisons ausserhalb des Testzeitraums der richtige Weg (v2.1, Abschnitt 7), nicht die laufende Mitschaetzung.

## 3. Entscheidung

`DEFAULT_PARAMS` bleiben unveraendert (Regel 7: keine Aenderung ohne Nachweis auf einem getrennten Zeitraum). Diese drei Saisons sind dieselben, auf denen 4.1.1 bewertet wurde; ein Gewinn der Standardwerte ist hier teilweise erwartbar, ein Verlust waere aussagekraeftiger gewesen.

Offen bleibt ρ −0,13 als einzige Variante mit Verbesserung in Log-Loss **und** Punkten. Naechster Schritt fuer eine Entscheidung:

1. `npm run compare` auf den beiden Laeufen (Default vs `rho=-0.13`), um zu sehen, ob die Je-Spiel-Differenz ein Intervall ohne 0 hat.
2. Wenn ja: Bestaetigung auf einer Saison, die keine Parameterwahl gesehen hat. 2022/23 ist dafuer geeignet (`--seasons 2022`, braucht 2020 und 2021 als Vorsaisons, beide in OpenLigaDB vorhanden).
3. Erst dann Aenderung in `params.ts`, mit Verweis auf dieses Dokument.

## 4. Werkzeug

```bash
npm run backtest -- --seasons 2023,2024,2025 --out .cache/runs/default.json
npm run backtest -- --seasons 2023,2024,2025 --params rho=-0.13 --out .cache/runs/rho13.json
npm run compare -- .cache/runs/default.json .cache/runs/rho13.json
```

`compare` paart die Spiele ueber die OpenLigaDB-ID, berechnet die Differenz B minus A je Spiel fuer Log-Loss, Brier, RPS, 1X2-Treffer, exakte Treffer und tipGame-Punkte, dazu 95-%-Bootstrap-Intervall, Vorzeichentest und Aufteilung je Saison.

## 5. Was weiterhin nicht belegt ist

Kein Marktvergleich, kein unangetasteter Testzeitraum, keine innere Parametersuche, keine Kalibrierungskurve. Siehe `docs/review-4.1.1.md`, Abschnitte 15 und 18.
