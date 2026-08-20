# BLforecast — Modell-Wissen

Dieses Dokument beschreibt **wie das Modell denkt**, nicht wie die App aussieht.
Ziel: Wenn UI/UX komplett neu gebaut wird (andere Sprache, anderes Framework,
anderer Anbieter), soll dieses Wissen erhalten bleiben. Alles hier ist
Domänenwissen, keine Implementierungsdetails von React/CSS/TypeScript — die
Formeln und Entscheidungen gelten unabhängig vom Tech-Stack.

Stand: v2.0.1, nach vollständigem Code-Review. Herkunft: BLforecast (Original)
→ Fork zu wmforecast (WM 2026) → Erkenntnisse zurückportiert nach BLforecast.

---

## 1. Grundidee

Jedes Spiel wird als Zufallsprozess modelliert: Beide Teams erzielen Tore
gemäß einer Poisson-Verteilung mit einem erwarteten Torwert (Lambda, λ). Aus
den beiden Lambdas (λ_Heim, λ_Auswärts) lässt sich eine vollständige
Wahrscheinlichkeitsverteilung über alle Ergebnisse (0:0, 1:0, 0:1, 1:1, 2:0, …)
berechnen — daraus wiederum 1X2-Wahrscheinlichkeiten (Heimsieg/Remis/
Auswärtssieg).

Das eigentliche Modell besteht aus mehreren Schichten, die nacheinander auf
diese Basis-Lambdas einwirken. Reihenfolge ist wichtig, siehe Abschnitt 8.

---

## 2. Basis-Lambda: Saisonstatistik + Heim-/Auswärtssplit

**Kein Neutral-Ground.** Ein Team hat zwei unterschiedliche Stärkeprofile: wie
es zuhause spielt und wie es auswärts spielt. Das ist eine bewusste
Entscheidung — die WM-Variante des Modells (neutrale Turnierspiele) mittelte
Heim- und Auswärtswerte zu einem symmetrischen Durchschnitt. Für eine Liga mit
echtem Heimvorteil ist das falsch und wurde nie übernommen.

```
λ_Heim = HeimteamHeimtorquote × (AuswärtsteamAuswärtsGegentorquote / Liga-Ø-Auswärts-Gegentore)
λ_Auswärts = AuswärtsteamAuswärtstorquote × (HeimteamHeimGegentorquote / Liga-Ø-Heim-Gegentore)
```

Konkret (Variablennamen aus dem Code): `hGF`/`hGA` = Tore erzielt/kassiert des
Heimteams *in Heimspielen*, `aGF`/`aGA` = Tore erzielt/kassiert des
Auswärtsteams *in Auswärtsspielen*.

```
λ_H = hGF × (aGA / LG_DEF_A)
λ_A = aGF × (hGA / LG_DEF_H)
```

`LG_DEF_H` (1.21) und `LG_DEF_A` (1.58) sind Liga-Durchschnittswerte für
Heim- bzw. Auswärts-Gegentore — Normalisierungskonstanten, kein Team-Wert.
Beide sind Fallback-Werte aus einer früheren Bundesliga-Saison; sie ändern
sich langsam über Spielzeiten und lohnen sich, gelegentlich neu zu berechnen
(einfacher Mittelwert über alle 18 Teams).

**Grenzen:** Lambda wird immer auf `[0.3, 4.5]` gekappt. Das verhindert
absurde Extremwerte bei sehr kleinen Stichproben (z.B. ein Team mit 0
Gegentoren aus einem einzigen Spiel).

---

## 3. Formkurve: aktuelle Verfassung vs. Saisondurchschnitt

Reine Saisonstatistik reagiert träge — ein Team, das die letzten 5 Spiele
seine Form komplett verändert hat, wird vom Saisonschnitt nicht erfasst.
Deshalb wird die Basisstatistik mit einer gewichteten Formkurve geblendet:

```
effektiv = (1 - FORM_WEIGHT) × Saisonschnitt + FORM_WEIGHT × Formkurve
FORM_WEIGHT = 0.40
```

Also 60 % Saison, 40 % Form — die Form hat spürbares, aber nicht dominantes
Gewicht.

**Formkurve-Konstruktion:**
- Rollenspezifisch: für die Heimrolle zählen die letzten Heimspiele des
  Heimteams, für die Auswärtsrolle die letzten Auswärtsspiele des
  Auswärtsteams. Nicht "die letzten 5 Spiele egal wo".
- Fallback: hat ein Team weniger als 3 rollenspezifische Spiele (früh in der
  Saison), werden stattdessen die letzten 5 Spiele *unabhängig von der
  Rolle* genutzt — besser eine geringfügig unpassende Stichprobe als keine.
- Exponentiell gewichtetes Mittel, `DECAY = 0.72`: das jüngste Spiel zählt mit
  Gewicht 1.0, das davor mit 0.72, das davor mit 0.72² ≈ 0.52, usw. Ältere
  Spiele verlieren schnell an Einfluss, ohne komplett zu verschwinden.
- Fenster: die letzten 5 Spiele (rollenspezifisch oder gemischt, siehe oben).

---

## 4. Dixon-Coles-Korrektur

Reines Poisson unterstellt, dass Heim- und Auswärtstore unabhängig
voneinander sind. In echten Fußballdaten stimmt das nicht ganz: niedrige
Ergebnisse (0:0, 1:0, 0:1, 1:1) treten systematisch häufiger auf, als reines
Poisson vorhersagt (typisch: vorsichtiges Spiel bei knappem Stand, oder ein
früher Führungstreffer verändert das Spielverhalten beider Teams).

Dixon-Coles korrigiert genau diese vier Zellen der Ergebnismatrix mit einem
Faktor τ, gesteuert durch **ρ (rho) = -0.13**:

```
τ(0,0) = 1 - λ_H·λ_A·ρ
τ(0,1) = 1 + λ_H·ρ
τ(1,0) = 1 + λ_A·ρ
τ(1,1) = 1 - ρ
τ(alles andere) = 1
```

Alle anderen Ergebnisse (2:0, 2:1, 3:1, …) bleiben unangetastet — reines
Poisson-Produkt der beiden Randverteilungen.

