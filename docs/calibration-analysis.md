# Kalibrierungs-Analyse — Markt-Gewichtung (α)

Auswertungen der Markt-Gewichtung `MARKET_BLEND` (Lambda-Blend in `src/lib/poisson.ts`)
gegen die tatsächlich erzielten Ergebnisse aus dem Lernprotokoll (`wm_learnlog_v1`).

Methodik: Aus `lH_model` und `lH_blend` (bei α=0.5) wird das reine Markt-Lambda
rekonstruiert (`λ_markt = 2·λ_blend − λ_model`). Für jedes α werden die Lambdas
neu gemischt, per Poisson + Dixon-Coles (ρ=−0.13) in 1X2-Wahrscheinlichkeiten
umgerechnet und gegen den tatsächlichen Ausgang bewertet (Log-Loss, Brier,
Trefferquote). Kleinere Werte sind besser; das Log-Loss-Minimum bestimmt α.

---

## Snapshot 1 — 02.07.2026 (Ende Gruppenphase)

- **Datenbasis:** 34 gespielte Gruppenspiele (34 mit Ergebnis)
- **Outcome-Verteilung:** 8 Remis (23,5 %), Rest H/A
- **Aktueller Wert:** α = 0.5

| α (Markt-Gewicht) | Log-Loss | Brier | Trefferquote |
|---|---|---|---|
| 0.0 (nur Modell) | 0.7891 | 0.4566 | 67,6 % |
| 0.3 | 0.7827 | 0.4525 | 67,6 % |
| **0.5 (aktuell)** | **0.7813** | **0.4515** | **70,6 %** |
| 0.7 | 0.7824 | 0.4523 | 70,6 % |
| 1.0 (nur Markt) | 0.7888 | 0.4573 | 70,6 % |
| *Markt pur (Referenz)* | *0.7889* | *0.4573* | *70,6 %* |

- **Optimum:** α ≈ 0.50–0.52 (feines Raster: 0.52, LL identisch zu 0.5)
- **Kernbefund:** Der Blend schlägt beide Extreme — bei α=0.5 ist der Log-Loss
  niedriger als bei reinem Modell *und* reinem Markt. Die 50/50-Mischung liefert
  nachweislich bessere Prognosen als jede Quelle allein.
- **Entscheidung:** α = 0.5 unverändert beibehalten.
- **Caveat:** Kleine Stichprobe (34). Nach der K.o.-Runde erneut auswerten.

---

## Dissens-Analyse (Stand Snapshot 1)

Spiele, bei denen Modell und Markt unterschiedliche Sieger favorisieren:

| | Anzahl | davon Remis |
|---|---|---|
| Dissens-Spiele | 3 | 3 (**100 %**) |
| Einigkeit-Spiele | 31 | 5 (16 %) |

**Hypothese:** Modell-Markt-Dissens ist ein Remis-Indikator. Die Stichprobe ist
klein (n=3), das Signal aber auffällig stark. Nach der K.o.-Runde mit vollem
Log erneut prüfen — Achtung: In der K.o.-Runde gibt es kein Remis als Endstand,
dort wäre die analoge Frage, ob Dissens-Spiele überproportional in die
Verlängerung gehen.

---

## Tooling

- **Analyse-Skript:** `node scripts/analyze-learnlog.mjs <export.json>` fährt
  Alpha-Sweep und Dissens-Analyse automatisch (liest v1- und v2-Format).
- **Backup:** `docs/backups/learnlog-2026-07-02-gruppenphase.json` sichert den
  Gruppenphasen-Export (34 Spiele) im Repo — localStorage ist gerätegebunden.

---

## Snapshot 2 — 18.07.2026 (nach K.o.-Runde, vor Platz 3 + Finale)

- **Datenbasis:** 17 K.o.-Spiele (R32 bis Halbfinale) mit Ergebnis; kombiniert
  mit Snapshot 1: **51 Spiele**. Backup:
  `docs/backups/learnlog-2026-07-18-ko-runde.json` (v2, volle Zeitreihen).
- **Methodik-Fix:** analyze-learnlog.mjs nutzt jetzt den letzten SAUBEREN
  Pre-Match-Snapshot (ts < Kickoff, Live-Verdachtsfilter bei Quotensprung
  > 0.12) — einige Log-Eintraege enthielten In-Play-Quoten (z.B. AUS-EGY
  mit 71 % Remis-Quote beim Stand-Remis), die Look-ahead-Bias erzeugt haetten.

### Alpha-Sweep

