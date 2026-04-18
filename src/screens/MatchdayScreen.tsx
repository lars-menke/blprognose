import { useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { CLUBS } from '../lib/clubs';
import { useMatchday } from '../lib/useMatchday';
import styles from './MatchdayScreen.module.css';

type Props = {
  onThemeToggle: () => void;
  isDark: boolean;
};

export function MatchdayScreen({ onThemeToggle, isDark }: Props) {
  const { loading, error, spieltag, trueSpieltag, matches, logos, hasMono, setSpielTag } = useMatchday();
  const [selectorOpen, setSelectorOpen] = useState(false);

  const isPast = spieltag < trueSpieltag;
  const isCurrent = spieltag === trueSpieltag;

  return (
    <div className={styles.screen}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.large}>Prognose</h1>
          <p className={styles.subtitle}>
            {loading ? 'Lade…' : `${spieltag}. Spieltag · Bundesliga 2025/26`}
          </p>
        </div>
        <div className={styles.headerActions}>
        <button
          className={styles.themeBtn}
          onClick={onThemeToggle}
          aria-label="Theme wechseln"
        >{isDark ? '☀️' : '🌙'}</button>
        <button
          className={styles.spieltagBtn}
          onClick={() => setSelectorOpen(true)}
          disabled={loading}
          aria-label="Spieltag wählen"
        >
          <span className={styles.spieltagBtnNr}>{spieltag}</span>
          <span className={styles.spieltagBtnLabel}>Spieltag</span>
        </button>
        </div>
      </header>

      {/* Status-Chip */}
      {!loading && !error && (
        <div className={styles.statusChip}>
          {isCurrent && <span className={styles.chipCurrent}>Aktuell</span>}
          {isPast && <span className={styles.chipPast}>Gespielt</span>}
          {!isCurrent && !isPast && <span className={styles.chipFuture}>Ausstehend</span>}
          {hasMono && <span className={styles.chipMono}>🔀 Monokultur-Schutz aktiv</span>}
        </div>
      )}

      {/* Match-Liste */}
      <div className={styles.list}>
        {loading && (
          <div className={styles.state}>
            <div className={styles.spinner} />
            <span>Lade Spieltag…</span>
          </div>
        )}
        {error && (
          <div className={`${styles.state} ${styles.stateError}`}>
            Fehler: {error}
          </div>
        )}
        {!loading && !error && matches.length === 0 && (
          <div className={styles.state}>Keine Daten für Spieltag {spieltag}</div>
        )}
        {!loading && matches.map(m => {
          const home = CLUBS[m.home];
          const away = CLUBS[m.away];
          if (!home || !away) return null;
          const fp = m.result.fp;
          const topTip = fp >= 0.70;
          return (
            <MatchCard
              key={m.id}
              home={home}
              away={away}
              kickoff={m.kickoff}
              result={m.result}
              homeLogo={logos[m.home]}
              awayLogo={logos[m.away]}
              topTip={topTip}
            />
          );
        })}
      </div>

      {/* Spieltag-Selector Modal */}
      {selectorOpen && (
        <div className={styles.overlay} onClick={() => setSelectorOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={styles.modalTitle}>Spieltag wählen</span>
              <button className={styles.modalClose} onClick={() => setSelectorOpen(false)}>✕</button>
            </div>
            <div className={styles.stGrid}>
              {Array.from({ length: 34 }, (_, i) => i + 1).map(nr => {
                let cls = styles.stBtn;
                if (nr === trueSpieltag) cls += ` ${styles.stBtnCurrent}`;
                else if (nr < trueSpieltag) cls += ` ${styles.stBtnPast}`;
                return (
                  <button
                    key={nr}
                    className={cls}
                    onClick={() => { setSpielTag(nr); setSelectorOpen(false); }}
                  >
                    {nr}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
