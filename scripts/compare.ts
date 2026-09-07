#!/usr/bin/env node
// Gepaarter Vergleich zweier Ruecktest-Laeufe (Ausgaben von backtest.ts --out).
//
//   npm run backtest -- --seasons 2023,2024,2025 --out .cache/runs/default.json
//   npm run backtest -- --seasons 2023,2024,2025 --params rho=-0.13 --out .cache/runs/rho13.json
//   npm run compare -- .cache/runs/default.json .cache/runs/rho13.json
//
// Warum: Zwei Modellvarianten unterscheiden sich im Log-Loss oft nur in der
// vierten Stelle. Ob das Signal oder Rauschen ist, sagt nur die Verteilung der
// JE-SPIEL-Differenzen -- gepaart, weil beide Varianten dieselben Spiele
// sehen. Der Bootstrap gegen die Liga-Poisson-Basis im Ruecktest beantwortet
// diese Frage nicht. Ausgegeben werden Mittelwert, 95%-Bootstrap-Intervall
// und ein Vorzeichentest je Metrik, dazu die Aufteilung je Saison
// (v2.1, Abschnitt 14.4: nicht von einer einzelnen Saison getragen).

import { readFile } from 'node:fs/promises';
import { actualOutcome, brier, logLoss, rps } from '../src/evaluation/metrics.ts';
import { tipPoints } from '../src/model/decision.ts';
import type { ExportFile, ExportRow } from './backtest.ts';

const [fileA, fileB] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error('Aufruf: npm run compare -- <lauf-a.json> <lauf-b.json>   (Differenz = B - A, negativ = B besser bei Verlustmassen)');
  process.exit(2);
}

const f4 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(5);

function bootstrapCI(diffs: number[], B = 4000): [number, number] {
  let seed = 424242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const means: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rnd() * diffs.length)]; means.push(s / diffs.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(B * 0.025)], means[Math.floor(B * 0.975)]];
}

/** Zweiseitiger Vorzeichentest (Normalapproximation) auf den Nicht-Null-Differenzen. */
function signTest(diffs: number[]): { neg: number; pos: number; p: number } {
  const neg = diffs.filter(d => d < -1e-12).length, pos = diffs.filter(d => d > 1e-12).length;
  const n = neg + pos;
  if (n === 0) return { neg, pos, p: 1 };
  const z = Math.abs(neg - pos) / Math.sqrt(n);
  const p = 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2)));
  return { neg, pos, p };
}
function erf(x: number): number {
  // Abramowitz-Stegun 7.1.26, Fehler < 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

interface Metric { name: string; value: (r: ExportRow) => number; lowerBetter: boolean }
const metrics: Metric[] = [
  { name: 'Log-Loss 1X2', value: r => logLoss(r.probs, actualOutcome(r.actual.home, r.actual.away)), lowerBetter: true },
  { name: 'Brier', value: r => brier(r.probs, actualOutcome(r.actual.home, r.actual.away)), lowerBetter: true },
  { name: 'RPS', value: r => rps(r.probs, actualOutcome(r.actual.home, r.actual.away)), lowerBetter: true },
  { name: '1X2-Treffer', value: r => { const p = r.probs; const a: 'H' | 'D' | 'A' = p.H >= p.D && p.H >= p.A ? 'H' : p.D >= p.A ? 'D' : 'A'; return a === actualOutcome(r.actual.home, r.actual.away) ? 1 : 0; }, lowerBetter: false },
  { name: 'exakt (conditional)', value: r => (r.conditional.home === r.actual.home && r.conditional.away === r.actual.away ? 1 : 0), lowerBetter: false },
  { name: 'Punkte tipGame', value: r => tipPoints(r.tipGame, r.actual), lowerBetter: false },
];

async function main(): Promise<void> {
  const a: ExportFile = JSON.parse(await readFile(fileA, 'utf8'));
  const b: ExportFile = JSON.parse(await readFile(fileB, 'utf8'));
  const label = (f: ExportFile) => `${f.modelVersion} ${Object.keys(f.overrides).length ? Object.entries(f.overrides).map(([k, v]) => `${k}=${v}`).join(',') : 'DEFAULT'}`;
  console.log(`A: ${label(a)}  (${a.createdAt}, ${a.rows.length} Spiele)`);
  console.log(`B: ${label(b)}  (${b.createdAt}, ${b.rows.length} Spiele)`);

  const byId = new Map(a.rows.map(r => [r.id, r]));
  const pairs: Array<[ExportRow, ExportRow]> = [];
  for (const rb of b.rows) { const ra = byId.get(rb.id); if (ra) pairs.push([ra, rb]); }
  if (pairs.length !== a.rows.length || pairs.length !== b.rows.length) {
    console.warn(`Achtung: nur ${pairs.length} gemeinsame Spiele -- Vergleich auf der Schnittmenge.`);
  }
  console.log(`Gepaart: ${pairs.length} Spiele. Differenz = B - A.\n`);

  for (const m of metrics) {
    const diffs = pairs.map(([ra, rb]) => m.value(rb) - m.value(ra));
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    const [lo, hi] = bootstrapCI(diffs);
    const st = signTest(diffs);
    const better = m.lowerBetter ? mean < 0 : mean > 0;
    const clear = lo > 0 || hi < 0;
    const verdict = clear ? (better ? 'B besser, Intervall ohne 0' : 'A besser, Intervall ohne 0') : 'nicht unterscheidbar';
    const perSeason = [...new Set(pairs.map(([ra]) => ra.season))].sort().map(s => {
      const d = pairs.filter(([ra]) => ra.season === s).map(([ra, rb]) => m.value(rb) - m.value(ra));
      return `${s}: ${f4(d.reduce((x, y) => x + y, 0) / d.length)}`;
    }).join('  ');
    console.log(`${m.name.padEnd(20)} Mittel ${f4(mean)}  95% [${f4(lo)}; ${f4(hi)}]  Vorzeichen -${st.neg}/+${st.pos} p=${st.p.toFixed(3)}  -> ${verdict}`);
    console.log(`${''.padEnd(20)} je Saison  ${perSeason}`);
  }
  console.log('\nLesart: "besser" heisst nur auf diesen Saisons. Fuer eine Freigabe zaehlt ein Zeitraum, den keine Parameterwahl gesehen hat (v2.1, 14.2).');
}

main().catch(err => { console.error(err); process.exit(1); });
