import { TeamLogo } from '../components/TeamLogo';
import { CLUBS } from '../lib/clubs';
import type { Club } from '../lib/clubs';
import type { SeasonForecast } from '../lib/season';
import styles from './SeasonScreen.module.css';

type Props = { data: SeasonForecast | null; loading: boolean; logos: Record<string, string> };

export function SeasonScreen({ data, loading, logos }: Props) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.large}>Saison</h1>
        <p className={styles.subtitle}>Prognose · Bundesliga 2026/27</p>
      </header>

      {loading && (
        <div className={styles.state}>
          <div className={styles.spinner} />
          <span>Berechne Prognose...</span>
        </div>
      )}

      {!loading && !data && (
        <div className={styles.state}>Keine Prognosedaten verfugbar</div>
      )}

      {!loading && data && (
        <>
          <div className={styles.hero}>
            <div className={styles.heroLabel}>Meisterschaft</div>
            <div className={styles.heroTitle}>{data.hero.title}</div>
            <div className={styles.heroProb}>{(data.hero.titleP * 100).toFixed(0)}%</div>
            <div className={styles.heroSub}>{data.hero.runnersUp}</div>
          </div>

          <div className={styles.sectionLabel}>Saisonprognose</div>
          <div className={styles.list}>
            {data.rows.map(r => {
              const club = CLUBS[r.code];
              const fallback: Club = club ?? { code: r.code, name: r.code, fullName: r.code, color: 'var(--system-gray)', textOnColor: 'light' };
              const delta = r.pos - r.projPos;
              return (
                <div key={r.code} className={styles.row}>
                  <div className={styles.projPos}>{r.projPos}</div>
                  <div className={styles.logoWrap}><TeamLogo club={fallback} logoUrl={logos[r.code]} size="sm" /></div>
                  <div className={styles.name}>{club?.name ?? r.code}</div>
                  <div className={styles.rowRight}>
                    {delta !== 0 && (
                      <span className={styles.delta} data-dir={delta > 0 ? 'up' : 'down'}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                    {r.clP > 0.01 && (
                      <span className={styles.clProb}>{(r.clP * 100).toFixed(0)}% CL</span>
                    )}
                    {r.descP > 0.05 && (
                      <span className={styles.descProb}>{(r.descP * 100).toFixed(0)}% Abst.</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.footer}>
            {data.rows.length} Teams · 5.000 Simulationen
          </div>
        </>
      )}
    </div>
  );
}
