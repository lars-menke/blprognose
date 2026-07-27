# BLforecast 26/27 — Migrations-Playbook

Anleitung für den Umbau der WMForecast-App (Stand v3.2.0) auf die
Bundesliga-Saison 2026/27. Zielrepo: das bestehende BLforecast-Repo
(darf komplett überschrieben werden). Dieses Dokument ist die versionierte
Fassung des Plans, damit die Umsetzung nicht am Chatverlauf hängt.

## Repo-Strategie (entschieden)

- **Neues Zuhause:** altes BLforecast-Repo, Inhalt komplett ersetzen durch
  eine Kopie von wmforecast@v3.2.0 (`git checkout` der Dateien, frisches
  Initial-Commit oder force-push — Historie des alten Repos ist verzichtbar).
- **wmforecast bleibt eingefroren** als WM-2026-Archiv und Blaupause
  (Lernlog-Backups, docs/calibration-analysis.md, Modellhistorie).
- GitHub Pages: eigenes Deployment im BL-Repo (`vite.config.ts` base auf
  Repo-Namen anpassen, gh-pages wie gehabt).

## Phase 0 — vor dem Start (WM-Abschluss)

- [x] Lernlog exportiert -> `docs/backups/learnlog-2026-07-18-ko-runde.json`
- [x] Snapshot 2 in docs/calibration-analysis.md (Stand vor Platz 3 + Finale)
- [x] Turnier beendet — WM 2026 abgeschlossen, wmforecast eingefroren.
      Die letzten 2 Ergebnisse (Platz 3, Finale) sind ein optionales
      Nachtragen mit kleinem Effekt auf n=53 statt n=51, kein Blocker
      fuer den BL-Start.

**Finale Ergebnis-Startwerte fuer die BL (aus n=53, komplettes Turnier —
Snapshot 3 in calibration-analysis.md):**
- **alpha = 0.4** starten (LogLoss-Optimum 0.22, Acc-Optimum 0.5;
  0.4 = Mitte des flachen Tals). Nach 5 Spieltagen re-validieren —
  Liga-Maerkte sind effizienter, Optimum kann niedriger liegen.
- **Dissens=Remis-Signal (Prio 1 fuer die BL):** 9 Dissens-Faelle im
  gesamten Turnier, 44 % davon Remis vs. 14 % bei Einigkeit — deutlich
  mehr als ein Zufallsmuster. Konkreter Bauvorschlag: bei erkanntem
  Vorzeichen-Dissens (Modell und Markt favorisieren unterschiedliche
  Seiten) den Remis-Prior gezielt anheben, statt nur linear zu blenden.
  In der Liga ist Remis ein haeufiger reguleaerer Ausgang (nicht wie beim
  K.o.-Modus gesperrt) — dort zahlt sich das Signal direkt aus.
- **Blend-Schwaeche erkannt:** Das Spiel um Platz 3 (FRA-ENG) zeigte den
  staerksten Markt-Dissens des Turniers (+19,4 % Uebergewicht); das
  Modell behielt trotzdem recht (England gewann). Reine 50/50-Lambda-
  Mittelung kann bei starkem Markt-Uebergewicht "kippen", obwohl die
  Dissens-Historie fuers Modell spricht (Bilanz gesamt: Modell 4, Markt 1,
  Remis 4). Fuer die BL pruefen: Gewichtung nach Dissens-Staerke statt
  fixem alpha, oder ein Cap fuer den Markt-Einfluss bei sehr hoher
  eigener Modell-Sicherheit.
- **Ratings-Beimischung (Elo-Aequivalent) bleibt ungeklaert** — kippte
  zwischen n=34 und n=51 mehrfach die Richtung. Auf WM-Daten nicht robust
  entscheidbar; in der BL mit 306 Spielen/Saison sauber neu validieren,
  nicht ungeprueft uebernehmen.

## Phase 1 — Repo & Rumpf

- [ ] wmforecast-Stand ins BL-Repo kopieren, `package.json` name/version
      (Start: 0.1.0), `vite.config.ts` base, `index.html` Titel/Manifest
- [ ] Entfernen: `bracket.ts` + Test, `BracketView`, K.o.-Logik-Aufrufe,
      WM-`schedule.ts`, `flags.ts`-WM-Teams, Maskottchen/Pokal-Assets
- [ ] Splash: BL-Branding (gleicher Aufbau: zentrierte Gruppe + Dots unten)

## Phase 2 — Datenschicht

- [ ] Spielplan 26/27: OpenLigaDB (`bl1`, Saison `2026`) — bewaehrte Quelle
      des alten BLforecast; Fallback football-data.org (`BL1`)
- [ ] Ergebnisse/Live: OpenLigaDB-Poll analog fetchResults (Cache-TTLs
      uebernehmen: 2 min / 30 s live)
