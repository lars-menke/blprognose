# BLForecast: Modellreview und vollständige Funktionsbeschreibung

**Stand:** 07.09.2026  
**Veröffentlichte App:** Version 34  
**Modell:** 4.1.1  
**Geprüfter Quellstand:** `efeb4b398f2ce061744cfbaf3e82c00236a2851e`  
**App:** https://blforecast-pwa.larsc.chatgpt.site  
**Zweck:** Technische und statistische Bestandsaufnahme zur weiteren Auswertung und Entwicklung.

Dieses Dokument beschreibt den tatsächlich vorhandenen Code. Es trennt implementiertes Verhalten, beobachtete Prüfergebnisse, konzeptionelle Grenzen und Empfehlungen. Während dieses Reviews wurden weder das Modell noch die veröffentlichte App verändert.

## 1. Ergebnis der Bewertung

BLForecast besitzt einen funktionsfähigen, zeitgewichteten und gegnerbereinigten Prognosekern. Die zentrale Wahrscheinlichkeitsmatrix, der logarithmische Markt-Blend und die Absicherung gespeicherter Vorabprognosen sind nachvollziehbar implementiert. Das Modell ist jedoch noch kein vollständig validiertes, selbstoptimierendes Prognosesystem.

Die wichtigsten Ergebnisse:

1. **Die Wahrscheinlichkeitsprognosen enthalten gegenüber einer einfachen Liga-Poisson-Basis zusätzliche Information.** Im erneut ausgeführten Rücktest über 918 Spiele liegt der 1X2-Log-Loss bei 0,99025 statt 1,08286. Niedriger ist besser.
2. **Die aktuelle Ergebnisauswahl maximiert nicht die Wahrscheinlichkeit eines exakten Treffers.** Sie priorisiert zunächst den wahrscheinlichsten Spielausgang und wählt erst darin einen Score. Im selben Rücktest trifft sie 76 von 918 Ergebnissen exakt. Der globale Modus derselben Modellmatrix trifft 100. Das ist ein Zielkonflikt in der Entscheidungsschicht, kein Beleg für eine fehlerhaft summierte Matrix.
3. **Die App wertet Prognosen aus, optimiert ihre übergeordneten Parameter aber nicht automatisch.** Neue Ergebnisse beeinflussen beim nächsten Rechenlauf die Teamstärken. Marktgewicht, Temperature Scaling und weitere Freigabeparameter bleiben fest.
4. **Einzelspiel, Spielprofil und Saisonsimulation verwenden noch nicht überall dieselbe finale Verteilung.** Insbesondere „Beide treffen“ und „Über 2,5 Tore“ werden separat aus den Basis-Lambdas berechnet; die Saisonsimulation enthält keinen Markt-Blend.
5. **Es bestehen reproduzierbare Randfallfehler außerhalb des zentralen Fits.** Unvollständige Torlisten können ein korrekt gemeldetes Endergebnis übersteuern. Die Lernübersicht kann Spieltage verschiedener Saisons vermischen. Abweichende Anstoßzeiten zwischen Datenquellen können die Abgrenzung von Vorabquoten unterlaufen.

**Gesamturteil:** Brauchbare statistische Grundlage mit reparierter Stabilitätsprüfung und deutlich besserer Prognosespeicherung. Weitere Arbeit ist vor allem an Konsistenz, Nachweisführung und Datenbetrieb erforderlich. Eine pauschale Bewertung von 9,5/10 wäre durch die vorhandene Evidenz nicht gerechtfertigt.

## 2. Prüfgrundlage und Grenzen

Geprüft wurden:

- Modellcode, Marktanbindung, Datenaufbereitung und Freigabeparameter;
- Prognose-API, Datenbankspeicherung, Auswertung und relevante Anzeigeformeln;
- Live-Datenpfad und Saisonsimulation;
- die ursprüngliche Datei `modelknowledge-v2.1.md`, Stand v2.1.0, 903 Zeilen;
- 25 vorhandene automatisierte Tests und die vollständige TypeScript-Prüfung;
- ein erneut ausgeführter Rücktest über 2023/24, 2024/25 und 2025/26;
- zusätzliche lokale Grenzfallproben;
- die produktive Datenbank ausschließlich lesend.

Der Quellstand entspricht der zuvor veröffentlichten Version 34. Der erfolgreiche vollständige App-Build und die Veröffentlichung wurden bereits im vorausgehenden Umsetzungsschritt bestätigt. Dieses Review enthält keine erneute Veröffentlichung und keinen visuellen Browser- oder Gerätetest.

Produktiv wurden neun gespeicherte Prognosen für Spieltag 3 mit Modellversion 4.1.1 gefunden. Ihre Speicherung lag vor dem jeweiligen Anstoß; tatsächliche Ergebnisse waren erwartungsgemäß noch leer. Die großen JSON-Payloads wurden vom Datenbankwerkzeug gekürzt. Ihre vollständigen Matrizen konnten daher nicht über diesen Leseweg einzeln validiert werden. Eine Stichprobe der älteren Tabelle enthält bereits ausgewertete Prognosen von Modell 4.0.0. Daraus folgt keine vollständige Bestandszählung aller historischen Prognosen.

Die ursprüngliche Wissensdatei ist bereits eine BLForecast-Spezifikation. Sie ist kein Beleg dafür, wie zuverlässig die frühere WM-App tatsächlich war. Ein reproduzierter WMForecast-Backtest oder deren vollständiger Quellstand war nicht Teil dieser Prüfung.

## 3. Architektur und Aufgaben der Komponenten

| Komponente | Tatsächliche Aufgabe |
|---|---|
| `lib/forecast/openliga.ts` | Saisonspiele abrufen, vereinheitlichen, nach Spiel-ID deduplizieren |
| `lib/forecast/model.ts` | Teamstärken schätzen, Matrizen erzeugen, Ergebnis auswählen, Saison simulieren |
| `lib/forecast/odds.ts` | Aktuelle 1X2-Quoten zuordnen, Marge entfernen, Buchmacher mitteln |
| `lib/forecast/learning.ts` | Feste Kalibrierparameter bereitstellen und abgeschlossene Prognosen bewerten |
| `lib/forecast/publication.ts` | Datenbankseitige Schreibsperre, Serialisierung, Überführung in Auswertungsobjekte |
| `lib/forecast/published-store.ts` | Vorabprognosen speichern und anschließend denselben Stand lesen |
| `lib/forecast/store.ts` | Endergebnisse abgleichen und neue sowie alte Prognosetabellen zusammenführen |
| `app/api/forecast/route.ts` | Daten laden, offene Prognosen berechnen, gespeicherte ausliefern, Saison simulieren |
| `app/api/learning/route.ts` | Gespeicherte Prognosen mit abgeschlossenen Spielen abgleichen |
| `lib/live/openliga-live.ts` | Live-Status, Spielstand und Tore aufbereiten |
| `app/forecast-app.tsx` | Ansichten, Aktualisierung und zusätzliche Spielprofilformeln |
| `scripts/backtest-model.ts` | Historischer Rücktest gegen einfache Baselines |
| `scripts/compare-convergence.ts` | Gepaarter Vergleich mit dem Quellstand vor der Konvergenzkorrektur |

Ein konkreter Ergebnistipp wird analytisch aus einer Wahrscheinlichkeitsmatrix abgeleitet. Die Monte-Carlo-Saisonsimulation ist eine nachgelagerte Anwendung. Sie erzeugt nicht den einzelnen Matchtipp und trainiert das Modell nicht zusätzlich.

## 4. Eingabedaten und zeitlicher Bezug

### 4.1 Ergebnisdaten

