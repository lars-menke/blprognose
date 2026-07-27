import { useEffect, useState } from 'react';
import { fetchSeason, resolveCode } from './openligadb';
import type { TableRow, Zone } from './standings';

function zoneFor(pos: number): Zone {
  if (pos <= 4) return 'cl';
  if (pos === 5) return 'el';
  if (pos === 6) return 'cf';
  if (pos === 16) return 'rel';
  if (pos >= 17) return 'desc';
  return '';
}

export function useStandings() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSeason().then(all => {
      const stats: Record<string, {
        pts: number; played: number; won: number; drawn: number; lost: number;
        gf: number; ga: number; results: ('S' | 'U' | 'N')[];
      }> = {};

      const finished = all
        .filter(m => m.matchIsFinished)
        .sort((a, b) => {
          const da = new Date(a.matchDateTimeUTC ?? a.matchDateTime ?? '').getTime();
          const db = new Date(b.matchDateTimeUTC ?? b.matchDateTime ?? '').getTime();
          return da - db;
        });

      for (const m of finished) {
        const hC = resolveCode(m.team1);
        const aC = resolveCode(m.team2);
        if (!hC || !aC) continue;
        const res = m.matchResults?.find(r => r.resultTypeID === 2);
        if (!res) continue;
        const g1 = res.pointsTeam1, g2 = res.pointsTeam2;

        for (const [code, gf, ga] of [[hC, g1, g2], [aC, g2, g1]] as [string, number, number][]) {
          if (!stats[code]) stats[code] = { pts: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, results: [] };
          const s = stats[code];
          s.played++;
          s.gf += gf;
          s.ga += ga;
          if (gf > ga) { s.won++; s.pts += 3; s.results.push('S'); }
          else if (gf === ga) { s.drawn++; s.pts += 1; s.results.push('U'); }
          else { s.lost++; s.results.push('N'); }
        }
      }

      const sorted = Object.entries(stats).sort(([, a], [, b]) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
        if (gdB !== gdA) return gdB - gdA;
        return b.gf - a.gf;
      });

      setRows(sorted.map(([code, s], i) => ({
        pos: i + 1,
        code,
        pts: s.pts,
        played: s.played,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        gf: s.gf,
        ga: s.ga,
        last5: s.results.slice(-5).reverse() as ('S' | 'U' | 'N')[],
        zone: zoneFor(i + 1),
      })));
    }).catch(e => console.error('useStandings:', e)).finally(() => setLoading(false));
  }, []);

  return { rows, loading };
}
