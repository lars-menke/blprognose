import { useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { MatchDetailSheet } from '../components/MatchDetailSheet';
import { CLUBS } from '../lib/clubs';
import { useMatchday } from '../lib/useMatchday';
import type { MatchdayEntry } from '../lib/useMatchday';
import styles from './MatchdayScreen.module.css';

type Props = {
  onThemeToggle: () => void;
  isDark: boolean;
};

export function MatchdayScreen({ onThemeToggle, isDark }: Props) {
  const { loading, error, spieltag, trueSpieltag, matches, logos, hasMono, hasMarket, hasCalib, setSpielTag } = useMatchday();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchdayEntry | null>(null);

  const isPast = spieltag < trueSpieltag;
  const isCurrent = spieltag === trueSpieltag;

  return (
    <div className={styles.screen}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <svg className={styles.titleIcon} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="1024" height="1024" fill="#0A1628"/>
            <rect x="208" y="624" width="112" height="208" rx="22" fill="#F4C430"/>
            <rect x="368" y="496" width="112" height="336" rx="22" fill="#F4C430"/>
            <rect x="528" y="368" width="112" height="464" rx="22" fill="#F4C430"/>
            <rect x="688" y="432" width="112" height="400" rx="22" fill="#F4C430" fillOpacity="0.45"/>
            <path d="M240 688 Q 416 480 544 368 T 832 208" stroke="#FFF" strokeWidth="28" fill="none" strokeLinecap="round"/>
            <circle cx="832" cy="208" r="76" fill="#FFF"/>
            <path d="M832 156 L880 191 L862 247 L802 247 L784 191 Z" fill="#0A1628"/>
          </svg>
          <div>
            <h1 className={styles.large}>BLforecast</h1>
            <p className={styles.subtitle}>
              {loading ? 'Lade…' : `${spieltag}. Spieltag · Bundesliga 2025/26`}
            </p>
          </div>
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
          {hasMarket && <span className={styles.chipMarket}>📊 Marktquoten aktiv</span>}
          {hasCalib && <span className={styles.chipCalib}>🎯 Kalibriert</span>}
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
              onClick={() => setSelectedMatch(m)}
            />
          );
        })}
      </div>

      {/* Match Detail Sheet */}
      {selectedMatch && (() => {
        const home = CLUBS[selectedMatch.home];
        const away = CLUBS[selectedMatch.away];
        if (!home || !away) return null;
        return (
          <MatchDetailSheet
            home={home}
            away={away}
            kickoff={selectedMatch.kickoff}
            result={selectedMatch.result}
            homeLogo={logos[selectedMatch.home]}
            awayLogo={logos[selectedMatch.away]}
            onClose={() => setSelectedMatch(null)}
          />
        );
      })()}

      <footer className={styles.footer}>
        BLforecast v{__APP_VERSION__} · Poisson-Modell
      </footer>

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
