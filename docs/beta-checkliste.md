# Beta-Checkliste — erster Lauf mit echten Daten

Die gesamte WM-Rueckmigration (v2.0.0) wurde ohne Netzwerkzugriff auf
OpenLigaDB und The Odds API entwickelt. Alle Pruefungen waren synthetisch
oder offline. Diese Liste ist der erste echte Test.

Reihenfolge ist bewusst gewaehlt: Punkt 1 kann alles Nachfolgende
unbrauchbar machen, also zuerst.

```bash
cp .env.local.example .env.local     # VITE_ODDS_API_KEY eintragen
npm install && npm run dev
```

Browser-Konsole offen lassen — mehrere Pruefungen laufen ueber Warnungen.

---

## 1. Vereins-Maps gegen den echten 26/27-Kader ⚠️ hoechste Prioritaet

**Warum zuerst:** Die drei Team-Maps enthalten die 18 Vereine der Saison
25/26. Auf-/Absteiger fuer 26/27 sind dort noch nicht eingepflegt. Ein
Verein, der in keiner Map steht, verschwindet **lautlos** — `resolveCode`
gibt `null`, `buildMatchEntries` filtert die Partie weg, der Spieltag zeigt
dann z.B. 7 statt 9 Spiele, ohne Fehlermeldung.

Seit v2.0.1 gibt es dafuer eine Diagnose:

- [ ] **Modell-Tab oeffnen.** Erscheint dort ein roter Block „N unbekannte
      Vereine"? Dann die genannten Namen in **alle drei** Maps eintragen:
  - `src/lib/openligadb.ts` → `TEAM_CODE_MAP` (OpenLigaDB-Schreibweise)
  - `src/lib/clubs.ts` → `CLUBS` (Anzeigename, Farbe) **und** `FALLBACK_STATS`
  - `src/lib/fetchOdds.ts` → `ODDS_TEAM_MAP` (englische Odds-API-Schreibweise)
- [ ] **Gegenprobe:** Jeder Spieltag zeigt **genau 9 Partien**. Weniger =
      es fehlt noch ein Verein.
- [ ] Konsole nach `[BLforecast] Verein nicht in TEAM_CODE_MAP` durchsuchen.

Beim Farb-Token fuer neue Vereine: `--club-xxx` in `src/styles/tokens.css`
ergaenzen, nicht lokal hardcoden.

---

## 2. Datenquelle antwortet ueberhaupt

- [ ] Spieltag-Tab zeigt Partien statt „Fehler: …".
- [ ] Spieltagsnummer im Header ist plausibel (vor Saisonstart: 1).
- [ ] Falls OpenLigaDB leer ist, greift football-data.org nur mit
      `VITE_FOOTBALLDATA_API_KEY` — ohne Key bleibt es beim Fehler.
      Saison-Nummer in OpenLigaDB ist `2026` fuer die Spielzeit 2026/27.

---

## 3. Kaltstart an Spieltag 1

Der kritischste Modellteil, weil er nur wenige Wochen im Jahr aktiv ist.

- [ ] Prognosen an Spieltag 1 sind **nicht** alle gleich (z.B. ueberall
      1:1) — das waere ein Zeichen, dass alle Teams auf denselben
      Default-Statistiken sitzen.
- [ ] Ein Aufsteiger gegen einen Spitzenklub wird klar als Aussenseiter
      gefuehrt. Ist er es nicht, greift der Aufsteiger-Prior nicht.
- [ ] Detailkarte oeffnen: λ-Werte liegen grob zwischen 0.5 und 3.0.
      Werte an den Grenzen (0.3 / 4.5) deuten auf kaputte Statistik hin.
- [ ] Ab Spieltag 6-7 sollten die Prognosen sichtbar von der Vorsaison
      wegwandern (Gewicht n/(n+6) kippt zugunsten der Live-Statistik).

---

## 4. Marktquoten

- [ ] Chip „📊 Marktquoten aktiv" erscheint im Spieltag-Tab.
      Fehlt er: Key nicht gesetzt, Kontingent leer, oder die Vereinsnamen
      der Odds API matchen nicht (→ `ODDS_TEAM_MAP`, siehe Punkt 1).
- [ ] Detailkarte → Abschnitt „Modell vs. Markt": beide Zeilen sind
      gefuellt und die Werte liegen in derselben Groessenordnung.
      Weichen sie extrem ab, ist womoeglich Heim/Gast vertauscht.
- [ ] **Remis-Plausibilitaet:** Bei einem ausgeglichenen Spiel mit Quoten
      sollte die angezeigte Remis-Wahrscheinlichkeit **nahe an der
      Marktquote** liegen (wenige Punkte darueber, nicht 10+).
      Genau hier lag der Fehler, der in `5af9fd0` behoben wurde — diese
      Pruefung ist die Absicherung dagegen.
- [ ] Odds-Kontingent im Blick behalten: 500 Requests/Monat im
      Gratis-Tarif, Cache-TTL ist 6 h.

---

## 5. Dissens-Signal

- [ ] Ein Spiel finden, bei dem Modell und Markt unterschiedliche Seiten
      favorisieren. In der Detailkarte erscheint der Hinweis „Dissens".