Die Prognose-API lädt parallel:

- den aktuellen Bundesliga-Spielplan;
- zwei abgeschlossene Bundesliga-Vorsaisons;
- drei Zweitliga-Vorsaisons für Aufsteiger und Übersetzungsfaktoren.

Die Saisonzuordnung wechselt am 1. Juli. Ergebnisdaten stammen aus OpenLigaDB. Verwendet werden Spiel-ID, Anstoßzeit, Spieltag, Vereins-IDs, Namen, Logos, Abschlussstatus und Tore.

Bei den Resultaten wird `resultTypeID === 2` bevorzugt. Fehlt dieser Eintrag, wird der Resultateintrag mit der höchsten `resultOrderID` verwendet. Für das Training werden nur abgeschlossene Spiele mit nichtleeren Torzahlen und einem Anstoß vor dem Rechenstichtag berücksichtigt.

Nicht Teil des Prognosekerns sind derzeit:

- gemessene Schuss-xG oder Schussqualität;
- Aufstellungen, Verletzungen und Sperren;
- Transfers oder einzelne Spielerbewertungen;
- Ruhezeiten, Reisebelastung und Wetter;
- Elo als zusätzliche Modellkomponente;
- Karten oder der aktuelle Spielstand einer laufenden Partie.

Diese Informationen können teilweise indirekt in Buchmacherquoten stecken. Sie werden dadurch aber nicht als eigene, überprüfbare Modellmerkmale erfasst.

### 4.2 Prüfungen und Grenzen

Der aktuelle Spielplan muss 18 Vereine und neun Spiele je enthaltenem Spieltag aufweisen. Spiel-IDs werden beim Laden dedupliziert. Unvollständige oder unplausible Spielpläne führen zu einer Nichtverfügbarkeitsmeldung.

Es gibt keine vollständige Prüfung aller historischen Torwerte auf Ganzzahligkeit, Nichtnegativität und endliche Werte. Die Dublettenprüfung in der Route sieht bereits deduplizierte Daten und kann widersprüchliche Rohdatensätze deshalb nicht mehr feststellen. Es wird auch nicht ausdrücklich verlangt, dass genau 34 vollständige Spieltage vorliegen.

Der zeitliche Trainingsfilter verwendet den Anstoß und den heute bekannten Abschlussstatus. Er speichert nicht den tatsächlichen Zeitpunkt, an dem ein historisches Ergebnis erstmals verfügbar war. Für einen streng historischen Replay ist ein gesonderter Datenstand nötig.

## 5. Schätzung der Teamstärken

### 5.1 Parameter und Torerwartung

Jeder Verein erhält eine Angriffsstärke `a_i` und eine Abwehranfälligkeit `d_i`. Positive Abwehranfälligkeit bedeutet eine schwächere Abwehr. Zusätzlich werden ein ligaweites Torniveau `mu` und ein globaler Heimvorteil `h` geschätzt.

Für Heimverein H und Auswärtsverein A:

```text
lambda_H = exp(mu + h + a_H + d_A)
lambda_A = exp(mu     + a_A + d_H)
```

Beide Lambdas werden auf 0,30 bis 4,50 begrenzt. Die Begrenzung wird für die spätere Prognose ausgewiesen. Auch während des Fits arbeitet der Code mit begrenzten Torintensitäten; außerhalb der Grenze wird der zugehörige Daten-Gradient null. Das ist eine numerische Schutzmaßnahme mit möglichem Einfluss auf extreme Partien, kein Ersatz für eine robuste statistische Behandlung von Ausreißern.

### 5.2 Aktualität

Ein Spiel mit Alter `t` Tagen erhält das Gewicht:

```text
w(t) = exp(-ln(2) * t / 210)
```

Nach 210 Tagen zählt es halb so stark, nach 420 Tagen ein Viertel so stark. Die letzten fünf Partien werden lediglich als Formreihe angezeigt; sie erhalten keine zweite pauschale Beimischung. Damit werden jüngere Ergebnisse nicht durch einen zusätzlichen Form-Blend doppelt gezählt.

### 5.3 Regularisierung und Saisonübergang

Der Fit maximiert eine zeitgewichtete Poisson-/Dixon-Coles-Log-Likelihood mit quadratischen Straftermen. Angriffs- und Abwehrwerte werden nach jedem Update auf Mittelwert null zentriert; die entfernten Mittelwerte werden dem Intercept zugeschlagen.

Zunächst wird ein historisches Modell berechnet. Bei bestehenden Bundesligisten gehen 95 Prozent seiner Parameter als **Startwerte** in den abschließenden gemeinsamen Fit ein. Ihre Regularisierung bleibt auf null zentriert. Die Vorsaisonwerte sind hier also kein zusätzlicher statistischer Prior auf denselben bereits erneut verwendeten Spielen. Das vermeidet eine Doppelverwendung, weicht aber von der wörtlichen Priorbeschreibung der ursprünglichen MD-Datei und manchen UI-Texten ab.

Der abschließende Fit enthält die Bundesliga-Vorsaisons und bereits abgeschlossene aktuelle Spiele gemeinsam. Auch abgestiegene Teams bleiben im historischen Vereinsuniversum erhalten. Es gibt keinen gesonderten Parameter für Kaderwechsel oder Saisonbrüche. Beim Wechsel des geladenen Saisonfensters können ältere Daten auf einmal entfallen.

### 5.4 Aufsteiger

Als Aufsteiger gilt ein aktueller Verein, der im unmittelbar vorherigen Bundesliga-Saisonbestand nicht vorkam.

Wenn Zweitligadaten vorliegen:

```text
prior_attack  = 0.60 * attack_BL2  + ln(attackFactor)
prior_defense = 0.60 * defense_BL2 + ln(defenseFactor)
```

Die Übersetzung wird aus früheren Aufsteigerbeobachtungen abgeleitet. Ein Verein muss in beiden verglichenen Saisons mindestens 20 Spiele aufweisen. Ab vier Beobachtungen werden gewichtete Differenzen der geglätteten Torquoten verwendet. Der Code begrenzt den Angriffsfaktor auf 0,72 bis 0,96 und den Abwehrfaktor auf 1,04 bis 1,35.

Bei zu wenigen Beobachtungen gelten 0,85 für den Angriff und 1,15 für die Abwehranfälligkeit. Fehlt auch ein passendes Zweitligarating, gilt der direkte Log-Prior `attack = -0.27`, `defense = 0.17`. Dieser entspricht etwa den Faktoren 0,76 und 1,19 und ist nicht identisch mit dem Übersetzungsfallback 0,85/1,15.

Die Übersetzung ist eine kleine, begrenzte historische Schätzung, kein eigenständiges umfangreich trainiertes Aufsteigermodell. Die angezeigte Cold-Start-Markierung hängt an der Aufsteigerzuordnung und verschwindet nicht automatisch nach einer bestimmten Anzahl aktueller Spiele.

### 5.5 Optimierung und Konvergenz

Verwendet wird Adam mit Lernrate 0,045, `beta1 = 0.9`, `beta2 = 0.999`, maximal 850 Schritten. Seit 4.1.1 wird nach der Normalisierung geprüft:

- maximale endgültige Parameteränderung kleiner als `2e-6`;
- relative Änderung der regularisierten Zielfunktion kleiner als `1e-9`;
- beide Bedingungen über 20 aufeinanderfolgende Schritte;
- Abbruch frühestens nach 120 Schritten.

Die Zielfunktion umfasst dieselben begrenzten Intensitäten, Zeitgewichte und Dixon-Coles-Terme wie der Fit, abzüglich der Regularisierung. Konstante Log-Fakultäten werden weggelassen. Das verändert das Optimierungsziel nicht.

