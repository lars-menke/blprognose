import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Club } from '../lib/clubs';
import styles from './TeamLogo.module.css';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  club: Club;
  logoUrl?: string;
  size?: Size;
};

const PIXEL: Record<Size, number> = { sm: 24, md: 32, lg: 44 };

export function TeamLogo({ club, logoUrl, size = 'sm' }: Props) {
  const [failed, setFailed] = useState(false);
  const px = PIXEL[size];

  if (logoUrl && !failed) {
    return (
      <img
        className={styles.logo}
        src={logoUrl}
        alt={club.fullName}
        width={px}
        height={px}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  const badgeStyle: CSSProperties = {
    width: px,
    height: px,
    background: club.color,
    color: club.textOnColor === 'dark' ? '#000' : '#fff',
    fontSize: Math.round(px * 0.36),
  };

  return (
    <span className={styles.badge} style={badgeStyle} aria-label={club.fullName}>
      {club.code}
    </span>
  );
}
