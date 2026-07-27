import { useState } from 'react';
import { useTheme } from '../lib/useTheme';
import { isBetRadarEnabled, setBetRadarEnabled } from '../lib/settings';
import { exportLogText, logStats } from '../lib/learnLog';
import { paperSummary } from '../lib/betRadar';
import { unmappedTeams } from '../lib/openligadb';
import styles from './ProfileScreen.module.css';

export function ProfileScreen() {
  const { toggle, isDark } = useTheme();
  const [betRadar, setBetRadarState] = useState(isBetRadarEnabled());
  const [exportMsg, setExportMsg] = useState('');
  const paper = paperSummary();
  const learnStats = logStats();
  const unmapped = unmappedTeams();

  function toggleBetRadar() {
    const next = !betRadar;
    setBetRadarEnabled(next);
    setBetRadarState(next);
  }

  async function exportLearnLog() {
    const text = exportLogText();
    if (learnStats.total === 0) {
      setExportMsg('Noch keine Eintraege im Lernprotokoll');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setExportMsg(`${learnStats.total} Eintraege (${learnStats.withOutcome} mit Ergebnis) kopiert`);
    } catch {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bl_learnlog.json';
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg(`${learnStats.total} Eintraege als Datei exportiert`);
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.large}>Modell</h1>
        <p className={styles.subtitle}>BLforecast Poisson-Modell</p>
      </header>

      <div className={styles.sectionLabel} style={{ paddingTop: 'var(--space-4)' }}>Darstellung</div>
      <div className={styles.sectionCard}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Dark Mode</span>
          <button
            className={`${styles.toggle} ${isDark ? styles.toggleOn : ''}`}
            onClick={toggle}
            role="switch"
            aria-checked={isDark}
            type="button"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
      </div>

      <div className={styles.sectionLabel}>Genauigkeit</div>
      <div className={styles.sectionCard}>
        <Row label="1X2-Genauigkeit" value="54.2%" />
        <Row label="Remis erkannt" value="15.8%" />
        <Row label="TOP-Tipps Quote" value="69.2%" />
        <Row label="Backtest-Spiele" value="612" />
      </div>
      <div className={styles.explainRow} style={{ margin: '0 var(--space-4) var(--space-2)', background: 'var(--bg-card)', borderRadius: 'var(--radius-card)', border: 'none' }}>
        <span className={styles.explainDesc}>
          Werte aus dem Backtest der Saison 2025/26 (altes Modell, vor der WM-Migration). Nach den ersten
          BL-Spieltagen 2026/27 mit neuem Marktkorrektur- und Dissens-Signal neu erheben.
        </span>
      </div>

      <div className={styles.sectionLabel}>Wie funktioniert das Modell?</div>
      <div className={styles.sectionCard}>
        <ExplainRow
          term="Poisson-Modell"
          desc="Schaetzt die Anzahl Tore pro Team als Zufallsprozess. Basis sind die Saison-Statistiken: Heim-Torquote und Auswaerts-Gegentorquote jedes Klubs, mit echtem Heim-/Auswaertssplit."
        />
        <ExplainRow
          term="Dixon-Coles (rho = -0.13)"
          desc="Korrigiert die Unabhaengigkeitsannahme des Poisson-Modells fuer 0:0, 1:0, 0:1 und 1:1 - diese Ergebnisse treten haeufiger auf als rein zufaellig."
        />
        <ExplainRow
          term="Form-Blending"
          desc="Gewichtet aktuelle Formkurve (40%) und Saison-Durchschnitt (60%). Juengere Spiele zaehlen mehr (Decay 0.72)."
        />
        <ExplainRow
          term="Kaltstart-Prior (Spieltag 1-5)"
          desc="Solange die laufende Saison wenig Spiele liefert, wird mit der Vorsaison-Statistik geglaettet (Aufsteiger: Liga-Durchschnitt minus Malus). Gewicht wandert stetig zur Live-Statistik, ab ca. 6 gespielten Partien pro Team ueberwiegt sie."
        />
        <ExplainRow
          term="Draw-Boost"
          desc="Bei knappen Lambda-Differenzen (< 0.40) hebt ein struktureller Boost die Remis-Wahrscheinlichkeit an - Poisson unterschaetzt sonst enge Unentschieden. Greift nur ohne Marktquote: liegen Quoten vor, ist das Remis dort bereits eingepreist."
        />
        <ExplainRow
          term="Dissens-Signal"
          desc="Favorisieren Modell und Markt unterschiedliche Seiten, ist ein Remis ueberproportional wahrscheinlich (WM-Befund: 44% vs. 14%). Nur dann greift mit Marktquote ein zusaetzlicher Remis-Aufschlag."
        />
        <ExplainRow
          term="Platt-Kalibrierung"
          desc="Justiert die Rohwahrscheinlichkeiten anhand historischer Ergebnisse (rollierend, ohne Marktquote trainiert). Verhindert Ueber- und Untervertrauen."
        />
        <ExplainRow
          term="Marktkorrektur-Blend"
          desc="Wenn Buchmacher-Quoten verfuegbar sind, findet Newton-Raphson das markt-implizite Lambda; genutzt wird ein Mix aus 60% Modell und 40% Markt (MARKET_BLEND) statt vollem Sprung auf die Quote."
        />
        <ExplainRow
          term="TOP-Tipp"
          desc="Spiele mit fp >= 0.70: Der Favorit hat mindestens 70% Wahrscheinlichkeit."
        />
      </div>

      <div className={styles.sectionLabel}>Parameter</div>
      <div className={styles.sectionCard}>
        <Row label="Form-Decay lambda" value="0.72" />
        <Row label="Dixon-Coles rho" value="-0.13" />
        <Row label="Draw-Boost max" value="0.15" />
        <Row label="Dissens-Draw-Boost max" value="0.08" />
        <Row label="Markt-Gewicht (alpha)" value="0.4" />
        <Row label="Form-Gewicht" value="40%" />
        <Row label="Kaltstart-Glaettung" value="n / (n+6)" />
      </div>

      <div className={styles.sectionLabel}>Wetten</div>
      <div className={styles.sectionCard}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Wett-Radar anzeigen</span>
          <button
            className={`${styles.toggle} ${betRadar ? styles.toggleOn : ''}`}
            onClick={toggleBetRadar}
            role="switch"
            aria-checked={betRadar}
            type="button"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
      </div>
      <div className={styles.explainRow} style={{ margin: '0 var(--space-4) var(--space-2)', background: 'var(--bg-card)', borderRadius: 'var(--radius-card)', border: 'none' }}>
        <span className={styles.explainDesc}>
          Zeigt Ausgaenge mit positivem Erwartungswert (Modell vs. Buchmacherquote) im Spieltag-Tab, inkl.
          Paper-Trading-Konto. Keine Wettempfehlung - ein Erkenntnis-Werkzeug, das ehrlich zeigt, ob das
          Modell dem Markt tatsaechlich einen Vorteil abringt.
        </span>
      </div>
      {betRadar && paper.settled > 0 && (
        <div className={styles.sectionCard}>
          <Row label="Paper-Konto offen" value={String(paper.open)} />
          <Row label="Abgerechnet" value={`${paper.settled} (${paper.won} gewonnen)`} />
          <Row label="ROI" value={`${(paper.roi * 100).toFixed(1)}%`} />
        </div>
      )}

      {unmapped.length > 0 && (
        <>
          <div className={styles.sectionLabel}>Diagnose</div>
          <div className={styles.sectionCard}>
            <div className={styles.explainRow}>
              <div className={styles.explainTerm} style={{ color: 'var(--system-red)' }}>
                {unmapped.length} unbekannte{unmapped.length === 1 ? 'r' : ''} Verein{unmapped.length === 1 ? '' : 'e'}
              </div>
              <div className={styles.explainDesc}>
                {unmapped.join(', ')} — diese Spiele werden nicht angezeigt. Vereins-Maps ergaenzen:
                TEAM_CODE_MAP (openligadb.ts), CLUBS + FALLBACK_STATS (clubs.ts), ODDS_TEAM_MAP (fetchOdds.ts).
              </div>
            </div>
          </div>
        </>
      )}

      <div className={styles.sectionLabel}>Daten &amp; Lernprotokoll</div>
      <div className={styles.sectionCard}>
        <Row label="Datenquelle" value="OpenLigaDB" />
        <Row label="Fallback" value="football-data.org" />
        <Row label="Marktquoten" value="The Odds API" />
        <Row label="Lernprotokoll" value={`${learnStats.withOutcome} Spiele mit Ergebnis`} />
        <Row label="Version" value={__APP_VERSION__} />
      </div>
      <div className={styles.sectionCard}>
        <div className={styles.row}>
          <button className={styles.exportBtn} onClick={exportLearnLog} type="button">
            Lernprotokoll exportieren
          </button>
        </div>
        {exportMsg && (
          <div className={styles.row}>
            <span className={styles.rowValue} style={{ color: 'var(--system-green)' }}>{exportMsg}</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        BLforecast v{__APP_VERSION__}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}

function ExplainRow({ term, desc }: { term: string; desc: string }) {
  return (
    <div className={styles.explainRow}>
      <div className={styles.explainTerm}>{term}</div>
      <div className={styles.explainDesc}>{desc}</div>
    </div>
  );
}
