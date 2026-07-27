import { TeamLogo } from '../components/TeamLogo';
import { CLUBS } from '../lib/clubs';
import type { Club } from '../lib/clubs';
import type { TableRow } from '../lib/standings';
import styles from './TableScreen.module.css';

type Props = { rows: TableRow[]; loading: boolean; logos: Record<string, string> };

const ZONE_COLORS: Record<string, string> = {
  cl: 'var(--system-blue)',
  el: 'var(--system-orange)',
  cf: 'var(--system-teal)',
  rel: 'var(--system-yellow)',
  desc: 'var(--system-red)',
};

export function TableScreen({ rows, loading, logos }: Props) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.large}>Tabelle</h1>
        <p className={styles.subtitle}>Bundesliga 2026/27</p>
      </header>

      {loading && (
        <div className={styles.state}>
          <div className={styles.spinner} />
          <span>Lade Tabelle...</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className={styles.state}>Keine Tabellendaten verfugbar</div>
      )}

      {!loading && rows.length > 0 && (
        <div className={styles.list}>
          {rows.map(r => {
            const club = CLUBS[r.code];
            const gd = r.gf - r.ga;
            const zoneColor = r.zone ? ZONE_COLORS[r.zone] : undefined;
            const fallback: Club = club ?? { code: r.code, name: r.code, fullName: r.code, color: 'var(--system-gray)', textOnColor: 'light' };
            return (
              <div key={r.code} className={styles.row}>
                {zoneColor && (
                  <div className={styles.zoneBar} style={{ background: zoneColor }} />
                )}
                <div className={styles.pos}>{r.pos}</div>
                <div className={styles.logoWrap}><TeamLogo club={fallback} logoUrl={logos[r.code]} size="sm" /></div>
                <div className={styles.name}>{club?.name ?? r.code}</div>
                <div className={styles.form}>
                  {r.last5.map((x, i) => (
                    <div key={i} className={styles.pip} data-r={x} />
                  ))}
                </div>
                <div className={styles.gd}>{gd > 0 ? `+${gd}` : gd}</div>
                <div className={styles.pts}>{r.pts}</div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className={styles.legend}>
          <LegendItem color={ZONE_COLORS.cl} label="Champions League" />
          <LegendItem color={ZONE_COLORS.el} label="Europa League" />
          <LegendItem color={ZONE_COLORS.cf} label="Conference League" />
          <LegendItem color={ZONE_COLORS.rel} label="Relegation" />
          <LegendItem color={ZONE_COLORS.desc} label="Abstieg" />
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
