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
  onClick?: () => void;
};

const OUTCOME_LABEL: Record<string, string> = { H: 'Heimsieg', D: 'Remis', A: 'Auswärtssieg' };

function category(fp: number): { label: string; cls: 'catFav' | 'catMid' | 'catFifty' } {
  if (fp >= 0.70) return { label: 'Favorit', cls: 'catFav' };
  if (fp >= 0.55) return { label: 'Kante', cls: 'catMid' };
  return { label: '50/50', cls: 'catFifty' };
}

export function MatchCard({ home, away, kickoff, result, homeLogo, awayLogo, topTip, onClick }: Props) {
  const [hg, ag] = (result.tipp ?? '?').split(':').map(Number);
  const isAdjusted = result.adjusted;
  const cat = category(result.fp);

  return (
    <button className={styles.card} onClick={onClick} type="button">
      <header className={styles.header}>
        <span className={styles.meta}>{kickoff}</span>
        <div className={styles.badges}>
          {topTip && <span className={styles.badge}>TOP-TIPP</span>}
          <span className={`${styles.badge} ${styles[cat.cls]}`}>{cat.label}</span>
          {result.drawBlocked && <span className={`${styles.badge} ${styles.badgeInfo}`}>X gesperrt</span>}
          {result.goalRuleApplied && <span className={`${styles.badge} ${styles.badgeInfo}`}>⚽</span>}
          {result.favScoreRuleApplied && <span className={`${styles.badge} ${styles.badgeInfo}`}>2+</span>}
          {isAdjusted && <span className={`${styles.badge} ${styles.badgeMono}`}>🔀</span>}
        </div>
      </header>

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
          <div className={styles.scoreValue} data-numeric>
            {isNaN(hg) ? '?' : hg}:{isNaN(ag) ? '?' : ag}
          </div>
          <div className={styles.scoreLabel}>{OUTCOME_LABEL[result.wo] ?? 'Prognose'}</div>
        </div>
      </div>

      <ProbabilityBar home={result.pH} draw={result.pD} away={result.pA} />
    </button>
  );
}
