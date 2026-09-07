# BLforecast · Claude Code Context

Neuaufbau ab September 2026. Dieses Repo enthaelt den **Prognosekern als
framework-freie TypeScript-Bibliothek** (Phase 1). Oberflaeche und Persistenz
kommen in spaeteren Phasen und bauen auf `src/` auf, ohne dort etwas zu
duplizieren.

Modellversion: **4.2.1** (`src/model/params.ts`). Lineage: 4.1.1 (Review vom
07.09.2026, `docs/review-4.1.1.md`) mit den dort dokumentierten Fehlern
korrigiert; 4.2.0 auf echten Daten als Reproduktion von 4.1.1 belegt
(`docs/backtest-4.2.0.md`); 4.2.1 nimmt die Lambda-Kappung aus der
Schaetzung (Knick-Befund, ebenda). Der aeltere heuristische Kern (Draw-Boost, Monokultur-Schutz,
Form-Blend, Dissens-Signal) ist **bewusst nicht** Teil dieses Modells — siehe
"Nicht machen".

## Befehle

```bash
npm install --legacy-peer-deps      # npm-Peer-Bug mit vitest 4
npm run typecheck                    # tsc --noEmit, strict
npm test                             # vitest, offline, ~1 s
npm run backtest -- --seasons 2023,2024,2025   # braucht Netz
npm run backtest -- --seasons 2023,2024,2025 --params halfLifeDays=180,rho=-0.13   # Ablation
npm run backtest -- --seasons 2023,2024,2025 --out .cache/runs/a.json     # je Spiel exportieren
npm run compare -- .cache/runs/a.json .cache/runs/b.json                  # gepaarter Vergleich
```

Der Ruecktest laeuft nicht in dieser Umgebung (kein Netz). Ergebnisse kommen
vom Nutzer (Codespace) und werden als `docs/backtest-<version>.md` mit Datum
abgelegt, bevor irgendetwas daraus abgeleitet wird.

## Architekturregeln (nicht verhandelbar)

1. **Eine Rechenkette.** Matchkarte, Spielprofil, Saisonsimulation, Backtest
   lesen alle aus `Forecast.scoreMatrix` bzw. `prepareSeasonModel`. Nie einen
   zweiten Rechenweg "nur fuer einen Screen" einfuehren. Die WM-Lektion (Elo-
   Parallelmodell) und Review-Fehler 5 (Simulation ohne Markt) sind genau das.
2. **Abgeleitete Werte nur aus der Matrix.** BTTS, Ueber 2,5, erwartete Tore
   sind Zellsummen (`derived.ts`). Keine geschlossenen Formeln aus Lambdas.
3. **Vereine ueber Team-IDs**, nie ueber Namen. Namensvergleich nur in
   `market/odds.ts` fuer die Odds-API-Zuordnung, mit Diagnose fuer Unbekanntes.
4. **Kein Look-ahead.** Training nur mit `kickoff < asOf`; Quoten nur mit
   Zeitstempel vor beiden Anstosszeiten und `<= asOf`. Zeitgewicht fuer die
   Zukunft ist 0. Jeder neue Datenpfad muss diese Regel explizit einhalten.
5. **Modell vs. Entscheidung trennen.** `decision.ts` liefert drei Regeln;
   welche Hauptregel ist, ist ein Parameter (`primaryRule`), keine
   Modellaenderung. Regeln getrennt versionieren und bewerten.
6. **Framework-frei in `src/`.** Keine React-, DOM- oder Server-Importe. Node-
   spezifisches nur in `data/cache.ts` und `scripts/`.
7. **Parameter aendern nur mit Nachweis.** `DEFAULT_PARAMS` sind historisch
   freigegeben, nicht bewiesen optimal. Aenderung nur nach Vergleich auf
   einem getrennten Zeitraum, dokumentiert in `docs/`.

## Konventionen

- TypeScript strict, `noUnusedLocals`, ESM, Imports mit `.ts`-Endung.
- Tests in `tests/`, synthetische Ligen ueber `tests/helpers/synthetic.ts`.
  Jede Aenderung am Fit muss den Finite-Differenzen-Test und die Parameter-
  Rueckgewinnung bestehen.
- Kommentare erklaeren das **Warum** und verweisen auf Review-Abschnitte.
- Keine Umlaute in Code-Identifiern; in Kommentaren ae/oe/ue.
- Commit-Messages: erste Zeile Imperativ mit Praefix (feat/fix/docs/test),
  Body erklaert die Entscheidung. Keine em-Dashes.

## Nicht machen

- Keine Remis-/Vielfalts-Boosts, keinen Form-Blend ueber "letzte N Spiele"
  (Doppelzaehlung), kein Elo, kein Dissens-Signal — ohne empirischen Nachweis
  auf einem getrennten Zeitraum.
- Kein Fuzzy-Matching des Wettbewerbs-Schluessels (`SPORT_KEY` fest).
- Keine Namens-Maps fuer Vereine.
- Kein `Math.random()` in der Simulation (Seed aus Eingaben).
- Keine statischen Guete-Zahlen im Code ohne Version und Datum.
- API-Keys nie in Client-Builds oder ins Repo.

## Stand und offene Punkte

Belegt offline: Gradient, Rueckgewinnung, Startwert-Unabhaengigkeit des
Optimums, projizierter Gradient ≤ 1e-6, Invarianten, fuenf Review-Fehler.
Optimierer ist zweistufig (Adam wie spezifiziert, dann Newton im
Tangentialraum der Zentrierung). Adams eigenes Kriterium allein blieb
messbar 0,024 ueber dem Minimum -- nie wieder auf `adamConverged` allein
verlassen, `converged` ist das Gradientenkriterium.
Belegt auf echten Daten (4.2.0, 918 Spiele 2023-2025): 1X2 52,61 %,
Log-Loss 0,99047 -- Reproduktion von 4.1.1 (52,51 % / 0,99025); gegen
Liga-Poisson-Basis -0,091 Log-Loss, Bootstrap [-0,126; -0,079].
Befund dabei: Kappung in der Likelihood erzeugt einen Knick; nach einem 8:0
sass das Optimum neun Spieltage darauf, unkonvergierbar. 4.2.1 kappt nur
noch in der Prognose; Abnahme bestanden (0/102 Warnungen, Log-Loss
0,99042, `docs/backtest-4.2.1.md`). Ablationen ebenda: Halbwertszeit 180
und `estimateRho` schlechter, `rho=-0.13` leicht besser (Log-Loss −0,0002,
+0,023 Pkt/Spiel) -- **Kandidat**, Nachweis per `npm run compare` und auf
2022/23 als ungesehener Saison noch offen. Parameter unveraendert.

Naechste Phasen:
- Phase 2: Persistenz und Freeze (Vorabprognosen mit DB-Zeit, Parametersatz,
  Datenhash, Saisonfeld; zeitgesteuerter Lauf vor Anpfiff; Auswertung auf
  gleicher Spielmenge). Hosting-Entscheidung noetig.
- Phase 3: Oberflaeche, komplett neu.
- Offen: Marktgewicht/Temperaturen auf BL-Daten validieren (historische
  Quoten noetig), Ablation je Parameter, unangetasteter Testzeitraum.
