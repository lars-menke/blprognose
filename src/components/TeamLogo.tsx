import type { CSSProperties } from 'react';
import type { Club } from '../lib/clubs';
import styles from './TeamLogo.module.css';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  club: Club;
  logoUrl?: string;
  size?: Size;
};

const PIXEL: Record<Size, number> = { sm: 20, md: 28, lg: 40 };

export function TeamLogo({ club, logoUrl, size = 'sm' }: Props) {
  const px = PIXEL[size];
  const badgeStyle: CSSProperties = {
    width: px,
    height: px,
    background: club.color,
    color: club.textOnColor === 'dark' ? '#000' : '#fff',
    fontSize: Math.round(px * 0.36),
  };

  if (logoUrl) {
    return (
      <span className={styles.wrap} style={{ width: px, height: px }}>
        <img
          className={styles.img}
          src={logoUrl}
          alt={club.fullName}
          width={px}
          height={px}
          referrerPolicy="no-referrer"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <span className={styles.badge} style={badgeStyle} aria-hidden="true">
          {club.code}
        </span>
      </span>
    );
  }

  return (
    <span className={styles.badge} style={badgeStyle} aria-label={club.fullName}>
      {club.code}
    </span>
  );
}