Ohne Trainingsdaten wird keine Konvergenz behauptet. Ein Lauf am Iterationslimit erhält ebenfalls keine automatische Erfolgsmarkierung. Ein nicht konvergierter, aber numerisch endlicher Forecast kann derzeit trotzdem gespeichert und mit Warnung angezeigt werden.

**Grenze:** Stabilität von Parametern und Zielfunktion beweist kein globales Optimum. Es fehlen ein explizites Kriterium für den projizierten Gradienten, ein Vergleich mehrerer Startpunkte und die Gegenprüfung mit einem unabhängigen Optimierer. Die Konvergenz der vorbereitenden historischen und Zweitligafits wird nicht separat im finalen Prognoseobjekt ausgewiesen.

## 6. Aktueller Parametersatz

| Parameter | Wert | Funktion |
|---|---:|---|
| `halfLifeDays` | 210 | Zeitgewichtung |
| `ridgeAttack` | 4 | Angriffsregularisierung |
| `ridgeDefense` | 4,5 | Abwehrregularisierung |
| `ridgeLeague` | 1,6 | Regularisierung von Torniveau und Heimvorteil |
| `ridgeRho` | 12 | Nur bei aktivierter Rho-Schätzung relevant |
| `rho` | -0,10 | Dixon-Coles-Korrektur |
| `estimateRho` | false | Rho bleibt im laufenden Betrieb fest |
| `priorReliability` | 0,95 | Vorsaisonrating als Startwert bestehender Vereine |
| `promotedReliability` | 0,60 | Abschwächung des Zweitligaratings |
| `promotedAttackFactor` | 0,85 | Übersetzungsfallback Angriff |
| `promotedDefenseFactor` | 1,15 | Übersetzungsfallback Abwehr |
| `lambdaMin`, `lambdaMax` | 0,30; 4,50 | Intensitätsgrenzen |
| `maxIterations` | 850 | Maximale Adam-Schritte |
| `convergenceTolerance` | 0,000002 | Endgültige Parameteränderung |
| Modelltemperatur | 1,10 | Abflachung der Modellwahrscheinlichkeiten |
| Markttemperatur | 1,00 | Aktuell keine Veränderung der fairen Marktverteilung |
| `marketAlpha` | 0,40 | Exponentengewicht des Marktanteils |
| Mindeststichprobe | 150 | Statuswechsel in der Auswertung, kein automatisches Neutraining |
| Saisonsimulation | 10.000 | Ziehungen je Rechenlauf |
| Tippspiel-Kandidaten | 0 bis 6 Tore je Seite | Suchraum der gesonderten Nutzenoptimierung |

Kommentare beschreiben Parameter als historisch freigegeben. Eine vollständig nachvollziehbare innere Suchschleife mit gespeichertem Auswahlprotokoll ist in der aktuellen Backtestdatei nicht enthalten. Parameterwerte dürfen deshalb nicht allein aufgrund dieser Kommentare als optimal gelten.

## 7. Tor- und Ergebnismatrix

Zunächst gilt je Seite die Poisson-Verteilung:

```text
P(G = g) = exp(-lambda) * lambda^g / g!
P_raw(i,j) = Poisson(i; lambda_H) * Poisson(j; lambda_A) * tau(i,j)
```

Dixon-Coles korrigiert ausschließlich vier niedrige Ergebnisse:

| Score | Faktor `tau` |
|---|---|
| 0:0 | `1 - lambda_H * lambda_A * rho` |
| 0:1 | `1 + lambda_H * rho` |
| 1:0 | `1 + lambda_A * rho` |
| 1:1 | `1 - rho` |
| alle übrigen | 1 |

Bei negativem Rho werden 0:0 und 1:1 erhöht, 0:1 und 1:0 vermindert. Es existiert kein zusätzlicher pauschaler Remis-Boost.

Die Matrix reicht mindestens bis zehn Tore je Seite. Die Obergrenze wird bis zu einer Poisson-Restmasse von höchstens `5e-9` je Seite erweitert, mit einer harten Schleifengrenze von 30. Negative Zellwerte werden auf null begrenzt, anschließend wird die gesamte Matrix normiert. Innerhalb der produktiven Lambda-Grenzen und mit Rho -0,10 sind die vier Korrekturfaktoren positiv.

Aus der Matrix entstehen die drei Ausgangswahrscheinlichkeiten:

```text
pH = Summe P(i,j) für i > j
pD = Summe P(i,j) für i = j
pA = Summe P(i,j) für i < j
```

Sie sind Summen vieler exakter Ergebnisse. Ein insgesamt wahrscheinlicherer Heimsieg schließt deshalb nicht aus, dass 1:1 die größte einzelne Zelle ist.

## 8. Marktanbindung und Kalibrierung

### 8.1 Quotenabruf

Verwendet wird The Odds API, Wettbewerb `soccer_germany_bundesliga`, Region `eu`, Markt `h2h`, Dezimalquoten. Der Schlüssel wird serverseitig aus `ODDS_API_KEY` gelesen und gehört nicht in diese Dokumentation.

Vereinsnamen werden über eine feste Aliasliste der aktuellen Vereine zugeordnet. Die passende Veranstaltung muss dieselben Heim-/Auswärtsnamen und eine Anstoßzeit innerhalb von zwei Stunden zur OpenLigaDB-Ansetzung aufweisen.

Je Buchmacher werden Heim-, Remis- und Auswärtsquote verlangt. Der Buchmacherzeitstempel muss vor dem OpenLigaDB-Anstoß und spätestens am Rechenstichtag liegen. Ohne verwendbare Quoten wird der reine Modellpfad genutzt.

### 8.2 Entfernung der Marge

```text
q_k = 1 / Dezimalquote_k
Overround = Summe(q_k) - 1
```

Ein Exponent `c` wird mit 80 Bisektionsschritten im Intervall 0,1 bis 10 gesucht, sodass `Summe(q_k^c) = 1`. Die Werte werden abschließend normiert. Danach werden die fairen 1X2-Wahrscheinlichkeiten aller berücksichtigten Buchmacher gleich gewichtet gemittelt.

Gespeichert werden die Rohquoten je Buchmacher, deren Zeitstempel, der mittlere Overround, die Anzahl der Buchmacher und die Methode `power`. Der angezeigte gemeinsame Aktualisierungszeitpunkt ist der neueste enthaltene Zeitstempel; er sagt nichts über das Alter der übrigen Anbieter aus.

### 8.3 Tatsächliche Reihenfolge

```text
p_model,k = norm(p_raw,k^(1 / 1.10))
p_market,k = norm(p_fair,k^(1 / 1.00))
p_final,k = norm(p_model,k^0.60 * p_market,k^0.40)
```

Ohne Markt gilt `p_final = p_model`. Das Verhältnis 60/40 ist ein Gewicht in einem logarithmischen Pool, kein arithmetischer Durchschnitt.

Die Spezifikation sieht eine pfadspezifische Kalibrierung nach dem Blend vor. Tatsächlich werden die Modell- und Marktverteilungen vor dem Blend temperiert. Eine gesondert geschätzte Temperatur für den bereits kombinierten Pfad fehlt. `marketValidated` bleibt false, sperrt die Verwendung des Marktes aber nicht.

### 8.4 Grenzen der Marktqualität

