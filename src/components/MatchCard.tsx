import type { Club } from '../lib/clubs';
import type { MatchResult } from '../lib/poisson';
import { TeamLogo } from './TeamLogo';
import { ProbabilityBar } from './ProbabilityBar';
import styles from './MatchCard.module.css';

type Props = {
  home: Club;
  away: Club;
  kickoff: string;
  result: MatchResult;
  homeLogo?: string;
  awayLogo?: string;
  topTip?: boolean;
  actual?: { g1: number; g2: number } | null;
  onClick?: () => void;
};

const OUTCOME_LABEL: Record<string, string> = { H: 'Heimsieg', D: 'Remis', A: 'Auswärtssieg' };

type Cat = { label: string; badge: 'badgeFav' | 'badgeMid' | 'badgeFifty'; stripe: 'accentFav' | 'accentMid' | 'accentFifty' };

function category(fp: number): Cat {
  if (fp >= 0.70) return { label: 'Favorit', badge: 'badgeFav', stripe: 'accentFav' };
  if (fp >= 0.55) return { label: 'Kante', badge: 'badgeMid', stripe: 'accentMid' };
  return { label: '50/50', badge: 'badgeFifty', stripe: 'accentFifty' };
}

export function MatchCard({ home, away, kickoff, result, homeLogo, awayLogo, topTip, actual, onClick }: Props) {
  const [hg, ag] = (result.tipp ?? '?').split(':').map(Number);
  const cat = category(result.fp);

  const actualOutcome = actual
    ? actual.g1 > actual.g2 ? 'H' : actual.g1 < actual.g2 ? 'A' : 'D'
    : null;
  const correct = actualOutcome !== null && actualOutcome === result.wo;
  const incorrect = actualOutcome !== null && actualOutcome !== result.wo;

  return (
    <button className={`${styles.card}${topTip ? ` ${styles.cardTop}` : ''}`} onClick={onClick} type="button">
      <div className={`${styles.accentStripe} ${styles[cat.stripe]}`} />

      <div className={styles.inner}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.meta}>{kickoff}</span>
          <div className={styles.badges}>
            {topTip && <span className={`${styles.badge} ${styles.badgeTop}`}>TOP</span>}
            <span className={`${styles.badge} ${styles[cat.badge]}`}>{cat.label}</span>
          </div>
        </div>

        {/* Teams + Score */}
        <div className={styles.body}>
          <div className={styles.teams}>
            <div className={styles.team}>
              <TeamLogo club={home} logoUrl={homeLogo} size="sm" />
              <span className={styles.teamName}>{home.name}</span>
            </div>
            <div className={styles.team}>
              <TeamLogo club={away} logoUrl={awayLogo} size="sm" />
              <span className={styles.teamName}>{away.name}</span>
            </div>
          </div>

          <div className={styles.score}>
            {actual ? (
              <>
                <div className={`${styles.scoreValue} ${correct ? styles.scoreCorrect : styles.scoreIncorrect}`} data-numeric>
                  {actual.g1}:{actual.g2}
                </div>
                <div className={`${styles.scoreLabel} ${correct ? styles.scoreLabelCorrect : incorrect ? styles.scoreLabelIncorrect : ''}`}>
                  {correct ? '✓ Richtig' : '✗ Falsch'}
                </div>
                <div className={styles.tippSmall} data-numeric>Tipp {isNaN(hg) ? '?' : hg}:{isNaN(ag) ? '?' : ag}</div>
              </>
            ) : (
              <>
                <div className={styles.scoreValue} data-numeric>
                  {isNaN(hg) ? '?' : hg}:{isNaN(ag) ? '?' : ag}
                </div>
                <div className={styles.scoreLabel}>{OUTCOME_LABEL[result.wo] ?? 'Tipp'}</div>
              </>
            )}
          </div>
        </div>

        {/* Probability Bar */}
        <ProbabilityBar home={result.pH} draw={result.pD} away={result.pA} />
      </div>
    </button>
  );
}
