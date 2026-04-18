import styles from './ProbabilityBar.module.css';

type Props = {
  home: number; // 0..1
  draw: number; // 0..1
  away: number; // 0..1
  showLabels?: boolean;
};

export function ProbabilityBar({ home, draw, away, showLabels = true }: Props) {
  const toPct = (n: number) => Math.round(n * 100);
  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <div className={styles.home} style={{ width: `${home * 100}%` }} />
        <div className={styles.draw} style={{ width: `${draw * 100}%` }} />
        <div className={styles.away} style={{ width: `${away * 100}%` }} />
      </div>
      {showLabels && (
        <div className={styles.labels} data-numeric>
          <span>{toPct(home)}% H</span>
          <span>{toPct(draw)}% U</span>
          <span>{toPct(away)}% A</span>
        </div>
      )}
    </div>
  );
}