- Kein maximales Quotenalter und keine Mindestzahl von Buchmachern.
- Keine Gewichtung nach Aktualität oder Anbieterqualität.
- Kein expliziter Residualtest der Power-Lösung und kein gesonderter numerischer Fallback.
- Kein vollständiger Schutz gegen nichtendliche Preise; nur Typ und Untergrenze werden geprüft.
- Unbekannte Vereinszuordnung kann den gesamten Marktabruf dieses Aufrufs in den Fallback führen.
- Die Marktzeit wird gegen die OpenLigaDB-Ansetzung geprüft, nicht zusätzlich gegen den Beginn des zugeordneten Quotenereignisses.

Der letzte Punkt wurde lokal reproduziert: OpenLigaDB-Anstoß 13:00, Marktanstoß 11:00, Rechenzeit 12:00 und Quotenupdate 11:59 werden akzeptiert, obwohl das zugeordnete Marktspiel bereits begonnen hat. Voraussetzung ist eine tatsächliche Zeitabweichung zwischen den Quellen. Dies ist ein bedingter Fehlerfall, kein Nachweis, dass produktiv solche Quoten verwendet wurden.

## 9. Finale Matrix und drei unterschiedliche Ergebnisausgaben

Die finalen Ausgangsmassen werden auf die Rohmatrix zurückverteilt:

```text
P_final(i,j) = P_raw(i,j) * p_final,outcome(i,j) / p_raw,outcome(i,j)
```

Dadurch summieren sich ihre drei Blöcke genau zu den finalen 1X2-Werten. Innerhalb eines Blocks bleibt die Rangfolge der Scores erhalten. Reine 1X2-Quoten sagen beispielsweise nicht zusätzlich, ob innerhalb eines Heimsiegs 2:0 oder 3:1 wahrscheinlicher ist.

### 9.1 Angezeigte Primärprognose

```text
Ausgang = argmax(pH, pD, pA)
Score = argmax P_final(i,j) unter der Bedingung outcome(i,j) = Ausgang
```

Das Feld `score` enthält diesen bedingten Modus. `mostLikelyScore` enthält denselben Wert. Es handelt sich nicht zwingend um das insgesamt wahrscheinlichste exakte Resultat. `scoreChance` ist seine absolute Zellwahrscheinlichkeit in Prozent, nicht die innerhalb des gewählten Ausgangs auf 100 Prozent normierte Chance.

Bei exakt gleich großen 1X2-Werten bevorzugt die Indexreihenfolge Heim vor Remis vor Auswärts. Die drei `alternatives` kommen ebenfalls nur aus dem ausgewählten Ausgang. Eine wichtige 1:1-Alternative kann deshalb fehlen, obwohl sie global wahrscheinlicher ist als der veröffentlichte Tipp.

### 9.2 Globaler Matrixmodus

`globalMostLikelyScore` ist das größte Feld der finalen Matrix ohne Ausgangsbedingung. Bei einer Zielfunktion „ein Punkt ausschließlich für das exakt richtige Ergebnis“ wäre dies die mathematisch passende Auswahl innerhalb der geschätzten Verteilung.

Ein konkretes produktiv gespeichertes Beispiel dieses Reviews:

- Hoffenheim gegen Stuttgart: Heim 37,33 %, Remis 23,55 %, Auswärts 39,12 %.
- Primärprognose: 1:2 mit 7,20 % absoluter Chance.
- Globaler Matrixmodus: 1:1 mit 8,85 % absoluter Chance.

Das ist kein Rechenwiderspruch. Die App gewichtet bei der Auswahl des Scores die Übereinstimmung mit dem 1X2-Favoriten höher als die maximale exakte Trefferchance.

### 9.3 Tippspiel-Optimierung

`tipGameScore` maximiert separat den erwarteten Nutzen:

```text
4 Punkte: exaktes Ergebnis
3 Punkte: richtige Tordifferenz, aber nicht exakt
2 Punkte: richtiger Spielausgang, aber andere Differenz
0 Punkte: falscher Ausgang

E[Punkte | Tipp] = Summe P_final(Ergebnis) * Punkte(Tipp, Ergebnis)
```

Der Suchraum umfasst 0 bis 6 Tore je Seite; die tatsächlichen Ergebnisse werden über die ganze Matrix integriert. Diese Empfehlung überschreibt den Hauptscore nicht. Das Punktesystem ist fest im Code hinterlegt, nicht als frei konfigurierbare Regel verwaltet.

## 10. Spielprofil und Darstellung

Die Prozentbalken werden mit dem größten-Rest-Verfahren auf ganze Zahlen gerundet und ergeben zusammen 100. Entscheidungen verwenden die ungerundeten Wahrscheinlichkeiten.

Die ausgewiesenen „xG“ sind Modell-Torerwartungen aus historischen Torergebnissen, keine aus Schussdaten gemessenen Expected Goals. Nach Temperatur- und Marktanpassung müssen diese Basis-Lambdas außerdem nicht mehr den Erwartungswerten der finalen Matrix entsprechen.

Der Detailbildschirm berechnet:

```text
Beide treffen = (1 - exp(-lambda_H)) * (1 - exp(-lambda_A))
Über 2,5 = 1 - exp(-L) * (1 + L + L²/2), L = lambda_H + lambda_A
```

Diese Formeln verwenden unabhängige Poisson-Lambdas. Bei „Beide treffen“ fehlt bereits die Dixon-Coles-Korrektur; bei beiden Anzeigen fehlen die Auswirkungen der Kalibrierung und des Markt-Blends. Dixon-Coles allein verändert die Über-2,5-Masse in der ideal normierten Verteilung nicht, weil seine vier Änderungen ausschließlich Scores mit höchstens zwei Toren betreffen und sich dort aufheben. Die nachfolgenden Blockskalierungen können sie jedoch verändern.

Lokale Zahlenprobe bei Lambda 1,35 und 1,21: Die UI-Formel ergibt 51,99 % für beide treffen. Die Dixon-Coles-Matrix mit Rho -0,10 ergibt schon vor Kalibrierung 53,25 %.

Angriffs- und Abwehranzeigen auf einer Skala bis 100 sind Visualisierungen der Ratings: ungefähr `68 + 22 * Rating`, bei Abwehr mit umgekehrtem Vorzeichen, begrenzt auf 35 bis 96. Sie sind keine Erfolgswahrscheinlichkeiten. Auch die Sicherheitslabels beruhen auf Schwellen des höchsten 1X2-Werts, nicht auf einem statistischen Konfidenzintervall. Die Schwellen in Hauptkarte und Detailansicht sind nicht identisch.

## 11. Speicherung, Anstoßsperre und Abrufverhalten

### 11.1 Kanonische Vorabprognose

Neue Prognosen werden in `published_forecasts` gespeichert. Pro Spiel-ID gibt es einen Datensatz mit Anstoß, Berechnungs- und Speicherzeit, Modellversion, Saison, Spieltag, vollständigem Prognose-JSON und späteren Ergebnisfeldern.

Die Datenbank prüft ihre eigene Uhrzeit. Einfügen ist nur vor Anstoß zulässig. Ersetzen ist nur erlaubt, solange auch der bisher gespeicherte Anstoß noch in der Zukunft liegt, der neue Berechnungszeitpunkt jünger ist und noch kein Endergebnis eingetragen wurde.

Nach dem Schreiben wird in derselben D1-Sitzung gelesen. Die API liefert nur gespeicherte Prognosen aus. Ab Anstoß berechnet sie für die betreffende Partie keinen neuen Tipp. Eine verspätet eintreffende Berechnung kann damit nicht nachträglich als Vorabprognose eingefügt werden.

### 11.2 Was diese Sperre garantiert und was nicht