| alpha | LL nur K.o. (17) | LL kombiniert (51) | Acc kombiniert |
|---|---|---|---|
| 0.0 | **0.7174** | 0.7652 | 72,5 % |
| 0.3 | 0.7240 | **0.7631** | 72,5 % |
| 0.5 (aktuell) | 0.7323 | 0.7650 | **76,5 %** |
| 1.0 (nur Markt) | 0.7676 | 0.7817 | 68,6 % |

- K.o.-Runde allein: **reines Modell schlaegt den Markt deutlich** —
  Umkehrung der Gruppenphase. Kombiniert: flaches Optimum bei alpha ~0.26-0.3,
  alpha=0.5 nur ~0.002 LL schlechter, aber **Trefferquoten-Optimum**
  (76,5 % gesamt, 88,2 % in der K.o.-Runde).

### Dissens-Analyse (gesamtes Turnier, 7 Faelle)

Modell richtig **3** · Markt richtig **0** · Remis **4** (57 % vs. 14 %
Remis-Basisrate bei Einigkeit). Der Markt hat im gesamten Turnier keinen
einzigen Sieger-Dissens gewonnen (USA-BEL, FRA-ESP, ENG-ARG gingen alle ans
Modell). Das Dissens=Remis-Signal aus Snapshot 1 bestaetigt sich.

### Elo-Revision (n=51)

Auf dem vollen Turnier verbessert eine kleine Elo-Beimischung den LogLoss
(w=0.3, alpha=0: LL 0.7540) — **Umkehrung des n=34-Befunds** aus v3.0.0.
Treiber: die Elo-Top-4 (ARG, FRA, ESP, ENG) stellten die Halbfinalisten.
ABER: Trefferquote sinkt dort auf 72,5 %, und das Optimum ist mit zwei
Freiheitsgraden in-sample gefittet (Overfitting-Risiko bei n=51).
Kein hartes Urteil moeglich; der classic-Fallback-Schalter bleibt der
richtige Umgang damit.

### Entscheidung

**Keine Aenderung fuer die letzten 2 WM-Spiele.** Die aktuelle Konfiguration
(w=0, alpha=0.5) ist Trefferquoten-optimal — die Zielgroesse der App —
und eine Umstellung fuer 2 Restspiele hat keinen erwartbaren Nutzen.
Fuer die Bundesliga (siehe bl-migration-playbook.md): Start alpha=0.4
(Mitte des flachen Tals, Richtung Gesamt-Evidenz), Ratings-Beimischung
frueh out-of-sample testen, Dissens=Remis als Feature-Kandidat.

---

## Snapshot 3 — 19.07.2026 (WM-Turnier komplett, final)

- **Datenbasis:** alle 53 gespielten WM-Spiele (34 Gruppe + 19 K.o.,
  inkl. Spiel um Platz 3 und Finale). Backups:
  `docs/backups/learnlog-2026-07-19-final.json` (K.o.-Runde, 19 Spiele,
  volle Zeitreihen) + `learnlog-2026-07-02-gruppenphase.json` (Gruppe).
- Dies ist die **abschliessende Auswertung** der WM 2026. wmforecast wird
  ab jetzt eingefroren; die Ergebnisse sind die Startwerte fuer
  BLforecast 26/27 (siehe bl-migration-playbook.md).

### Finale + Platz 3: der staerkste Dissens des Turniers

- **FRA-ENG (Platz 3):** groesster Markt-Uebergewicht-Fall des gesamten
  Turniers (Markt-Sicherheit 25,5 % fuer Frankreich vs. Modell-Sicherheit
  nur 6,1 % fuer England — Uebergewicht +19,4 %, mehr als jeder vorherige
  Fall). Tatsaechliches Ergebnis: **England gewinnt** — das Modell (das
  England knapp favorisierte) behielt recht, der Markt (klar fuer
  Frankreich) lag falsch. Bemerkenswert: die App erfasste sogar eine
  In-Play-Quote kurz vor Spielende (England 94 % Siegquote) — der
  Live-Filter des Analyse-Skripts hat diesen Ausreisser korrekt verworfen
  und den letzten echten Pre-Match-Snapshot verwendet.
- **ESP-ARG (Finale):** knapper Dissens (Modell leicht fuer Argentinien,
  Markt klar fuer Spanien). Tatsaechliches Ergebnis: **Spanien gewinnt** —
  hier hatte der **Markt** recht, das Modell lag falsch. Der erste
  Markt-Sieg in einem echten Vorzeichen-Dissens im gesamten Turnier.

### Finale Alpha-Sweep (n=53)

| alpha | Log-Loss | Trefferquote |
|---|---|---|
| 0.0 (nur Modell) | 0.7766 | 71,7 % |
| **0.22 (Optimum)** | **0.7749** | 69,8 % |
| 0.5 (genutzter Wert) | 0.7773 | **75,5 %** |
| 1.0 (nur Markt) | 0.7951 | 67,9 % |