- [ ] Odds: The Odds API Key **exakt** `soccer_germany_bundesliga`
      (Lektion EFL-Cup-Bug: exakter Treffer zuerst, kein includes-Fuzzy)
- [ ] 18 Vereine: `clubs.ts` statt `nations.ts` (Code, Name, Kurzname,
      Farben); Wappen via OpenLigaDB-URLs, Fallback Initialen-Badge in
      Vereinsfarben (Markenrecht beachten, keine Logos einbetten)

## Phase 3 — Modellkern (die eigentliche Arbeit)

- [ ] **Heimvorteil reaktivieren:** `effectiveLambdas` nutzt wieder den
      echten Heim/Auswaerts-Split (hGF x aGA fuer Heim, aGF x hGA fuer
      Auswaerts) statt Neutral-Ground-Mittelung
- [ ] **Rollierende Stats:** buildDynST-Prinzip — Saisonstatistik waechst
      pro Spieltag; plus Formkurve (FORM_WEIGHT 0.40, DECAY 0.72)
- [ ] **Kaltstart Spieltag 1-5:** Priors aus Saison 25/26 (gewichtet),
      Aufsteiger mit Liga-Durchschnitts-Prior minus Malus; gleitender
      Uebergang Prior -> Live-Statistik (z.B. Gewicht n_live/(n_live+6))
- [ ] **K.o.-Sonderlogik entfernen:** knockout-Flag, Remis-Sperre,
      fp-Shootout-Formel raus — Remis ist Kernausgang der Liga
- [ ] **Kalibrierung neu trainieren:** Trainingspipeline
      (train-from-statsbomb.mjs als Vorlage) auf BL-Ergebnisse der letzten
      2-3 Saisons (OpenLigaDB-Historie); HARDCODED_CALIB ersetzen;
      Live-Update-Mechanismus (updateCalib, Prior-Gewicht n=306) bleibt
- [ ] **Backtest gegen Saison 25/26** als Abnahme: LogLoss-Vergleich
      Modell / Markt / Blend wie in docs/calibration-analysis.md
- [ ] MARKET_BLEND: Start 0.5 (WM-validiert), in den ersten 5 Spieltagen
      per Lernlog neu pruefen — Liga-Maerkte sind effizienter, Optimum
      kann niedriger liegen

## Phase 4 — Screens

- [ ] Aktuell-Tab: echte Spieltage 1-34 statt Gap-Clustering
      (OpenLigaDB liefert Spieltagsnummern — Clustering-Code entfaellt)
- [ ] Tabelle: StandingsTable wiederverwenden (CL/EL/Abstiegszonen-Badges)
- [ ] Tipps-Tab: Saisonsimulation statt Turnierbaum — Monte-Carlo ueber
      Restprogramm: Meister, Top-4, EL-Platz, Abstieg; gleiche
      Unsicherheitsbaender, gleicher einheitlicher Modellmodus
- [ ] K.o.-Tab entfaellt ersatzlos (oder spaeter: Pokal)

## Phase 5 — WM-Learnings 1:1 uebernehmen

- [ ] Lernlog v2 (Zeitreihe) + Export-Button + analyze-learnlog.mjs
- [ ] Wett-Radar + Paper-Trading + Abschalt-Schalter (frisches Konto,
      Remis-Wetten in der Liga ERLAUBT — kein 90-Minuten-Problem)
- [ ] Modell-vs-Markt-Vergleich + Verlaufsansicht in der Detailkarte
- [ ] Odds-Freeze bei Anpfiff, Quota-Anzeige, Cache-Keys frisch (bl_-Praefix)
- [ ] Einheitliches Modell (eine Rechenkette; Elo-Lektion: keine
      Parallelmodelle ohne empirischen Nachweis)
- [ ] Einstellungen mit Cluster-Gliederung, Modell-Doku-Texte auf BL
- [ ] Tests portieren: poisson (ohne K.o.-Teil), betRadar, simulation;
      neu: Tabellenberechnung, Formfenster, Kaltstart-Uebergang
- [ ] Design-System unveraendert (tokens.css, MatchCard, Detailsheet)

## Phase 6 — Beta & Saisonstart

- [ ] Beta ~Mitte August 2026 (Supercup/Pokalrunde als Testlauf)
- [ ] Lernlog ab Spieltag 1 scharf; Kalibrier-Analyse nach Spieltag 5
      und in der Winterpause (Snapshot-Rhythmus wie bei der WM)

## Bewusst NICHT uebernehmen

- Bracket/K.o.-Logik, Elfmeterschiessen-advancer, R32-Vorlage
- Elo-Parallelmodell (empirisch widerlegt, siehe calibration-analysis.md)
- Neutral-Ground-Mittelung der Lambdas
- Gap-basiertes Spieltag-Clustering (Liga hat echte Spieltagsnummern)