Gut abgesichert sind der unveränderte gespeicherte Tipp, ältere konkurrierende Antworten und nachträgliche Neuversuche mit späterer Anstoßzeit. Der Schutz orientiert sich allerdings an der gespeicherten Ansetzung. Sonderfälle wie vorgezogene, abgesagte oder verschobene Spiele benötigen einen ausdrücklich definierten Korrekturprozess.

Es gibt keinen zeitgesteuerten Dienst, der unabhängig vom App-Aufruf unmittelbar vor jedem Anstoß eine letzte Prognose sichert. Der gesperrte Stand ist der letzte erfolgreich gespeicherte Abruf. Wenn niemand rechtzeitig aufruft, kann er alt sein oder ganz fehlen. Das ist keine Garantie für eine Schlussquote.

Vor dem Anstoß wird der bisherige Datensatz überschrieben. Eine lückenlose Historie aller Quoten- und Prognosebewegungen existiert in dieser neuen Tabelle deshalb nicht. Der finale Payload wird gespeichert, jedoch nicht der vollständige Rohdatenstand samt Trainingsdatenhash und gesamtem Parametersatz. Ausgabe rekonstruieren und kompletten Fit reproduzieren sind hier unterschiedliche Dinge.

### 11.3 App-Aufrufe und Ausfälle

- Forecast beim Öffnen, Spieltagswechsel, manuellen Aktualisieren und Wiederanzeigen des Tabs.
- Zusätzlich ein Abruf kurz nach dem nächsten Anstoß, um den gespeicherten Stand anzuzeigen.
- Keine feste regelmäßige Aktualisierung der Vorabquoten bei dauerhaft offenem Forecast-Bildschirm.
- Speicherung vor der Saisonsimulation; die HTTP-Antwort wartet dennoch auf deren Abschluss.
- Sechs Saisonabrufe plus gegebenenfalls Quotenabruf und 10.000 Simulationen je Forecast-Aufruf.
- Keine expliziten Zeitlimits im Ergebnis- und Quotenfetch und kein separater langlebiger Fit-Cache.
- API-Antworten werden im Service Worker nicht offline zwischengespeichert.

Fehlt eine benötigte historische Quelle, kann die gesamte Forecast-Antwort ausfallen, obwohl ein bereits gespeicherter Tipp vorhanden wäre. Für einen wirklich robusten Lesepfad sollten eingefrorene Prognosen auch unabhängig von einem erfolgreichen vollständigen Datenneuabruf lesbar sein.

## 12. Lernübersicht und Ergebnisauswertung

Die Lern-API lädt die aktuelle und vorherige Saison und ergänzt Endergebnisse in gespeicherten Prognosen. Neue Publikationen haben bei gleicher Spiel-ID Vorrang vor älteren Tabellen. Es wird nur die jüngste nachweislich vor Anstoß datierte Prognose je Spiel ausgewertet.

Ermittelt werden:

- richtige 1X2-Ausgänge und exakte Treffer;
- durchschnittliche Punkte nach 4/3/2-Regel;
- Log-Loss, Brier-Score und RPS;
- Modell-, Markt- und Blendtreffer;
- Überraschungen, wenn der tatsächliche Ausgang unter 25 Prozent lag;
- Kennzahlen pro Modellversion und die neun zuletzt ausgewerteten Spiele.

Der RPS wird als Summe zweier kumulierter quadratischer Fehler berechnet, ohne die häufig verwendete Teilung durch zwei. Externe Vergleichswerte müssen dieselbe Konvention nutzen.

### 12.1 Was „Lernen“ tatsächlich bedeutet

Neue abgeschlossene Ergebnisse verändern beim nächsten Fit die Teamparameter. Das ist eine fortlaufende Aktualisierung der statistischen Grundlage.

Die Fehlerauswertung steuert jedoch keinen automatischen Optimierer für Marktgewicht, Kalibrierung oder Regularisierung. Auch nach 150 ausgewerteten Prognosen bleiben diese Werte unverändert. Nur der Status wechselt von `collecting` zu `frozen`. `teamProfilesUpdated` zählt berücksichtigte Teams des abgeleiteten Spieltags und ist kein gemessener Verbesserungserfolg.

Die Auswertung startet beim Aufruf von Verlauf oder Modell beziehungsweise auf manuelle Anforderung. Eine vollständig autonome Hintergrundauswertung ist nicht eingerichtet.

### 12.2 Offene Auswertungsprobleme

**Saisonvermischung:** `currentMatchday` ist das Maximum aller Spieltagsnummern der zusammengeführten Historie. Enthält diese Spieltag 34 aus der Vorsaison und Spieltag 2 aus der aktuellen Saison, wird 34 als aktuell gemeldet. Dieser Fehler wurde lokal reproduziert. Das Auswertungsobjekt führt dafür kein Saisonfeld mit.

**Unterschiedliche Vergleichsmengen:** Modell- und Blendtreffer werden über alle Prognosen gezählt, Markttreffer nur über Spiele mit Marktwerten. Für einen fairen Leistungsvergleich fehlen zusätzliche Kennzahlen aller drei Varianten auf exakt derselben Teilmenge.

**Ergebniskorrekturen:** Die neue Tabelle kann geänderte Endergebnisse übernehmen, protokolliert deren frühere Werte aber nicht als Historie. Bei alten Tabellen werden nur noch nicht ausgewertete Einträge abgeglichen; bereits eingetragene falsche Endstände bleiben dort ohne weiteren Korrekturpfad bestehen.

**Historische Abdeckung:** Alte Tabellen werden begrenzt eingelesen, die neue Tabelle dagegen ohne Seitenbegrenzung. Mit wachsender Nutzung sind einheitliche Archivierung und gezielte Aggregation sinnvoll.

## 13. Saisonsimulation

Die Simulation berechnet die Teamstärken erneut und baut für jedes nicht abgeschlossene Spiel eine Modellmatrix mit Temperatur 1,10. Aktuelle Marktquoten und eingefrorene finale Spielprognosen werden nicht übernommen.

Pro Durchlauf:

1. Tatsächliche Punkte, Tore und Gegentore abgeschlossener Spiele übernehmen.
2. Für jedes offene Spiel einen vollständigen Score aus dessen Matrix ziehen.
3. Punkte, Tore und Gegentore aktualisieren.
4. Tabelle nach Punkten, Tordifferenz, erzielten Toren und zuletzt Vereins-ID sortieren.
5. Meisterschaft, Top 4, Platz 16 bis 18 und Durchschnittsplatz zählen.

Der Zufallsgenerator wird deterministisch aus Spiel-IDs und Ergebnisfeldern initialisiert. Identische Inputs und Parameter liefern reproduzierbare Simulationen. Die modellierten Teamstärken bleiben innerhalb eines Simulationslaufs konstant; gezogene künftige Ergebnisse trainieren sie nicht neu.

Grenzen:

- Die Simulation verwendet den reinen Modellpfad und ist deshalb nicht dieselbe finale Prognose wie eine Matchkarte mit Marktanteil.
- Laufende, noch nicht abgeschlossene Spiele werden vollständig neu gezogen, ohne ihren Live-Spielstand zu berücksichtigen.
- Die Ausgabe `relegation` bedeutet Platz 16 bis 18, nicht die Wahrscheinlichkeit des tatsächlichen Abstiegs nach einer Relegation.
- Top 4 ist eine Platzierungswahrscheinlichkeit, keine vollständige Modellierung wechselnder Europapokalregeln.
- Der abschließende Vereins-ID-Tiebreaker ist eine technische Hilfsregel, keine vollständige Wettbewerbsregel.
- Unsicherheit der geschätzten Teamparameter, Transfers und gemeinsame Formschocks werden nicht simuliert.
- `standardError` beschreibt nur den Monte-Carlo-Ziehfehler der Meisterwahrscheinlichkeit des Favoriten. Es ist weder ein vollständiges Modell-Konfidenzintervall noch eine Aussage über Prognosefehler.

