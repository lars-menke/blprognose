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
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="1024" height="1024" fill="#0A1628"/>
          <rect x="208" y="624" width="112" height="208" rx="22" fill="#F4C430"/>
          <rect x="368" y="496" width="112" height="336" rx="22" fill="#F4C430"/>
          <rect x="528" y="368" width="112" height="464" rx="22" fill="#F4C430"/>
          <rect x="688" y="432" width="112" height="400" rx="22" fill="#F4C430" fillOpacity="0.45"/>
          <path d="M240 688 Q 416 480 544 368 T 832 208" stroke="#FFFFFF" strokeWidth="28" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="832" cy="208" r="76" fill="#FFFFFF"/>
          <path d="M832 156 L880 191 L862 247 L802 247 L784 191 Z" fill="#0A1628"/>
        </svg>
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
