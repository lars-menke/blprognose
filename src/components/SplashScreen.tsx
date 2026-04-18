import { useEffect, useState } from 'react';
import styles from './SplashScreen.module.css';

type Props = {
  onDone: () => void;
};

export function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase('hold'), 400);
    const outTimer = setTimeout(() => setPhase('out'), 2000);
    const doneTimer = setTimeout(() => onDone(), 2500);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`${styles.splash} ${phase === 'out' ? styles.splashOut : ''}`}>
      <div className={styles.content}>
        <div className={`${styles.logo} ${phase !== 'in' ? styles.logoVisible : ''}`}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="36" cy="36" r="36" fill="#1C1C1E" />
            <text x="36" y="50" textAnchor="middle" fontSize="32" fontWeight="700" fill="white" fontFamily="system-ui">⚽</text>
          </svg>
        </div>
        <div className={`${styles.title} ${phase !== 'in' ? styles.titleVisible : ''}`}>
          BL Prognose
        </div>
        <div className={`${styles.sub} ${phase !== 'in' ? styles.subVisible : ''}`}>
          Bundesliga 2025/26
        </div>
        <div className={`${styles.bar} ${phase === 'hold' || phase === 'out' ? styles.barActive : ''}`}>
          <div className={styles.barFill} />
        </div>
      </div>
    </div>
  );
}