ρ = -0.13 ist ein literaturüblicher Wert für Fußball (Dixon & Coles 1997
fanden Werte in der Größenordnung -0.1 bis -0.2 je nach Liga/Saison). Wurde
nicht neu aus BL-Daten geschätzt, ist aber ein etablierter Startwert.

---

## 5. Struktureller Draw-Boost

**Beobachtung:** Poisson + Dixon-Coles unterschätzt trotzdem noch die
Remis-Wahrscheinlichkeit bei ausgeglichenen Spielen (kleine λ-Differenz).
Reale Fußballdaten zeigen: je enger zwei Teams beieinander liegen, desto
häufiger endet das Spiel Remis — deutlicher, als das reine Modell zeigt.

```
lambdaDiff = |λ_H - λ_A|
wenn lambdaDiff < DRAW_BOOST_RANGE (0.40):
    boost = DRAW_BOOST_MAX × (1 - lambdaDiff / DRAW_BOOST_RANGE)
    boost reicht von 0 (bei lambdaDiff = 0.40) bis DRAW_BOOST_MAX = 0.15 (bei lambdaDiff = 0)
```

Der Boost wird linear zwischen `lambdaDiff = 0` (voller Boost) und
`lambdaDiff = 0.40` (kein Boost) interpoliert. Der Aufschlag wird
proportional aus pH und pA entnommen (nicht einfach von pH abgezogen), damit
die Rangfolge zwischen Heim- und Auswärtssieg erhalten bleibt — ein Favorit
bleibt Favorit, nur die Gesamtwahrscheinlichkeit für Sieg sinkt zugunsten
Remis. Deckel bei `pD ≤ 0.55` (kann durch weitere Boosts, siehe Abschnitt 7,
minimal überschritten werden, dann bei 0.60 final gekappt).

**Kritische Regel, die einmal verletzt wurde (siehe Abschnitt 12):**
Dieser Boost darf **nur greifen, wenn keine Marktquote vorliegt**. Der Markt
(Buchmacherquoten) preist die Remis-Wahrscheinlichkeit bereits korrekt ein —
ein zusätzlicher struktureller Aufschlag obendrauf würde die Prognose
systematisch über die Marktquote heben. Sobald eine Marktquote da ist, ist
dieser Boost aus; einzig der Dissens-Boost (Abschnitt 7) kann dann noch
greifen.

---

## 6. Marktkorrektur: Newton-Raphson + Blend

Wenn Buchmacherquoten für ein Spiel vorliegen, ist der Markt eine zusätzliche
Informationsquelle — er aggregiert Wetteinsätze vieler Akteure und ist in
effizienten Ligen (Bundesliga deutlich mehr als bei einem WM-Turnier)
tendenziell gut kalibriert.

**Schritt 1 — Newton-Raphson löst das inverse Problem:** Gegeben eine
Zielquote (z.B. Markt sagt 45 % Heimsieg, 25 % Remis, 30 % Auswärtssieg),
welches Lambda-Paar (λ_H, λ_A) würde diese Wahrscheinlichkeiten exakt
reproduzieren? Das ist kein geschlossen lösbares Gleichungssystem (durch die
Dixon-Coles-Korrektur und die diskrete Summierung über die Ergebnismatrix),
deshalb iterativ per Newton-Raphson: numerischer Jacobian, 12 Iterationen,
Dämpfungsfaktor 0.5, Abbruch bei Konvergenz `< 0.002`. Ergebnis:
`(λ_H_markt, λ_A_markt)`.

**Schritt 2 — Blend statt Vollübernahme:**

```
λ_final = λ_modell × (1 - MARKET_BLEND) + λ_markt × MARKET_BLEND
MARKET_BLEND = 0.4
```

Also **60 % Modell, 40 % Markt.** Das ist eine bewusste Design-Entscheidung
gegen einen vollen Sprung auf die Marktquote — das Modell bringt eigene
Information ein (Formkurve, Kaltstart-Prior), die der Markt bei wenig
beachteten Ligaspielen möglicherweise nicht vollständig einpreist. Ein reiner
Marktfolger würde diesen Mehrwert verschenken.

**Warum genau 0.4, nicht 0.5 oder 0.3?** Das ist ein aus einem
WM-2026-Turnier übernommener Startwert (siehe Abschnitt 11) — dort lag das
Log-Loss-Optimum in einem flachen Tal zwischen 0.2 und 0.5, mit 0.4 als
Kompromissmitte in Richtung Gesamt-Evidenz. **Nicht an BL-Daten kalibriert.**
Liga-Märkte gelten als effizienter als WM-Märkte (mehr Liquidität, mehr
Wettanbieter, bessere Informationslage) — das tatsächliche Optimum für die
Bundesliga könnte niedriger liegen (mehr Marktgewicht). Das ist der zentrale
offene Kalibrierpunkt für die ersten Spieltage.

---

## 7. Dissens-Signal: Wenn Modell und Markt sich widersprechen

**Beobachtung aus dem WM-2026-Turnier:** Wenn Modell und Markt unterschiedliche
Sieger favorisieren (nicht nur unterschiedliche Wahrscheinlichkeiten, sondern
tatsächlich verschiedene Seiten als wahrscheinlicheren Sieger sehen), endete
das Spiel überproportional oft Remis: 44 % der Dissens-Fälle vs. 14 % bei
Einigkeit, über 9 Dissens-Fälle in 53 Turnierspielen. Kleine Stichprobe, aber
deutliches Muster — nachvollziehbar: wenn zwei unabhängige, unterschiedlich
informierte Systeme sich nicht einig sind, wer gewinnt, ist das selbst ein
Signal für einen unklaren Spielausgang, und ein unklarer Ausgang tendiert
öfter zum Remis als zu einem knappen Sieg der einen oder anderen Seite.

**Erkennung:**
```
modelSide = Heimsieg, wenn reine Modellwahrscheinlichkeit (ohne Markt) pH > pA
            Auswärtssieg, wenn pA > pH
marketSide = Heimsieg, wenn Marktquote H > Marktquote A, sonst Auswärtssieg

Dissens = modelSide ≠ marketSide (nur relevant, wenn beide definiert sind, also nur mit Marktquote)
```

