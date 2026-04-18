import type { CSSProperties } from 'react';
import type { Club } from '../lib/clubs';
import styles from './TeamLogo.module.css';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  club: Club;
  size?: Size;
};

const PIXEL: Record<Size, number> = { sm: 20, md: 28, lg: 48 };

export function TeamLogo({ club, size = 'sm' }: Props) {
  const px = PIXEL[size];
  const style: CSSProperties = {
    width: px,
    height: px,
    background: club.color,
    color: club.textOnColor === 'dark' ? '#000' : '#fff',
    fontSize: Math.round(px * 0.42),
  };
  return (
    <span className={styles.logo} style={style} aria-label={club.fullName}>
      {club.code}
    </span>
  );
}
