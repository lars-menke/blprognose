import type { Club } from '../lib/clubs';
import { TeamLogo } from './TeamLogo';
import { ProbabilityBar } from './ProbabilityBar';
import styles from './MatchCard.module.css';

export type Prediction = {
  homeGoals: number;
  awayGoals: number;
  home: number;   // Wahrscheinlichkeit Heimsieg, 0..1
  draw: number;
  away: number;
};

type Props = {
  home: Club;
  away: Club;
  kickoff: string;    // z. B. "SA · 18:30"
  venue?: string;     // z. B. "Allianz Arena"
  prediction: Prediction;
  topTip?: boolean;
  onClick?: () => void;
};

export function MatchCard({ home, away, kickoff, venue, prediction, topTip, onClick }: Props) {
  const meta = venue ? `${kickoff} · ${venue}` : kickoff;

  return (
    <button className={styles.card} onClick={onClick} type="button">
      <header className={styles.header}>
        <span className={styles.meta}>{meta}</span>
        {topTip && <span className={styles.badge}>TOP-TIPP</span>}
      </header>

      <div className={styles.body}>
        <div className={styles.teams}>
          <div className={styles.team}>
            <TeamLogo club={home} size="sm" />
            <span className={styles.teamName}>{home.name}</span>
          </div>
          <div className={styles.team}>
            <TeamLogo club={away} size="sm" />
            <span className={styles.teamName}>{away.name}</span>
          </div>
        </div>

        <div className={styles.score}>
          <div className={styles.scoreValue} data-numeric>
            {prediction.homeGoals}:{prediction.awayGoals}
          </div>
          <div className={styles.scoreLabel}>Prognose</div>
        </div>
      </div>

      <ProbabilityBar
        home={prediction.home}
        draw={prediction.draw}
        away={prediction.away}
      />
    </button>
  );
}