Mehr Simulationsläufe verkleinern nur den Ziehfehler. Sie beheben weder falsche Eingabewahrscheinlichkeiten noch fehlende Modellmerkmale.

## 14. Live-Center

OpenLigaDB liefert den aktuellen Wettbewerbsabschnitt. Die App zeigt dessen zurückgegebene Partien. Spiele gelten als live, wenn sie nicht abgeschlossen sind und der geplante Anstoß höchstens drei Stunden zurückliegt. Laufende Partien werden zusätzlich über den Einzelspiel-Endpunkt abgefragt.

Die Oberfläche aktualisiert alle 30 Sekunden bei sichtbarem Tab und erlaubt einen manuellen Abruf. Die Detailansicht zeigt Tore, Torschützen, gemeldete Spielminute, Elfmeter, Eigentore und Stadion, soweit vorhanden. Karten sind im verwendeten Modell ausdrücklich nicht verfügbar. Eine Push-Infrastruktur ist nicht implementiert.

**Reproduzierter Fehler:** Die Spielstandfunktion bevorzugt den höchsten in der Torliste enthaltenen Zwischenstand vor den Resultateinträgen, auch bei abgeschlossenen Spielen. Bei offiziellem Endstand 5:1 und unvollständiger Torliste bis 1:0 gibt die Funktion 1:0 zurück. Der aktuelle Test deckt die Verbesserung eines leeren Listenstands durch den Einzelspielabruf ab, nicht diesen widersprüchlichen Abschlussfall.

Weitere Grenzen sind die heuristische Live-Erkennung und der Rückfall auf „upcoming“ nach drei Stunden ohne Abschlussflag. Abgebrochene, verschobene oder stark verzögert gemeldete Spiele benötigen eigene Zustände. Der Live-Pfad verändert keine eingefrorenen Vorabtipps.

## 15. Neu ausgeführter historischer Rücktest

### 15.1 Verfahren

Ausgeführt wurde `node --import tsx scripts/backtest-model.ts` auf dem unveränderten Quellstand 4.1.1. Der Berichtskopf des Skripts enthält noch die feste Zeichenfolge `4.1.0`; tatsächlich importiert es den aktuellen Modellcode. Diese Metadatenabweichung ist zu korrigieren.

Für jeden Spieltag wird unmittelbar vor dessen erster Partie ein gemeinsamer Stichtag gesetzt. Das Training verwendet frühere Bundesliga-Ergebnisse und vorherige Zweitligasaisons. Innerhalb eines Spieltags werden spätere Partien nicht nochmals mit dem Freitagsergebnis aktualisiert. Die Ergebnisse sind damit mit diesem Stichtagsverfahren verbunden und nicht identisch zur laufend aktualisierten App.

Der Kernfilter schließt Spiele mit späterem Anstoß aus. Der Test übergibt jedoch den vollständigen historischen Saisonbestand an Anzeigehilfen: Tabellenstände und Formdarstellung können dadurch spätere Informationen enthalten. Nach dem gelesenen Datenfluss beeinflussen diese Anzeigehilfen die Lambda-Schätzung nicht; eine vollkommen zeitlich bereinigte Prognoseausgabe ist damit dennoch nicht nachgewiesen.

Es handelt sich um einen reproduzierten retrospektiven Roll-forward-Test, nicht um einen neu unangetasteten äußeren Testzeitraum. Die früheren Parameterentscheidungen könnten diese Saisons bereits verwendet haben. Eine innere Hyperparametersuche pro äußerem Fold ist nicht enthalten. Rohdaten wurden neu von der Quelle abgerufen, nicht aus einem unveränderlichen historischen Datenarchiv.

### 15.2 Ergebnisse des reinen Modellpfads

| Kennzahl | BLForecast 4.1.1 | Einfache Liga-Poisson-Basis |
|---|---:|---:|
| Spiele | 918 | 918 |
| Richtiger 1X2-Ausgang | 52,51 % | 42,05 % |
| Exakt, bedingte Ergebnisauswahl | 8,28 % | 7,08 % |
| Exakt, globaler Matrixmodus | 10,89 % | 11,00 % |
| 1X2-Log-Loss | 0,99025 | 1,08286 |
| Score-Matrix-Log-Loss | 3,08198 | 3,22538 |
| Brier-Score | 0,59004 | 0,65656 |
| RPS, ungeteilt | 0,40106 | 0,46659 |
| Mittlerer absoluter Torfehler je Seite | 0,99218 | 1,08045 |

Die einfache Basis verwendet ligaweite Heim-/Auswärtstorintensitäten ohne individuelle Teamstärken. Der bessere Log-Loss ist ein positiver Befund, aber der Vergleich ist weniger anspruchsvoll als ein Vergleich mit einem starken Teammodell oder dem fairen Markt.

Die aktuellen 95-Prozent-Wilson-Intervalle betragen etwa 49,27 bis 55,72 Prozent für 1X2 und 6,67 bis 10,24 Prozent für exakte Treffer der Primärprognose. Sie erfassen keine zusätzliche Unsicherheit durch frühere Modellauswahl auf denselben Daten.

| Saison | Spiele | 1X2 richtig | Exakt, primär | Exakt, global | 1X2-Log-Loss |
|---|---:|---:|---:|---:|---:|
| 2023/24 | 306 | 52,29 % | 9,15 % | 14,05 % | 0,97119 |
| 2024/25 | 306 | 50,00 % | 6,86 % | 7,52 % | 1,01965 |
| 2025/26 | 306 | 55,23 % | 8,82 % | 11,11 % | 0,97992 |

Der gepaarte Bootstrap gegen die einfache Poisson-Basis ergibt für die Log-Loss-Differenz ungefähr [-0,11534; -0,07004]. Das ist innerhalb dieses Prüfdesigns günstig. Der Bootstrap zieht einzelne Spiele unabhängig; Abhängigkeiten innerhalb von Spieltagen und Saisons sowie vorherige Parameterwahl werden nicht vollständig berücksichtigt.

### 15.3 Aussage zur Ergebnislogik

Die Primärprognose wählt nur in drei von 918 Spielen ein Remis. Der Score 2:1 erscheint in 39,11 Prozent der Spiele. Es gibt zwölf unterschiedliche Primärscores.

Das Modell weist weiterhin positive Remiswahrscheinlichkeiten aus. Seltene Remistipps entstehen, weil Remis selten die größte der drei Ausgangsmassen ist. Die nachgeschaltete Auswahl kann so fast alle Unentschieden aus der Hauptanzeige verdrängen, obwohl einzelne Remisscores relativ wahrscheinlich sind.

Der globale Matrixmodus erzielt hier 24 zusätzliche exakte Treffer gegenüber dem Primärscore. Gleichzeitig trifft der globale Modus der einfachen Poisson-Basis 101 statt 100 Ergebnisse exakt. Es ist daher weder eine Überlegenheit der aktuellen Primärscore-Regel noch eine generelle Überlegenheit des eigenen Modells bei exakten Treffern bewiesen.

**Empfehlung:** Die gewünschte Zielfunktion verbindlich festhalten und die Auswahlregeln getrennt bewerten. Bei maximaler exakter Trefferwahrscheinlichkeit passt der globale Modus mathematisch zum Ziel. Bei Vorrang des richtigen 1X2-Favoriten passt die aktuelle bedingte Regel. Eine erneute Umstellung allein zur optischen Vermeidung von 1:1 oder 2:1 wäre nicht begründet. Dieses Review verändert die Regel nicht.