Bestaetigt das Bild aus Snapshot 1/2: sehr flaches Tal um alpha=0,2–0,5,
alpha=0.5 bleibt **Trefferquoten-Optimum** und liegt beim Log-Loss nur
0,0024 hinter dem rechnerischen Minimum — kein Grund, die ueber das ganze
Turnier gültige Einstellung nachtraeglich zu revidieren.

### Finale Dissens-Bilanz (9 Faelle im gesamten Turnier)

**Modell 4 · Markt 1 · Remis 4** (44 % Remis-Quote bei Dissens vs. 14 %
bei Einigkeit — das Dissens=Remis-Signal haelt bis zum Schluss). Der Markt
hat seinen ersten Dissens-Sieg im allerletzten Spiel geholt (ESP-ARG) —
das relativiert die vorherige "Markt gewinnt nie"-Beobachtung leicht,
aendert aber nichts am Gesamtbild: Bei Uneinigkeit war das Modell mehr als
viermal so oft richtig wie der Markt, und ein Remis war fast so
wahrscheinlich wie beide Sieger-Varianten zusammen.

### Abschliessendes Fazit fuer die Bundesliga-Migration

1. **alpha=0.4 als Startwert bestaetigt** (Mitte des Tals, robuste Wahl).
2. **Dissens=Remis-Signal ist das staerkste neue Erkenntnis-Element** aus
   der WM — mit 9 Faellen und 44 % vs. 14 % Remis-Quote ist das jetzt
   mehr als eine Anekdote. Fuer die Liga (wo Remis ein regulaerer,
   haeufiger Ausgang ist, nicht nur Vorrunden-Kuriosum) sollte das ein
   fruehes Feature sein: bei erkanntem Vorzeichen-Dissens den
   Remis-Prior anheben, statt nur linear zu blenden.
3. **Reine Lambda-Mittelung hat eine Schwaeche**, die FRA-ENG deutlich
   zeigte: Bei starkem Markt-Uebergewicht kann der Blend dem Markt folgen,
   obwohl die historische Bilanz bei Dissens fuers Modell spricht. Siehe
   die vertiefte Diskussion im Chatverlauf vom 18.07. — ein konkreter
   Kandidat fuer eine bessere Blend-Regel in der BL-App (z.B. Gewichtung
   nach erkanntem Dissens statt fix 50/50).
4. **Elo-Frage bleibt ungeklärt** (kippte zwischen n=34 und n=51 mehrfach) —
   in der BL mit 306 Spielen/Saison und mehr Freiheitsgraden sauber neu
   validieren, nicht aus der WM uebernehmen.

---

## Elo-Validierung & Modell-Vereinheitlichung (v3.0.0)

Vor der Vereinheitlichung wurde am Gruppenphasen-Lernlog (34 Spiele) geprüft,
ob eine Elo-Beimischung in die Basis-Lambdas die Prognose verbessert
(λ_basis = (1−w)·Poisson + w·Elo, Elo-λ via 1.35·exp(±0.0032·Δ)):

| Elo-Gewicht w | Log-Loss ohne Markt | Log-Loss mit Markt (α=0.5) |
|---|---|---|
| **0.0 (reines Poisson)** | 0.7891 | **0.7813** |
| 0.2 | 0.7876 | 0.7818 |
| 0.4 (= v2-Simulation) | 0.7948 | 0.7844 |
| 0.6 | 0.8096 | 0.7890 |

**Befund:** Elo verschlechtert die Prognose bei jedem Gewicht > 0 (Optimum
w ≈ 0). Interpretation: Die Elo-Information ist bereits in den Marktquoten
enthalten — eine zusätzliche Beimischung dupliziert ein vorhandenes Signal.

**Entscheidung (v3.0.0):** Vereinheitlichung auf EIN Modell — die Monte-Carlo-
Simulation nutzt dasselbe Poisson+Markt-Modell wie die Spielprognose:
markt-geblendete Lambdas für real angesetzte Paarungen, reines Poisson für
hypothetische Duelle. Das 60/40-Poisson/Elo-Ensemble entfällt als Standard.

**Fallback-Ebene:** In den Einstellungen ist der Modus „Einheitliches Modell
(v3)" umschaltbar; ausgeschaltet läuft die Simulation wieder im klassischen
60/40-Ensemble (Stand v2). Sollte sich v3 im Turnierverlauf nicht bewähren,
ist die Rückkehr ein Schalter, kein Deployment.

Noch offen (nach dem Turnier): Platt-Kalibrierung auch in der Simulation;
erneute Elo-Prüfung auf dem vollen Turnier-Log (n≈60+).