**Reaktion:** Ein zusätzlicher Remis-Aufschlag `DISSENS_DRAW_BOOST_MAX = 0.08`,
mit derselben proportionalen Umverteilungslogik wie der strukturelle Boost
(Abschnitt 5). Setzt zwingend eine Marktquote voraus — ohne Markt gibt es
keinen Dissens-Begriff. Schließt sich mit dem strukturellen Boost gegenseitig
aus: strukturell nur ohne Markt, Dissens nur mit Markt und nur bei
Widerspruch.

**Auch unkalibriert.** 0.08 ist der WM-Rohwert, nie an BL-Daten geprüft. Die
BL hat mit 306 Spielen/Saison deutlich mehr Beobachtungen als eine WM
(51 Gruppenspiele), das Signal lässt sich also nach ein paar Spieltagen
sauberer validieren, als es beim WM-Turnier möglich war.

---

## 8. Reihenfolge der Berechnung (wichtig für Reimplementierung)

Die Reihenfolge, in der die Schichten angewendet werden, ist kein Zufall —
eine andere Reihenfolge würde andere Zahlen liefern:

```
1. Team-Basisstatistik (Saison, Heim-/Auswärtssplit)
2. + Formkurve-Blend                              -> λ_H0, λ_A0 (reines Modell-Lambda)
3. Reine Modellsicht berechnen (Dixon-Coles auf λ0, + struktureller Draw-Boost)
   -> pH_model, pD_model, pA_model  (Transparenz-/Vergleichswert, geht nicht weiter in die Kette ein)
4. WENN Marktquote vorhanden:
   a. Newton-Raphson löst Markt-Lambda
   b. Blend mit MARKET_BLEND -> λ_H, λ_A (finales Lambda)
   c. Dissens erkennen (Modellseite vs. Marktseite, aus Schritt 1/2 vs. Marktquote)
   SONST: λ_H, λ_A = λ_H0, λ_A0 (unverändert)
5. Dixon-Coles auf das finale λ_H, λ_A -> Roh-Wahrscheinlichkeiten
6. Draw-Boost anwenden:
   - strukturell, NUR wenn kein Markt (Schritt 4 nicht durchlaufen)
   - Dissens-Aufschlag, NUR wenn Markt UND Dissens erkannt
7. Kalibrierung (Platt-Scaling oder Shrink-Fallback), NUR wenn kein Markt
   -> finale pH, pD, pA
8. Remis-Schwelle prüfen (Abschnitt 9) -> Tipp-Auswahl
9. Natürlicher Score-Tipp mit Zusatzregeln (Abschnitt 10)
10. Monokultur-Schutz über alle Spiele eines Spieltags (Abschnitt 11)
```

Zentrale Designentscheidung in Schritt 6/7: **Kalibrierung und struktureller
Draw-Boost sind reine "Modell-ohne-Markt"-Werkzeuge.** Sobald der Markt
mitspricht, übernimmt dessen eigene, empirisch geprüfte Kalibrierung
implizit diese Rolle (Buchmacher kalibrieren ihre eigenen Quoten). Die
Platt-Kalibrierung dieses Modells ist explizit auf reine Modell-Samples
trainiert (siehe Abschnitt 13) — sie auf marktgeblendete Werte anzuwenden
wäre falsch kalibriert, weil sie eine andere Wahrscheinlichkeitsverteilung
sieht als die, auf der sie trainiert wurde.

---

## 9. Von Wahrscheinlichkeit zu Tipp: die Remis-Schwelle

Reine "höchste Wahrscheinlichkeit gewinnt" würde zu selten Remis tippen, weil
Remis auch bei einem strukturell erhöhten pD oft knapp hinter Heim- oder
Auswärtssieg liegt. Deshalb eine Mindestschwelle für einen Remis-Tipp:

```
Basis-Schwelle: 0.20 (DRAW_THRESHOLD), oder 0.17 (DRAW_THRESHOLD_TIGHT) wenn lambdaDiff < 0.25
Wenn kalibriert: Schwelle × 0.55 (kalibrierte Werte sind Richtung 1/3 komprimiert, Schwelle muss mitschrumpfen)
```

Ist pD größer als diese Schwelle **und** ohnehin die höchste der drei
Wahrscheinlichkeiten, bleibt der Tipp Remis. Sonst wird auf die Seite mit
höherer Wahrscheinlichkeit "geblockt" (`drawBlocked = true`), auch wenn pD
technisch die größte Einzelwahrscheinlichkeit war — ein knapper
Remis-Vorsprung bei insgesamt niedriger Sicherheit ist kein verlässlicher
Tipp.

---

## 10. Natürlicher Score-Tipp: nicht einfach das wahrscheinlichste Ergebnis

Das statistisch wahrscheinlichste Einzelergebnis passt manchmal nicht zur
eigenen Tipp-Logik. Zwei Zusatzregeln filtern die Score-Kandidatenliste
(sortiert nach Wahrscheinlichkeit), bevor der erste passende Score gewählt
wird:

1. **Mindesttor-Regel:** Wenn `P(mind. 1 Auswärtstor) ≥ 50 %`, wird ein 0
   für das Auswärtsteam als Ergebnis übersprungen (analog für Heimtore). Ein
   Team, das mit über 50 % Wahrscheinlichkeit trifft, tippt man nicht auf
   eine Nullnummer.
2. **Favorit-Mindestscore-Regel:** Wenn das Lambda des Favoriten ≥ 2.0
   (`FAV_MIN_GOALS_LAMBDA`), muss der Favorit im getippten Score mindestens 2
   Tore erzielen — ein hoher Erwartungswert rechtfertigt keinen knappen 1:0.

Beide Regeln greifen nur innerhalb der bereits durch die Remis-Schwelle
festgelegten Gewinnerseite (`wo`), sie ändern nie, wer als Sieger gilt, nur
welcher konkrete Score dafür getippt wird. Wird durch die Regeln kein
passender Score gefunden, fällt die Auswahl auf den ursprünglichen,
unregulierten Top-Score zurück.

---

## 11. Monokultur-Schutz

