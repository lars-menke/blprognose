import { MatchCard } from '../components/MatchCard';
import { CLUBS } from '../lib/clubs';
import styles from './MatchdayScreen.module.css';

export function MatchdayScreen() {
  return (
    <div className={styles.screen}>
      <header className={styles.title}>
        <h1 className={styles.large}>Spieltag</h1>
        <p className={styles.subtitle}>27. Spieltag · Bundesliga</p>
      </header>

      <div className={styles.segmented} role="tablist">
        <button className={styles.segmentActive} role="tab" aria-selected="true">Heute</button>
        <button className={styles.segment} role="tab">Alle</button>
        <button className={styles.segment} role="tab">Favoriten</button>
      </div>

      <div className={styles.list}>
        <MatchCard
          home={CLUBS.FCB}
          away={CLUBS.BVB}
          kickoff="SA · 18:30"
          venue="Allianz Arena"
          topTip
          prediction={{ homeGoals: 2, awayGoals: 1, home: 0.54, draw: 0.22, away: 0.24 }}
        />
        <MatchCard
          home={CLUBS.RBL}
          away={CLUBS.B04}
          kickoff="SA · 15:30"
          prediction={{ homeGoals: 1, awayGoals: 2, home: 0.28, draw: 0.26, away: 0.46 }}
        />
        <MatchCard
          home={CLUBS.SGE}
          away={CLUBS.S04}
          kickoff="SO · 17:30"
          prediction={{ homeGoals: 2, awayGoals: 0, home: 0.62, draw: 0.23, away: 0.15 }}
        />
      </div>
    </div>
  );
}