### 15.4 Was der Test nicht belegt

- keinen Vorteil gegenüber fairen Buchmacherquoten;
- kein validiertes optimales Marktgewicht von 40 Prozent;
- keine Gewinnwahrscheinlichkeit oder Wettprofitabilität;
- keine verlässliche Vorhersage jedes einzelnen Spiels;
- keine unabhängig bestätigte Verbesserung durch die Konvergenzkorrektur.

Der vorhergehende gepaarte Test der ersten 18 abgeschlossenen Spiele 2026/27 ergab bei 4.1.1 18 statt null bestätigte stabile Fits, unveränderte 18 Scores, zwei exakte Treffer und neun richtige Ausgänge. Die maximale Lambda-Änderung betrug 0,0004064 Tore. Dieser kleine Vergleich wurde bereits vor diesem Vollreview durchgeführt und wird hier als ergänzende Evidenz eingeordnet.

Die in der UI gespeicherte historische Tabelle ist statisch. Sie nennt noch 8,39 Prozent exakte Treffer, während der jetzt erneut ausgeführte Lauf 8,28 Prozent ergibt. Die aktuelle App darf solche Konstanten nicht als automatisch neu berechnete Leistungswerte darstellen.

## 16. Funktionale Bewertung

| Bereich | Bewertung | Begründung |
|---|---|---|
| Zeit- und gegnerbereinigter Kern | Gut nachvollziehbar | Gemeinsame Teamparameter, Regularisierung und aktuelle Ergebnisse |
| Matrizenkonsistenz | Gut abgesichert | Normierung, Dixon-Coles und 1X2-Blockmassen werden getestet |
| Numerische Stabilität | Verbessert, weiter prüfbar | Abbruch korrigiert, aber kein unabhängiger Optimalitätsnachweis |
| Marktintegration | Funktional, Qualitätssicherung unvollständig | Faire Quoten und Blend vorhanden; Alter, Zeitpunktkonflikte und historische Validierung offen |
| Exakte Ergebnisauswahl | Bewusster Zielkonflikt | 1X2-Vorrang kostet im Rücktest exakte Treffer |
| Prognose-Freeze | Für gespeicherte reguläre Ansetzungen gut | Datenbankzeit schützt; automatische letzte Vorabaufnahme fehlt |
| Reproduzierbarkeit | Teilweise | Vollständige Ausgabe gespeichert, aber kein vollständiges unveränderliches Eingabearchiv |
| Spielprofil | Korrekturbedürftig | Zusätzliche Wahrscheinlichkeiten stammen aus anderem Berechnungspfad |
| Saisonsimulation | Funktional, vereinfachend | Vollständige Scores, aber Modellpfad ohne Markt, Live-Zustand und vollständige Tiebreaker |
| Lernübersicht | Nützlich, mit Fehlern | Auswertung vorhanden; Saisontrennung und gepaarter Vergleich fehlen |
| Selbstoptimierung | Nicht implementiert | Neue Teamfits ja, automatische parameterbasierte Verbesserung nein |
| Live-Center | Teilweise abgesichert | Einzelspielabruf vorhanden, Ergebnispriorität in Widerspruchsfällen fehlerhaft |
| Empirische Prognosegüte | Positiver Basisvergleich, nicht abschließend | 918 Spiele reproduziert; Marktvergleich und unangetastete Validierung fehlen |

## 17. Abgleich mit der ursprünglichen Wissensdatei

| Vorgabe aus `modelknowledge-v2.1.md` | Aktueller Stand |
|---|---|
| Gemeinsames gegnerbereinigtes Teammodell | Im Kern vorhanden |
| Form ausschließlich als Zeitgewichtung | Vorhanden |
| Keine pauschalen Remis- oder Vielfalt-Boosts | Vorhanden |
| Logarithmischer Markt-Blend und Power-De-vig | Vorhanden, numerischer Fallback und Qualitätskontrollen unvollständig |
| Ein finales Prognoseobjekt für alle Anwendungen | Nur teilweise: Saison und Spielprofil weichen ab |
| Kalibrierung getrennt nach finalem Markt-/Nichtmarktpfad | Nicht in der beschriebenen Reihenfolge implementiert |
| Vollständiger Parametersatz und Datenstand je Forecast | Im älteren Snapshotpfad umfangreicher; im aktiven Publikationspfad lückenhaft |
| Ereignisorientierte Speicherung unabhängig von App-Aufrufen | Fehlt |
| Versionshistorie für Ergebnis- und Quotenkorrekturen | Teilweise, keine vollständige Ereignishistorie |
| Echte verschachtelte Walk-forward- und Ablationsprüfung | Nicht vollständig vorhanden |
| Exakter Score bei reinem Exakttrefferziel | Aktuell bewusst durch spätere 1X2-Vorrangregel ersetzt |
| Vollständige Wettbewerbsregeln und Unsicherheitsintervalle | In der Simulation nur teilweise vorhanden |
| Wett-Radar und Paper Trading | Nicht implementiert; ohne entsprechende Validierung auch nicht vorrangig |

Die ursprüngliche Datei ist als Zielkonzept wertvoll. Ihre Formulierungen dürfen nicht als Nachweis gelesen werden, dass jede Funktion bereits existiert. Spätere Nutzerentscheidungen haben insbesondere die Hauptscore-Regel verändert; diese Abweichung sollte als bewusste Produktentscheidung dokumentiert sein.

## 18. Priorisierte nächste Schritte und Abnahmekriterien

### Priorität 1: Konsistenz und nachgewiesene Fehler

1. **Spielprofil aus der finalen Matrix ableiten.** BTTS, Über 2,5 und finale erwartete Tore serverseitig berechnen und mit dem Forecast speichern. Basis-Lambdas bei Bedarf getrennt beschriften. Abnahme: Die Werte stimmen numerisch mit den Zellsummen der gespeicherten Matrix überein.
2. **Live-Endergebnis priorisieren.** Bei bestätigtem Abschluss den offiziellen finalen Resultateintrag verwenden; Zwischenstände und Torliste mit Aktualitäts- und Plausibilitätsregeln abgleichen. Abnahme: Endstand 5:1 bleibt bei Torliste bis 1:0 als 5:1 sichtbar.
3. **Saisontrennung in der Auswertung.** Saison im Auswertungsobjekt führen, aktuellen Spieltag nach Saison und Zeitpunkt bestimmen. Abnahme: Vorsaison-Spieltag 34 übersteuert aktuellen Spieltag 2 nicht.
4. **Zeitkonflikte der Quotenquellen sperren.** Vorabstatus gegenüber beiden Anstoßzeiten prüfen oder bei Konflikt sichtbar aus dem Blend nehmen. Abnahme: Das reproduzierte 13:00/11:00-Beispiel wird abgewiesen.
5. **Status und historische Kennzahlen korrekt beschriften.** Statische Backtestzahlen mit Version und Prüfdatum versehen; keine automatische Verbesserung oder vollständige Datenarchivierung behaupten.

### Priorität 2: Vollständiger Datenbetrieb

6. Zu definierten Zeitpunkten unabhängig vom Nutzerabruf Prognosen und Quoten sichern. Eine ausdrückliche Strategie für letzte Vorabstände, Absagen und Verschiebungen festlegen.
7. Unveränderliche Forecast-Revisionen mit Parametersatz, Quelle, Datenstichtag, Rohdatenhash und Ergebnisrevisionen speichern. Den kanonischen veröffentlichten Tipp davon klar ableiten.
8. Modell, Markt und Blend auf derselben Spielmenge bewerten, getrennt nach Saison, Modellversion, Quotenalter und Anbieterzahl.
9. Eingefrorene Datensätze ohne Neuberechnung und ohne Abhängigkeit von allen externen historischen Quellen ausliefern.