Ohne Gegenmaßnahme würde das Modell an einem Spieltag mit vielen ähnlich
gelagerten Spielen denselben Score übermäßig oft tippen (z.B. 5× "2:1" an
einem Spieltag, weil das bei mehreren ausgeglichenen Favoriten-Paarungen der
statistisch wahrscheinlichste Score ist). Das wirkt unplausibel und reduziert
den Informationswert der App.

**Regel:** Kein Score darf öfter als `MONO_MAX = 2` mal an einem Spieltag als
Tipp vergeben werden. Bei Überschreitung wird nach Konfidenz priorisiert
(die Spiele mit der höchsten Score-Wahrscheinlichkeit behalten den Score,
der Rest weicht auf die nächstbeste Alternative aus derselben Sieger-Seite
aus). Bei gleicher Konfidenz entscheidet die Rang-Differenz zwischen den
beiden Teams (größerer Rang-Unterschied = eindeutigeres Spiel, behält den
Score eher).

Wichtig: **reihenfolgeunabhängig** — das Ergebnis hängt nicht davon ab, in
welcher Reihenfolge die Spiele eines Spieltags verarbeitet werden, weil die
gesamte Zuteilung erst nach Berechnung aller Rohtipps anhand der
Konfidenz-Rangfolge entschieden wird, nicht spielweise nacheinander.

---

## 12. Kaltstart-Prior: Was tun, wenn kaum Daten da sind?

**Problem:** An Spieltag 1 hat kein Team auch nur ein Spiel der laufenden
Saison. Reine Live-Statistik würde auf generische Defaultwerte zurückfallen
(ca. 1.3/1.4/1.1/1.5 als Torquoten) — für jedes Team gleich, das Modell hätte
keinerlei Unterscheidungskraft.

**Lösung:** Ein gleitender Übergang zwischen Vorsaison-Statistik (Prior) und
Live-Statistik der laufenden Saison, gewichtet nach Anzahl gespielter Partien:

```
w = n_live / (n_live + 6)
Statistik = (1 - w) × Prior + w × Live-Statistik
```

Bei 0 gespielten Partien zählt nur der Prior (w=0). Bei 6 gespielten Partien
ist es 50/50. Ab etwa 12+ Spielen dominiert die Live-Statistik zunehmend
(w ≈ 0.67 bei n=12, w ≈ 0.85 bei n=34). Das ist ein **glatter** Übergang,
kein harter Cutoff nach Spieltag 5 — der Effekt klingt von selbst aus, ohne
Sonderfall-Logik im aufrufenden Code.

**Der Prior selbst:**
- Für ein Team, das letzte Saison in derselben Liga war: seine tatsächliche
  Vorsaison-Statistik (volle Saison, nicht rollierend).
- Für einen **Aufsteiger** (nicht in der Vorsaison-Liga): Liga-Durchschnitt
  der Vorsaison, abgeschwächt mit einem Malus:
  ```
  hGF_Prior = Liga-Ø-hGF × 0.85   (PROMOTED_GF_MALUS — schwächerer Angriff)
  hGA_Prior = Liga-Ø-hGA × 1.15   (PROMOTED_GA_MALUS — schwächere Abwehr)
  ```
  Diese Werte (0.85/1.15) sind eine plausible Heuristik, **nie an
  historischen Aufsteiger-Saisons kalibriert.** Ein sauberer Ansatz für die
  Zukunft: für jede vergangene Bundesliga-Saison prüfen, wie stark
  Aufsteiger im Schnitt unter dem Liga-Mittel lagen, und den Malus daraus
  ableiten statt zu schätzen.

**Kritischer Fallstrick (siehe Abschnitt 12.1):** Die Liga-Zugehörigkeit für
diesen Mechanismus darf **nicht** aus "wer hat schon gespielt" oder "wer war
letzte Saison da" abgeleitet werden — beides schließt den Aufsteiger an
Spieltag 1 aus, gerade dort, wo der Malus-Prior gebraucht wird. Sie muss aus
dem **Spielplan der laufenden Saison** kommen (wer taucht überhaupt als
Team1/Team2 in den angesetzten Partien auf), unabhängig davon, ob schon
gespielt wurde.

---

## 13. Kalibrierung: Platt-Scaling

Rohe Modellwahrscheinlichkeiten sind nicht automatisch gut kalibriert (wenn
das Modell "70 % Heimsieg" sagt, gewinnt das Heimteam nicht zwangsläufig in
70 % der Fälle über viele Spiele hinweg — Modelle neigen oft zu Über- oder
Unterkonfidenz an den Rändern).

**Platt-Scaling** lernt für jeden der drei Ausgänge (H/D/A) unabhängig eine
Sigmoid-Korrekturfunktion:
```
p_kalibriert = sigmoid(a × logit(p_roh) + b)
```
`a` und `b` werden per Gradient Descent auf Log-Loss über vergangene Spiele
gefittet (a < 1 dämpft Überkonfidenz, b verschiebt einen systematischen Bias).
Nach der Korrektur aller drei Ausgänge wird auf Summe 1 renormiert.

**Trainingsdaten:** Rollierend aus der laufenden Saison (ab Spieltag 5) plus
der kompletten Vorsaison — explizit **nur reine Modellwahrscheinlichkeiten
ohne Markt** (siehe Abschnitt 8, Reihenfolge). Kein Data-Leakage: für ein
Spiel an Spieltag N werden nur Statistiken verwendet, die vor Spieltag N
bekannt waren.

**Mindeststichprobe:** 45 Samples (`minSamples`, entspricht ungefähr 5
Spieltagen). Darunter greift ein einfacherer **Shrink-to-Mean-Fallback**:
```
p_shrunk = 1/3 + (p_roh - 1/3) × 0.88
```
Zieht die Wahrscheinlichkeiten 12 % Richtung Gleichverteilung (1/3 je
Ausgang) — eine konservative Grundannahme, bis genug echte Kalibrierdaten da
sind.

---

## 14. Einheitliches Modell — keine Parallelwelten

