import type { Club } from '../lib/clubs';
import type { MatchResult } from '../lib/poisson';
import { TeamLogo } from './TeamLogo';
import styles from './MatchDetailSheet.module.css';

type Props = {
  home: Club;
  away: Club;
  kickoff: string;
  result: MatchResult;
  homeLogo?: string;
  awayLogo?: string;
  onClose: () => void;
};

function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function lbl(n: number) { return n.toFixed(2); }

export function MatchDetailSheet({ home, away, kickoff, result, homeLogo, awayLogo, onClose }: Props) {
  const [hg, ag] = (result.tipp ?? '?').split(':').map(Number);
  const topScores = result.srt.slice(0, 8);
  const hasRules = result.drawBlocked || result.goalRuleApplied || result.favScoreRuleApplied || result.adjusted;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.handle} />

        {/* Teams + Tipp */}
        <div className={styles.matchHead}>
          <div className={styles.teamCol}>
            <TeamLogo club={home} logoUrl={homeLogo} size="md" />
            <span className={styles.teamName}>{home.name}</span>
          </div>
          <div className={styles.tippCol}>
            <div className={styles.tippScore} data-numeric>
              {isNaN(hg) ? '?' : hg}:{isNaN(ag) ? '?' : ag}
            </div>
            <div className={styles.tippMeta}>{kickoff}</div>
          </div>
          <div className={styles.teamCol}>
            <TeamLogo club={away} logoUrl={awayLogo} size="md" />
            <span className={styles.teamName}>{away.name}</span>
          </div>
        </div>

        {/* 1X2 */}
        <div className={styles.sectionLabel}>Wahrscheinlichkeit</div>
        <div className={styles.sectionCard}>
          <div className={styles.probs} data-numeric>
            <div className={styles.prob}>
              <div className={styles.probVal}>{pct(result.pH)}</div>
              <div className={styles.probLbl}>Heim</div>
            </div>
            <div className={styles.probSep} />
            <div className={styles.prob}>
              <div className={styles.probVal}>{pct(result.pD)}</div>
              <div className={styles.probLbl}>Remis</div>
            </div>
            <div className={styles.probSep} />
            <div className={styles.prob}>
              <div className={styles.probVal}>{pct(result.pA)}</div>
              <div className={styles.probLbl}>Gast</div>
            </div>
          </div>
          <div className={styles.probBar}>
            <div className={styles.probBarH} style={{ width: pct(result.pH) }} />
            <div className={styles.probBarD} style={{ width: pct(result.pD) }} />
            <div className={styles.probBarA} style={{ width: pct(result.pA) }} />
          </div>
        </div>

        {/* Modell-Parameter */}
        <div className={styles.sectionLabel}>Modell</div>
        <div className={styles.sectionCard}>
          <Row
            label="λ Heim"
            desc="Erwartete Tore des Heimteams (Poisson-Mittelwert)"
            value={lbl(result.lH)}
          />
          <Row
            label="λ Gast"
            desc="Erwartete Tore des Gastes (Poisson-Mittelwert)"
            value={lbl(result.lA)}
          />
          <Row
            label="Dixon-Coles ρ"
            desc="Korrektur für 0:0 und 1:0 / 0:1 — niedrige Scores treten häufiger auf als Poisson vorhersagt"
            value="−0.13"
          />
          <Row
            label="λ-Differenz"
            desc="Abstand der erwarteten Torwerte — je kleiner, desto ausgeglichener"
            value={lbl(result.lambdaDiff)}
          />
          <Row
            label="Remis-Schwelle"
            desc={`Mindest-Remiswahrscheinlichkeit für einen X-Tipp${result.lambdaDiff < 0.25 ? ' — engeres Fenster wegen ausgeglichener Stärke' : ''}`}
            value={`${(result.effectiveDrawThreshold * 100).toFixed(0)}%${result.lambdaDiff < 0.25 ? ' (eng)' : ''}`}
          />
          <Row
            label="Marktkorrektur"
            desc="Newton-Raphson-Kalibrierung auf Buchmacher-Quoten — passt λH und λA iterativ an bis Modell mit Markt übereinstimmt"
            value={result.marketApplied ? 'aktiv' : 'inaktiv'}
          />
        </div>

        {/* Aktive Regeln */}
        {hasRules && (
          <>
            <div className={styles.sectionLabel}>Aktive Regeln</div>
            <div className={styles.sectionCard}>
              {result.drawBlocked && (
                <div className={styles.rule}>
                  <span className={styles.ruleIcon}>⚠️</span>
                  <span className={styles.ruleText}>
                    Remis gesperrt — X={pct(result.pD)} {'<'} {(result.effectiveDrawThreshold * 100).toFixed(0)}% Schwelle → {result.wo === 'H' ? 'Heimsieg' : 'Auswärtssieg'}
                  </span>
                </div>
              )}
              {result.goalRuleApplied && (
                <div className={styles.rule}>
                  <span className={styles.ruleIcon}>⚽</span>
                  <span className={styles.ruleText}>Mindesttor-Regel — P(≥1 Tor) ≥ 50%, Score mit 0 Toren verworfen</span>
                </div>
              )}
              {result.favScoreRuleApplied && (
                <div className={styles.rule}>
                  <span className={styles.ruleIcon}>🔵</span>
                  <span className={styles.ruleText}>
                    Favorit-Mindestscore — λ={lbl(result.wo === 'H' ? result.lH : result.lA)} ≥ 2.0, mind. 2 Tore erzwungen
                  </span>
                </div>
              )}
              {result.adjusted && (
                <div className={styles.rule}>
                  <span className={styles.ruleIcon}>🔀</span>
                  <span className={styles.ruleText}>Monokultur-Schutz — Score war zu häufig vergeben, Alternative eingesetzt</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Top-Scores */}
        <div className={styles.sectionLabel}>Wahrscheinlichste Scores</div>
        <div className={styles.sectionCard}>
          <div className={styles.scoreGrid} data-numeric>
            {topScores.map(([score, p]) => (
              <div
                key={score}
                className={`${styles.scoreCell} ${score === result.tipp ? styles.scoreCellActive : ''}`}
              >
                <div className={styles.scoreCellScore}>{score}</div>
                <div className={styles.scoreCellP}>{(p * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>

        <button className={styles.closeBtn} onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}

function Row({ label, desc, value }: { label: string; desc: string; value: string }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabelBlock}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowDesc}>{desc}</span>
      </div>
      <span className={`${styles.rowValue} ${styles.rowMono}`}>{value}</span>
    </div>
  );
}