### Priorität 3: Belegte statistische Optimierung

10. Ziel der Hauptscore-Regel festlegen und mehrere Entscheidungsregeln auf einem getrennten Zeitraum vergleichen. Wahrscheinlichkeitskern und Auswahlregel getrennt versionieren.
11. Mehrere äußere Zeitfalten mit ausschließlich früherer innerer Parameterwahl erstellen. Ergebnisse, Datenhashes und Parameterauswahl dauerhaft dokumentieren.
12. Halbwertszeit, Regularisierung, Rho, Aufsteigerübersetzung und Kalibrierung einzeln per Ablation prüfen. Änderungen nicht nach neun oder 18 Spielen opportunistisch wählen.
13. Aktuelle Marktbeimischung beibehalten oder verändern ausschließlich nach einem sauberen Vergleich. Historische Quotendaten sind für diesen Vergleich nötig, nicht als Voraussetzung für die technische Nutzung aktueller Quoten.
14. Simulation wahlweise explizit als reine langfristige Modellsimulation kennzeichnen oder mit derselben finalen Matrix und eingefrorenen Spielständen verbinden. Wettbewerbsregeln und Parameterunsicherheit gesondert berücksichtigen.

## 19. Prüfprotokoll und Reproduktion

Auf dem oben genannten unveränderten Quellstand:

```bash
node --import tsx --test tests/model-core.test.ts tests/learning-core.test.ts tests/live-core.test.ts tests/publication.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --import tsx scripts/backtest-model.ts
```

Ergebnis: 25 Tests bestanden, TypeScript ohne Fehler, historischer Lauf mit 918 Spielen abgeschlossen.

Zusätzliche lokale Proben ohne Änderung der Produktionsdateien:

| Probe | Beobachtung |
|---|---|
| Finalresultat 5:1, Torliste endet 1:0 | Live-Normalisierung liefert fehlerhaft 1:0 |
| Lambda 1,35/1,21, Rho -0,10 | BTTS unabhängig 51,99 %, Dixon-Coles 53,25 % |
| Vorsaison Spieltag 34 und aktuelle Saison Spieltag 2 | Lernübersicht meldet 34 als aktuell |
| OpenLiga-Anstoß 13:00, Marktanstoß 11:00, Quote 11:59, Stichtag 12:00 | Marktquote wird trotz früher begonnenem Marktspiel akzeptiert |

Die bestehenden Tests beweisen wichtige Invarianten, aber nicht Fehlerfreiheit aller Funktionen. Die zusätzlichen Gegenbeispiele erklären, warum 25 bestandene Tests und gleichzeitig offene Fehler kein Widerspruch sind.

## 20. Datenfelder für eine externe Auswertung

| Feld | Bedeutung und Einheit |
|---|---|
| `id` | Quell-Spiel-ID, zugleich kanonischer Speicherschlüssel |
| `kickoff` | Gespeicherte Anstoßzeit als ISO-Zeitstempel |
| `publication.generatedAt` | Beginn des zugehörigen Berechnungsaufrufs |
| `publication.storedAt` | Tatsächlicher datenbankseitiger Speicherzeitpunkt |
| `publication.modelVersion` | Version des gespeicherten Forecasts |
| `publication.frozen` | Gespeicherter Anstoß erreicht, zur Lesezeit bestimmt |
| `lambda` | Basis-Torerwartungen, keine Schuss-xG und keine zwingenden finalen Matrixmittelwerte |
| `rawModelProbabilities` | 1X2 aus Poisson/Dixon-Coles, Werte 0 bis 1 |
| `modelProbabilities` | Temperierte reine Modellverteilung, Werte 0 bis 1 |
| `probabilities` | Finale 1X2-Verteilung, Werte 0 bis 1 |
| `probs`, `modelProbs`, `rawModelProbs` | Gerundete Darstellungswerte, jeweils Summe 100 |
| `scoreMatrix` | Finale Matrix mit Zellwerten 0 bis 1; gespeichert, in der normalen API-Antwort entfernt |
| `modelScoreMatrix` | Temperierte Modellmatrix ohne Markt; ebenfalls gespeichert |
| `score`, `mostLikelyScore` | Aktuelle bedingte Primärprognose |
| `scoreChance` | Absolute Chance des Hauptscores in Prozent |
| `globalMostLikelyScore` | Globaler Modus der finalen Matrix |
| `modelMostLikelyScore` | Globaler Modus der temperierten reinen Modellmatrix, kein bedingter Modellscore |
| `alternatives` | Nächste drei Scores ausschließlich im ausgewählten 1X2-Ausgang |
| `tipGameScore`, `tipExpectedPoints` | Separater 4/3/2-Nutzentipp und dessen Erwartungswert |
| `market.quotes` | Rohquoten, Anbieter und einzelne Quotenzeitstempel |
| `market.probabilities` | Fairer gemittelter Markt, vor der Markttemperatur |
| `diagnostics` | Pfad, Auswahlregel, Konvergenz, Iterationen, Rho, Lambda-Clipping, Übersetzungsfaktoren |
| `insight` | Formanzeige, transformierte Ratings, Tabellenstand, beschreibende Treiber |

Eine externe Analyse sollte Prozentwerte und Wahrscheinlichkeiten nicht verwechseln, Modell- und Finalmatrix getrennt betrachten und nur zeitlich geeignete gespeicherte Prognosen auswerten. Eine Modellversionsnummer allein ersetzt keinen vollständigen Parametersatz und keinen archivierten Eingabedatenstand.

## 21. Quellen und Belegstellen

Primäre Grundlage ist der oben identifizierte Quellstand. Die wichtigsten Belegfunktionen sind `fitRatings`, `prepareSeasonModel`, `buildForecasts`, `buildSeasonSimulation`, `fetchMarketOdds`, `deriveLearningSummary`, `PUBLISH_SQL`, `publishedEvaluation`, `reconcileFinishedSnapshots`, `scoreFor` und `normalizeLiveMatch` in den in Abschnitt 3 genannten Dateien. Anzeigeformeln und Aktualisierungslogik stehen in `app/forecast-app.tsx`.

Zusätzlich geprüft:

- Ursprüngliche Spezifikation: `modelknowledge-v2.1.md`, v2.1.0, 903 Zeilen, am 07.09.2026 gelesen. Sie definiert Sollverhalten, nicht den Nachweis seiner Umsetzung.
- The Odds API, offizielle v4-Dokumentation: https://the-odds-api.com/liveapi/guides/v4/ , abgerufen 07.09.2026. Der genutzte Quotenendpunkt liefert Quotenereignisse und Buchmacherzeitstempel; historische Quoten sind ein eigener Datenzugang.
- OpenLigaDB, offizielles API-Schema: https://api.openligadb.de/swagger/v1/swagger.json , abgerufen 07.09.2026. Grundlage für Spiel-, Resultat- und Torfelder.
- Cloudflare D1, offizielle Dokumentation zu Sessions und Read Replication: https://developers.cloudflare.com/d1/best-practices/read-replication/ , abgerufen 07.09.2026. Kontext der verwendeten Datenbanksitzung mit konsistentem Lesen nach dem Schreiben.

Externe Dokumentationen belegen Schnittstellen, nicht die Trefferqualität dieses konkreten Modells. Die statistischen Kennzahlen in diesem Dokument stammen aus den beschriebenen eigenen Läufen.