**Zentrale Lektion aus der WM-2026-Entwicklung:** Ein früherer Versuch, die
Turniersimulation zusätzlich mit einer Elo-Rating-Beimischung zu verbessern
(`λ_final = 0.6 × Poisson + 0.4 × Elo`), zeigte inkonsistente Ergebnisse: auf
34 Spielen verschlechterte jede Elo-Gewichtung > 0 den Log-Loss messbar. Bei
mehr Daten (51 Spiele) drehte sich der Befund kurzzeitig um, kippte aber beim
kompletten Turnier (53 Spiele) wieder. Interpretation: Die Information, die
in Elo-Ratings steckt, ist bereits über die Marktquoten ins Modell
eingespeist — eine zusätzliche Beimischung dupliziert ein vorhandenes Signal
und fügt nur Rauschen und einen weiteren zu kalibrierenden Freiheitsgrad
hinzu, ohne echten Mehrwert.

**Konsequenz:** Es gibt genau eine Rechenkette für die ganze App. Die
Spieltag-Prognose und die Monte-Carlo-Saisonsimulation ziehen ihre
Wahrscheinlichkeiten aus **derselben** Berechnung: dieselbe
Kaltstart-geglättete Statistik, dieselben Marktquoten für real angesetzte
Partien, dieselbe Kalibrierung. Kein zweites, paralleles Modell für die
Simulation mit eigenen (möglicherweise unvalidierten) Annahmen.

Praktischer Fallstrick, der genau daraus entstand (siehe Abschnitt 12.1):
Bei einer Migration ist die Saisonsimulation versehentlich zu einer eigenen,
zweiten Berechnung geworden (kein Markt, keine Kalibrierung) — genau das
Muster, das die Elo-Lektion verbieten sollte. Der Fix bündelt die gesamte
Aufbereitung (Statistik + Markt + Kalibrierung) an einer einzigen Stelle, die
von allen Verbrauchern geteilt wird.

**Regel für zukünftige Erweiterungen:** Jede neue Signalquelle (Elo, xG von
Drittanbietern, Wetter, Verletzungsdaten, …) muss erst **empirisch am
Lernprotokoll nachgewiesen** werden (Log-Loss-Verbesserung über eine
ausreichende Stichprobe), bevor sie ins Modell aufgenommen wird — nicht aus
Plausibilität heraus eingebaut werden.

---

## 15. Saisonsimulation: Monte Carlo

Für Meisterschafts-/Europapokal-/Abstiegs-Wahrscheinlichkeiten wird die
restliche Saison tausendfach durchgespielt (5000 Simulationen):

```
Für jede Simulation:
  Punktestand = aktueller Tabellenstand
  Für jedes noch offene Spiel (in Ansetzungsreihenfolge):
    Ziehe Zufallszahl r ∈ [0,1)
    r < pH  -> Heimsieg (3 Punkte Heim, Tordifferenz +1/-1)
    r < pH+pD -> Remis (1 Punkt beide)
    sonst -> Auswärtssieg (3 Punkte Auswärts, Tordifferenz -1/+1)
  Finale Tabelle sortieren (Punkte, dann Tordifferenz)
  Platzierung jedes Teams in dieser Simulation festhalten
Über alle 5000 Läufe:
  Meisterschaftswahrscheinlichkeit = Anteil Simulationen mit Platz 1
  Champions-League-Wahrscheinlichkeit = Anteil Simulationen mit Platz ≤ 4
  Abstiegswahrscheinlichkeit = Anteil Simulationen mit Platz ≥ 17
```

Die `pH/pD/pA` je offenem Spiel kommen aus derselben Rechenkette wie die
Spieltag-Prognose (Abschnitt 14) — nicht aus einem vereinfachten
Extra-Modell. Bereits gespielte Partien werden nicht simuliert, nur addiert
(sonst Doppelzählung).

Tordifferenz wird nur als vereinfachtes ±1 pro Spiel geführt (nicht die
tatsächliche erwartete Tordifferenz aus Lambda) — eine bewusste Vereinfachung
für die Tabellenplatz-Simulation, ausreichend für Platzierungswahrscheinlich-
keiten, aber nicht für torbezogene Prognosen gedacht.

---

## 16. Datenschicht: Vereins-Identität ist der fragilste Teil

