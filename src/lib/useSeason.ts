import { useEffect, useState } from 'react';
import { resolveCode } from './openligadb';
import { recalcMatches } from './poisson';
import { loadModelChain } from './modelChain';
import { FALLBACK_STATS, CLUBS } from './clubs';
import type { SeasonForecast, SeasonRow } from './season';

const SIMULATIONS = 5000;

function simulateSeason(
  table: Record<string, { pts: number; gf: number; ga: number }>,
  remaining: Array<{ home: string; away: string; pH: number; pD: number; pA: number }>,
): Record<string, { pos: number; titleP: number; clP: number; descP: number }> {
  const codes = Object.keys(table);
  const acc: Record<string, { pos: number[]; title: number; cl: number; desc: number }> = {};
  codes.forEach(c => { acc[c] = { pos: [], title: 0, cl: 0, desc: 0 }; });

  for (let s = 0; s < SIMULATIONS; s++) {
    const pts: Record<string, number> = {};
    const gd: Record<string, number> = {};
    codes.forEach(c => { pts[c] = table[c].pts; gd[c] = table[c].gf - table[c].ga; });

    for (const m of remaining) {
      const r = Math.random();
      if (r < m.pH) {
        pts[m.home] = (pts[m.home] ?? 0) + 3;
        gd[m.home] = (gd[m.home] ?? 0) + 1;
        gd[m.away] = (gd[m.away] ?? 0) - 1;
      } else if (r < m.pH + m.pD) {
        pts[m.home] = (pts[m.home] ?? 0) + 1;
        pts[m.away] = (pts[m.away] ?? 0) + 1;
      } else {
        pts[m.away] = (pts[m.away] ?? 0) + 3;
        gd[m.away] = (gd[m.away] ?? 0) + 1;
        gd[m.home] = (gd[m.home] ?? 0) - 1;
      }
    }

    const ranked = codes.slice().sort((a, b) => {
      const dp = (pts[b] ?? 0) - (pts[a] ?? 0);
      return dp !== 0 ? dp : (gd[b] ?? 0) - (gd[a] ?? 0);
    });

    ranked.forEach((c, i) => {
      acc[c].pos.push(i + 1);
      if (i === 0) acc[c].title++;
      if (i < 4) acc[c].cl++;
      if (i >= 16) acc[c].desc++;
    });
  }

  const result: Record<string, { pos: number; titleP: number; clP: number; descP: number }> = {};
  codes.forEach(c => {
    const a = acc[c];
    const avgPos = a.pos.reduce((s, v) => s + v, 0) / (a.pos.length || 1);
    result[c] = {
      pos: Math.round(avgPos),
      titleP: a.title / SIMULATIONS,
      clP: a.cl / SIMULATIONS,
      descP: a.desc / SIMULATIONS,
    };
  });
  return result;
}

export function useSeason() {
  const [data, setData] = useState<SeasonForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const chain = await loadModelChain();
        const all = chain.all;
        const maxNr = Math.max(...all.map(m => m.group.groupOrderID));

        const table: Record<string, { pts: number; gf: number; ga: number; played: number }> = {};
        for (const m of all.filter(m => m.matchIsFinished)) {
          const hC = resolveCode(m.team1), aC = resolveCode(m.team2);
          if (!hC || !aC) continue;
          if (!CLUBS[hC] || !CLUBS[aC]) continue;
          const res = m.matchResults?.find(r => r.resultTypeID === 2);
          if (!res) continue;
          const g1 = res.pointsTeam1, g2 = res.pointsTeam2;
          for (const [c, gf, ga] of [[hC, g1, g2], [aC, g2, g1]] as [string, number, number][]) {
            if (!table[c]) table[c] = { pts: 0, gf: 0, ga: 0, played: 0 };
            table[c].played++;
            table[c].gf += gf;
            table[c].ga += ga;
            table[c].pts += gf > ga ? 3 : gf === ga ? 1 : 0;
          }
        }

        // Restprogramm aus derselben Rechenkette wie der Spieltag-Tab:
        // Kaltstart-geglaettete Statistik, Marktquoten fuer angesetzte Partien,
        // Platt-Kalibrierung. Kein Parallelmodell (WM-Lektion).
        const remaining: Array<{ home: string; away: string; pH: number; pD: number; pA: number }> = [];
        for (let nr = 1; nr <= maxNr; nr++) {
          const entries = chain.matchesByMatchday[nr];
          if (!entries?.length) continue;
          // Nur noch nicht gespielte Partien simulieren -- beendete stecken
          // bereits in der Tabelle und wuerden sonst doppelt zaehlen.
          const open = entries.filter(e => e.actual === null);
          if (!open.length) continue;
          const stData = chain.stByMatchday[nr] ?? {};
          const calcMap = recalcMatches(open, stData, FALLBACK_STATS, chain.calib);
          for (const e of open) {
            const r = calcMap[e.id];
            if (r) remaining.push({ home: e.home, away: e.away, pH: r.pH, pD: r.pD, pA: r.pA });
          }
        }

        const sim = simulateSeason(table, remaining);

        const currentRanked = Object.entries(table)
          .sort(([, a], [, b]) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga))
          .map(([code], i) => ({ code, pos: i + 1 }));

        const rows: SeasonRow[] = currentRanked
          .filter(({ code }) => CLUBS[code])
          .map(({ code, pos }) => ({
            code,
            pos,
            projPos: sim[code]?.pos ?? pos,
            pts: table[code]?.pts ?? 0,
            titleP: sim[code]?.titleP ?? 0,
            clP: sim[code]?.clP ?? 0,
            descP: sim[code]?.descP ?? 0,
          }))
          .sort((a, b) => a.projPos - b.projPos);

        const champion = rows[0];
        const runnerUps = rows.slice(1, 3).map(r => CLUBS[r.code]?.name ?? r.code).join(' · ');
        const clSecure = rows.filter(r => r.clP > 0.95).map(r => CLUBS[r.code]?.name ?? r.code).join(', ');
        const lastPlace = rows[rows.length - 1];

        setData({
          hero: {
            title: CLUBS[champion.code]?.name ?? champion.code,
            titleP: champion.titleP,
            runnersUp: runnerUps,
            clSecure: clSecure || '-',
            lastPlaceP: lastPlace.descP,
          },
          rows,
        });
      } catch (e) {
        console.error('useSeason:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { data, loading };
}
