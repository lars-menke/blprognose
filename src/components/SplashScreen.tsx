import { useEffect, useState } from 'react';
import styles from './SplashScreen.module.css';

type Props = {
  onDone: () => void;
};

export function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'out'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 300);
    const t2 = setTimeout(() => setPhase('out'), 2200);
    const t3 = setTimeout(() => onDone(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const visible = phase !== 'enter';

  return (
    <div className={`${styles.splash} ${phase === 'out' ? styles.splashOut : ''}`}>
      <div className={`${styles.icon} ${visible ? styles.iconVisible : ''}`}>
        <img src="/app-icon.svg" alt="" />
      </div>

      <div className={`${styles.title} ${visible ? styles.titleVisible : ''}`}>
        BL Prognose
      </div>

      <div className={`${styles.sub} ${visible ? styles.subVisible : ''}`}>
        Bundesliga 2025/26
      </div>

      <div className={`${styles.bar} ${phase === 'hold' || phase === 'out' ? styles.barActive : ''}`}>
        <div className={styles.barFill} />
      </div>
    </div>
  );
}