- [ ] Dort ist die Remis-Wahrscheinlichkeit erkennbar angehoben, aber
      nicht absurd (Aufschlag in der Groessenordnung 8 Punkte, nicht 20).
- [ ] Tritt in den ersten Spieltagen **gar kein** Dissens auf, ist das
      normal — WM-Referenz waren 9 Faelle in 53 Spielen.

---

## 6. Tabelle & Saisonprognose

- [ ] Tabelle stimmt mit einer oeffentlichen Quelle ueberein (Punkte,
      Tordifferenz, Reihenfolge).
- [ ] Saison-Tab: Meisterwahrscheinlichkeiten summieren sich plausibel,
      kein Verein bei 100 %, keiner bei exakt 0 % ausser rechnerisch klar.
- [ ] **Doppelzaehlung ausschliessen:** An einem teilweise gespielten
      Spieltag (Fr gespielt, Sa offen) darf die Saisonprognose nicht
      springen. Das war ein Bug, behoben in `5af9fd0`.
- [ ] Prognostizierte Endpunktzahlen liegen im realistischen Rahmen
      (Meister ca. 65-80, Letzter ca. 18-30).

---

## 7. Lernprotokoll — ab Spieltag 1 scharf

Das ist die Datengrundlage fuer die spaetere Kalibrierung. Laeuft es nicht
mit, ist die Re-Validierung nach Spieltag 5 nicht moeglich.

- [ ] Modell-Tab → „Lernprotokoll" zeigt eine wachsende Zahl.
- [ ] Nach dem ersten Spieltag mit Ergebnissen: „N Spiele mit Ergebnis" > 0.
- [ ] Export testen (Button kopiert in die Zwischenablage, sonst
      Datei-Download) und die JSON-Datei **ausserhalb des Geraets sichern** —
      localStorage ist geraetegebunden und beim Leeren des Browser-Caches weg.
- [ ] Sicherung in `docs/backups/` ablegen, analog zu den WM-Exporten.

---

## 8. Wett-Radar (optional)

- [ ] Panel erscheint nur, wenn es Wetten mit EV > 5 % gibt — kein Panel
      ist ein gueltiger Zustand, kein Fehler.
- [ ] EV-Werte sind plausibel (+5 bis +20 %). Werte wie +150 % deuten auf
      vertauschte Quoten oder ein Mapping-Problem hin.
- [ ] Abschalter im Modell-Tab funktioniert.
- [ ] Paper-Konto rechnet nach Spielende ab (offen → gewonnen/verloren).

---

## Nach Spieltag 5 — Kalibrierung nachziehen

```bash
# Modell-Tab -> "Lernprotokoll exportieren" -> Datei sichern
node scripts/analyze-learnlog.mjs <export.json>
```

Das Skript faehrt Alpha-Sweep und Dissens-Analyse. Beides sind aktuell
**unkalibrierte WM-Startwerte**:

| Parameter | aktuell | Quelle |
|---|---|---|
| `MARKET_BLEND` | 0.4 | Mitte des flachen WM-LogLoss-Tals |
| `DISSENS_DRAW_BOOST_MAX` | 0.08 | WM: 44 % vs. 14 % Remis-Quote |

Zwei Fallstricke:

1. **`LOGGED_ALPHA` im Skript muss mit `MARKET_BLEND` uebereinstimmen.**
   Sonst ist die Markt-Lambda-Rekonstruktion falsch und der ganze Sweep
   verzerrt. Wird `MARKET_BLEND` geaendert, ist der davor geschriebene
   Log-Teil mit dem alten Alpha kodiert.
2. **Nicht bei kleiner Stichprobe umstellen.** Das LogLoss-Tal ist flach;
   unter ~90 Spielen ist der Unterschied zwischen alpha=0.3 und 0.5
   Rauschen. Das Skript weist selbst darauf hin.

Naechster Auswertungszeitpunkt danach: Winterpause.

---

## Was diese Liste nicht abdeckt

- **Backtest gegen die reale Saison 25/26.** Erst im Browser moeglich:
  `window.__backtest()` in der Konsole. `src/lib/backtest.ts` teilt sich den
  Code mit der App und ist die massgebliche Referenz — die Skripte unter
  `scripts/backtest-run.mjs` / `param-sweep.mjs` spiegeln noch das Modell
  von vor der Migration.
- **Odds-Freeze gegen echte In-Play-Bewegungen.** `getFrozenOdds` ist
  ungetestet gegen reale Quotenspruenge waehrend eines laufenden Spiels.
- **Aufsteiger-Malus** (0.85 / 1.15) ist gesetzt, aber nie an historischen
  Aufsteiger-Saisons kalibriert.
- **Genauigkeitswerte im Modell-Tab** (54.2 % / 15.8 % / 69.2 %) stammen aus
  dem Backtest der Saison 25/26 mit dem **alten** Modell, vor Markt-Blend,
  Dissens-Signal und Kaltstart-Prior. Nach den ersten BL-Spieltagen neu
  erheben und ersetzen.