**Grundproblem:** Drei unabhängige Datenquellen (OpenLigaDB, The Odds API,
football-data.org) nennen denselben Verein unterschiedlich ("FC Bayern
München" vs. "Bayern Munich" vs. "FC Bayern Munich"). Das Modell braucht
einen stabilen internen Kurzcode (z.B. "FCB") als gemeinsamen Schlüssel.

**Drei getrennte Mapping-Tabellen**, die synchron gehalten werden müssen:
1. Quellname → Kurzcode (für OpenLigaDB- und football-data.org-Vereinsnamen)
2. Kurzcode → Anzeigename, Vereinsfarbe, volle Bezeichnung (für die UI)
3. Odds-API-Vereinsname → Kurzcode (englische/vereinfachte Schreibweise,
   eigene Tabelle, weil die Odds-API andere Namenskonventionen nutzt als
   OpenLigaDB)

**Der wichtigste, am leichtesten übersehene Fallstrick des gesamten
Modells:** Diese drei Tabellen sind **statisch für einen bestimmten
Kader** (18 Vereine einer Saison). Nach Auf-/Abstieg muss **jede der drei**
Tabellen aktualisiert werden. Fehlt ein Verein in einer Tabelle, gibt die
Namens-Auflösung `null` zurück — und das Spiel verschwindet **kommentarlos**
aus der Anzeige (wird herausgefiltert, keine Fehlermeldung, kein Platzhalter).
Ein Spieltag zeigt dann z.B. 7 statt 9 Partien, ohne dass irgendwo ein
Hinweis erscheint. Diese Klasse von Fehler ist besonders gefährlich, weil sie
sich nicht durch Testen mit vorhandenen Daten zeigt — sie tritt exakt dann
auf, wenn sich der reale Kader ändert (jede neue Saison mit Auf-/Absteigern).

**Gegenmaßnahme, die sich bewährt hat:** Die Namens-Auflösungsfunktion sollte
bei jedem unbekannten Vereinsnamen einmalig protokollieren/warnen (nicht bei
jedem Aufruf, sonst Log-Spam) und die Liste unbekannter Namen für eine
Diagnoseanzeige verfügbar machen. Ohne diesen Mechanismus bleibt der Fehler
für Nutzer und Entwickler gleichermaßen unsichtbar.

**Weitere Lektion aus einem konkreten Vorfall (EFL-Cup-Bug, WM-Migration):**
Beim Auflösen des richtigen Wett-Markts über eine externe Sport-API (die
mehrere Ligen/Wettbewerbe gleichzeitig listet) niemals mit Fuzzy-/
Substring-Matching nach dem Ligennamen suchen. Ein Substring-Match kann einen
falschen, aber ähnlich benannten Wettbewerb treffen (z.B. einen Pokal- statt
Liga-Markt). Immer den exakten, von der API dokumentierten Schlüssel fest
verdrahten (z.B. `soccer_germany_bundesliga`), keine Ähnlichkeitssuche.

**Fallback-Strategie:** Primärquelle (OpenLigaDB) zuerst versuchen; liefert
sie nichts Brauchbares (Ausfall oder leere Antwort vor Saisonstart), auf eine
zweite Quelle (football-data.org) für dieselbe Liga ausweichen. Beide Quellen
müssen auf dasselbe interne Datenschema abgebildet werden, damit die gesamte
nachgelagerte Logik (Statistikaufbau, Formkurve, Spieltags-Gruppierung)
unverändert bleibt, unabhängig davon, welche Quelle tatsächlich geantwortet
hat.

---

## 17. Marktquoten: Freeze zum Anpfiff

Marktquoten bewegen sich bis kurz vor Spielbeginn und danach weiter
(In-Play-Wetten). Für eine faire Vorher-Prognose muss die Quote, die die App
anzeigt und ins Lernprotokoll schreibt, **die letzte bekannte Quote vor
Anpfiff** sein — nicht eine, die zufällig beim nächsten App-Aufruf während
oder nach dem Spiel abgerufen wird (das wäre Look-ahead-Bias: die Quote
kennt dann bereits den Spielverlauf).

**Mechanismus:** Sobald der Anpfiffzeitpunkt eines Spiels in der
Vergangenheit liegt, wird nicht mehr die live abgerufene Quote verwendet,
sondern die letzte im Lernprotokoll gespeicherte Quote vor diesem Zeitpunkt
("eingefroren"). Ohne einen solchen Freeze-Mechanismus würde eine
6-Stunden-Cache-TTL für Live-Quoten gelegentlich eine In-Play-Quote
einfangen, die dann fälschlich als Vorher-Prognose in Anzeige und
Lernprotokoll landet.

---

## 18. Lernprotokoll: die Datengrundlage für alles Weitere

Ein passives Protokoll, das bei jedem Laden für jedes Spiel mit
Marktquote einen Snapshot schreibt: Zeitstempel, reines Modell-Lambda,
finales (marktgeblendetes) Lambda, Marktquote (alle drei Ausgänge). Nach
Spielende wird das tatsächliche Ergebnis nachgetragen.

**Zweck:** Ohne dieses Protokoll lässt sich keiner der oben unkalibrierten
Parameter (MARKET_BLEND, DISSENS_DRAW_BOOST_MAX, Aufsteiger-Malus) jemals
mit echten Daten validieren. Es ist die einzige Quelle für "was hat das
Modell vorher gesagt, was ist tatsächlich passiert" — ohne die man nur raten
kann.

**Deduplizierung:** Ein neuer Snapshot wird nur geschrieben, wenn sich die
Quote seit dem letzten Snapshot tatsächlich geändert hat — sonst würde jeder
App-Aufruf unnötig Einträge anhäufen, ohne neue Information.

**Auswertung (Alpha-Sweep + Dissens-Analyse):**
- Für ein exportiertes Protokoll: pro Spiel den letzten *sauberen*
  Snapshot vor Anpfiff nehmen (Schutz gegen Look-ahead-Bias, siehe unten).
- Das reine Markt-Lambda lässt sich aus dem geloggten Blend zurückrechnen,
  weil der Blend eine bekannte lineare Mischung ist:
  ```
  blend = modell × (1-α) + markt × α
  ⟹ markt = modell + (blend - modell) / α
  ```
  **Kritisch:** α in dieser Rückrechnung muss exakt dem α entsprechen, mit
  dem der Log geschrieben wurde (aktuell 0.4). Ändert man MARKET_BLEND im
  Modell, ist jeder davor geloggte Log-Eintrag mit dem alten α kodiert —
  eine Analyse mit dem neuen α auf altem Log-Material wäre falsch.
- Für jedes Kandidaten-α zwischen 0 und 1 wird das Lambda neu gemischt, in
  1X2-Wahrscheinlichkeiten umgerechnet und gegen das tatsächliche Ergebnis
  bewertet (Log-Loss, Brier-Score, Trefferquote). Das α mit dem niedrigsten
  Log-Loss ist der empirische Kandidat für ein Update.
- **Vorsicht bei kleiner Stichprobe:** Das Log-Loss-Tal um das Optimum ist
  erfahrungsgemäß flach — der Unterschied zwischen α=0.3 und α=0.5 ist bei
  unter ca. 90 Spielen meist nur Rauschen, kein belastbares Signal.
- **Live-Quoten-Filter:** Ein Snapshot, dessen Quote gegenüber dem
  vorherigen in einer Kategorie um mehr als 12 Prozentpunkte springt, wird
  als vermutlich In-Play-kontaminiert verworfen (typisches Muster: eine
  Quote, die kurz vor oder während des Spiels durchrutscht, bevor der
  Freeze-Mechanismus greift). Es wird der letzte Snapshot *davor* verwendet.

**Dissens-Analyse:** Für jedes Spiel mit Marktquote wird geprüft, ob die aus
dem reinen Modell-Lambda abgeleitete Sieger-Seite von der aus der Marktquote
abgeleiteten Sieger-Seite abweicht. Über alle Dissens-Fälle wird die
Remis-Quote berechnet und mit der Remis-Quote bei Einigkeit verglichen — das
ist die empirische Prüfung der Hypothese aus Abschnitt 7.

---

## 19. Wett-Radar: Erkenntnis-Werkzeug, keine Wettempfehlung

**Explizite Haltung:** Dieses Feature identifiziert Wetten mit rechnerisch
positivem Erwartungswert, macht aber **keine** Aussage darüber, ob das
Modell tatsächlich einen nachhaltigen Vorteil gegenüber dem Markt hat. Ein
früherer In-Sample-Backtest (WM-Turnier) zeigte **keinen robusten Edge** —
das Radar ist bewusst so gebaut, dass ein Paper-Trading-Konto ehrlich zeigt,
ob das Modell dem Markt tatsächlich Geld abnehmen würde, statt die
EV-Berechnung unkommentiert als Erfolgsversprechen zu präsentieren.

**Erwartungswert:**
```
EV = Modellwahrscheinlichkeit × Dezimalquote - 1
Anzeige-Schwelle: EV > 0.05 (mindestens +5%)
```

**Wichtig:** EV-Berechnung braucht die **tatsächliche, unentvigte
Buchmacherquote** (mit Marge/Overround), nicht die faire, um den Overround
bereinigte Wahrscheinlichkeit, die für die Modell-Blend-Berechnung genutzt
wird (Abschnitt 6). Beides muss getrennt vorgehalten werden — würde man die
bereinigte "faire" Quote für die EV-Berechnung nutzen, würde der EV
systematisch zu positiv ausfallen (der Overround, den der Buchmacher als
Marge einbehält, würde verschwinden).

**Kelly-Kriterium für die Einsatzgröße:**
```
Kelly-Anteil = (Modellwahrscheinlichkeit × Quote - 1) / (Quote - 1)
Genutzt: Viertel-Kelly (× 0.25) -- konservativer als volles Kelly
Deckel: nie mehr als 10% der Bankroll auf eine einzelne Wette
```

Viertel-Kelly statt volles Kelly ist eine bewusste Risikoreduktion — volles
Kelly maximiert langfristiges Wachstum, hat aber hohe Varianz und reagiert
empfindlich auf Modellfehler (die es ja unweigerlich gibt).

**Paper-Trading-Konto:** Protokolliert jede Empfehlung einmalig (ein Eintrag
pro Spiel+Seite, erste Quote zählt) und rechnet automatisch ab, sobald das
Ergebnis feststeht. Zeigt ROI über alle abgerechneten Wetten — die einzige
ehrliche Antwort auf "funktioniert das wirklich".

---

## 20. Bewusst NICHT ins Modell aufgenommen (und warum)

- **Elo-Rating-Beimischung als Parallelsignal.** Siehe Abschnitt 14 — nicht
  robust nachweisbar, dupliziert vermutlich Marktinformation.
- **Neutral-Ground-Mittelung der Lambdas.** Nur für Turniere auf neutralem
  Boden sinnvoll (WM), für eine Liga mit echtem Heimvorteil falsch.
- **Fuzzy-Matching für externe API-Wettbewerbs-Schlüssel.** Siehe
  Abschnitt 16 (EFL-Cup-Lektion) — immer exakte Schlüssel, nie
  Ähnlichkeitssuche über mehrdeutige Wettbewerbsnamen.
- **Volles Kelly-Kriterium** für Einsatzgrößen — zu hohe Varianz gegenüber
  Modellunsicherheit, siehe Abschnitt 19.
- **Torbezogene Tordifferenz-Simulation** in der Saisonsimulation — bewusst
  auf ±1 pro Spielausgang vereinfacht, weil nur Platzierungswahrscheinlich-
  keiten gebraucht werden, nicht Tordifferenz-Prognosen.

---

## 21. Offene, unkalibrierte Parameter — Stand der Dinge

Diese Werte sind **plausible Startwerte**, keine aus BL-eigenen Daten
hergeleiteten Konstanten. Wer das Modell woanders neu aufbaut, sollte sie
genauso übernehmen (bessere Startpunkte gibt es nicht ohne neue Daten), aber
wissen, dass sie bei ausreichender Datenlage nachjustiert werden sollten:

| Parameter | Wert | Herkunft | Validierungsweg |
|---|---|---|---|
| `MARKET_BLEND` (α) | 0.4 | WM-2026, flaches Tal 0.2–0.5 | Alpha-Sweep auf Lernprotokoll nach ~5+ Spieltagen |
| `DISSENS_DRAW_BOOST_MAX` | 0.08 | WM-2026, 9 Fälle, 44% vs. 14% | Dissens-Analyse auf Lernprotokoll, braucht mehr Fälle als die WM bot |
| `PROMOTED_GF_MALUS` | 0.85 | Heuristik | Historischer Vergleich Aufsteiger vs. Liga-Ø über mehrere Saisons |
| `PROMOTED_GA_MALUS` | 1.15 | Heuristik | Dito |
| `DC_RHO` | -0.13 | Literaturüblicher Fußball-Wert | Eigene MLE-Schätzung auf mehreren BL-Saisons möglich, aber niedrige Priorität (Wert ist robust in der Literatur) |
| `LG_DEF_H` / `LG_DEF_A` | 1.21 / 1.58 | Frühere BL-Saison-Durchschnitte | Sollten jede Saison neu aus den 18 Team-Durchschnitten berechnet werden |
| Kaltstart-Übergang `n/(n+6)` | fix | Plausible Glättungskonstante | Könnte empirisch optimiert werden (wie schnell verliert der Vorsaison-Prior an Aussagekraft) |

Alle sind über das Lernprotokoll (Abschnitt 18) grundsätzlich validierbar,
sobald genug echte BL-Spiele mit Marktquoten vorliegen.

---

## 22. Zwei reale Modellfehler, aus denen sich lernen lässt

Diese beiden sind keine abstrakten Warnungen, sondern tatsächlich passierte,
gefundene und behobene Fehler in genau diesem Modell — aufschlussreich für
jede Neuimplementierung, weil beide aus scheinbar harmlosen Refactorings
entstanden:

1. **Der Guard verschwand beim Feature-Hinzufügen.** Beim Einbau des
   Dissens-Signals (Abschnitt 7) wurde die Bedingung "struktureller Boost nur
   ohne Markt" (Abschnitt 5) versehentlich mit entfernt — beide Boosts
   landeten im selben Codepfad, und die ursprüngliche Absicherung ging beim
   Umbau unter. Ergebnis: bei jedem Spiel mit Quote und knapper λ-Differenz
   lag die angezeigte Remis-Wahrscheinlichkeit systematisch ~14 Prozentpunkte
   über der Marktquote. **Lektion:** Wenn zwei Anpassungen an derselben Größe
   (hier: pD) unabhängige Gültigkeitsbedingungen haben, müssen diese
   Bedingungen bei jeder Änderung explizit gegeneinander geprüft werden, nicht
   nur "beide Boosts wirken jetzt".

2. **Die Prior-Bedingung schloss genau den Fall aus, für den sie gedacht
   war.** Der Aufsteiger-Prior (Abschnitt 12) wurde über "wer hat schon
   Live-Daten oder Vorsaison-Daten" definiert — ein Aufsteiger an Spieltag 1
   hat weder das eine noch das andere. **Lektion:** Bei einem
   Fallback-/Prior-Mechanismus für einen Grenzfall immer explizit den
   Extremfall durchdenken (hier: 0 Live-Spiele, kein Vorsaison-Eintrag) und
   testen, statt sich auf "die Vereinigung der beiden Normalfälle" zu
   verlassen.

Beide wurden durch gezielte Regressionstests abgesichert (numerische
Gegenprobe: konkretes Beispiel mit erwartetem Wertebereich, nicht nur
"Funktion wirft nicht").

---

## 23. Kurzreferenz aller Konstanten

```
DC_RHO                 = -0.13   Dixon-Coles-Korrekturfaktor
FORM_WEIGHT             = 0.40   Formkurve-Anteil am effektiven Torwert
DRAW_THRESHOLD          = 0.20   Mindest-pD für Remis-Tipp (Standardfall)
DRAW_THRESHOLD_TIGHT    = 0.17   Mindest-pD, wenn lambdaDiff < 0.25
FAV_MIN_GOALS_LAMBDA    = 2.0    ab diesem Lambda muss der Favorit-Score ≥2 Tore zeigen
MONO_MAX                = 2      max. gleicher Score-Tipp pro Spieltag
LG_DEF_H                = 1.21   Liga-Ø Heim-Gegentore (Normalisierung)
LG_DEF_A                = 1.58   Liga-Ø Auswärts-Gegentore (Normalisierung)
DRAW_BOOST_MAX          = 0.15   max. struktureller Remis-Aufschlag
DRAW_BOOST_RANGE        = 0.40   λ-Differenz-Fenster für den Aufschlag
MARKET_BLEND (α)        = 0.4    Marktanteil am finalen Lambda (60% Modell / 40% Markt)
DISSENS_DRAW_BOOST_MAX  = 0.08   zusätzlicher Remis-Aufschlag bei Modell-Markt-Dissens
PROMOTED_GF_MALUS       = 0.85   Angriffs-Malus für Aufsteiger ohne Vorsaisondaten
PROMOTED_GA_MALUS       = 1.15   Abwehr-Malus für Aufsteiger ohne Vorsaisondaten
Kaltstart-Gewicht        n/(n+6) Übergang Prior -> Live-Statistik
SHRINK                  = 0.88   Shrink-Faktor zur Gleichverteilung (Kalibrier-Fallback)
minSamples (Kalibrierung) = 45   Mindest-Stichprobe für Platt-Scaling
Lambda-Grenzen          = [0.3, 4.5]  Kappung in jeder Rechenstufe
KELLY_FRACTION          = 0.25   Viertel-Kelly für Wett-Radar-Einsatzgröße
MIN_EV                  = 0.05   Anzeige-Schwelle Wett-Radar (+5%)
Kelly-Deckel            = 0.10   max. Bankroll-Anteil pro Einzelwette
Live-Quoten-Sprung-Filter = 12 Prozentpunkte  (Lernprotokoll-Analyse)
Simulationen (Saison)   = 5000
Formkurve-Fenster       = letzte 5 Spiele, DECAY = 0.72
```

---

## 24. Wenn du das woanders neu baust

Reihenfolge, in der dieses Wissen wieder in Code übersetzt werden sollte:

1. Poisson + Dixon-Coles-Grundfunktion (Abschnitt 4) — testbar isoliert, keine
   Abhängigkeiten.
2. Team-Statistik-Aufbau mit echtem Heim-/Auswärtssplit (Abschnitt 2) plus
   Formkurve (Abschnitt 3).
3. Strukturellen Draw-Boost (Abschnitt 5) — mit dem `!Markt`-Guard von Anfang
   an als Teil der Signatur, nicht als nachträglich zu erinnernde Bedingung.
4. Markt-Newton-Raphson + Blend (Abschnitt 6), Dissens-Erkennung (Abschnitt 7)
   — beide Boost-Quellen (5 und 7) am besten als eine einzige Funktion mit
   zwei Parametern (`structural: bool`, `extraBoost: number`) modellieren,
   damit die gegenseitige Exklusivität strukturell erzwungen ist statt durch
   Disziplin.
5. Kaltstart-Prior (Abschnitt 12) — den Extremfall "Aufsteiger, 0 Live-Spiele"
   zuerst als Test schreiben, dann implementieren.
6. Kalibrierung (Abschnitt 13), danach Remis-Schwelle (9), natürlicher
   Score-Tipp (10), Monokultur-Schutz (11) — in dieser Reihenfolge, weil jede
   Stufe auf der vorherigen aufbaut.
7. Eine einzige geteilte Rechenkette (Abschnitt 14) für alles, was
   Wahrscheinlichkeiten braucht — Spieltag-Anzeige, Saisonsimulation,
   zukünftige Features. Nie eine zweite Berechnung "nur für einen Screen"
   einführen.
8. Vereins-Namensauflösung mit eingebauter Diagnose für unbekannte Namen
   (Abschnitt 16) von Anfang an, nicht nachträglich.
9. Lernprotokoll (Abschnitt 18) so früh wie möglich scharfschalten — jeder
   Tag ohne Protokoll ist verlorene Kalibrierdaten, die sich nicht
   nachträglich beschaffen lassen.
