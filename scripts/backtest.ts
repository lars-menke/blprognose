#!/usr/bin/env node
// Historischer Roll-forward-Ruecktest (reiner Modellpfad, keine historischen
// Quoten). Fuer jeden Spieltag wird UNMITTELBAR vor dessen erster Partie ein
// Stichtag gesetzt; trainiert wird ausschliesslich mit Spielen davor.
//
//   npm run backtest -- --seasons 2023,2024,2025
//   npm run backtest -- --seasons 2023,2024,2025 --params halfLifeDays=180,rho=-0.13
//
// --params ueberschreibt einzelne Werte aus DEFAULT_PARAMS (Zahlen, true/false)
// fuer Ablationen. Der Berichtskopf zeigt die Abweichungen; ohne --params
// laeuft der freigegebene Satz.
// --out <datei.json> schreibt die Prognosen je Spiel, damit zwei Laeufe mit
// scripts/compare.ts gepaart verglichen werden koennen (der Bootstrap gegen
// die Basis sagt nichts ueber den Unterschied zweier Modellvarianten).
//
// Einordnung (Review 15.1/15.4): Das ist ein retrospektiver Test auf Saisons,
// die fruehere Parameterentscheidungen moeglicherweise schon gesehen haben --
// kein unangetasteter aeusserer Zeitraum. Er belegt keinen Vorteil gegenueber
// fairen Buchmacherquoten und kein optimales Marktgewicht. Die Version im
// Berichtskopf wird aus dem Code gelesen, nicht fest eingetragen.
//
// Braucht Netzwerkzugriff auf api.openligadb.de. Abgeschlossene Saisons
// werden unter .cache/openliga gecacht.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CachedSource } from '../src/data/cache.ts';
import { OpenLigaSource } from '../src/data/openliga.ts';
import { seasonOf } from '../src/data/season.ts';
import { buildForecasts, loadDataset, prepareSeasonModel, type Forecast } from '../src/forecast.ts';
import { MODEL_VERSION, DEFAULT_PARAMS, withParams, type ModelParams } from '../src/model/params.ts';
import { buildMatrix } from '../src/model/matrix.ts';
import { redistribute, temper } from '../src/model/blend.ts';
import { conditionalMode, globalMode, tipGameMode, tipPoints } from '../src/model/decision.ts';
import { actualOutcome, brier, logLoss, rps } from '../src/evaluation/metrics.ts';
import type { MatchRecord, OutcomeProbs, Score, ScoreMatrix } from '../src/types.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const now = new Date();
const defaultSeasons = [3, 2, 1].map(k => seasonOf(now) - k);
const seasons = (arg('seasons')?.split(',').map(Number) ?? defaultSeasons).filter(Number.isFinite);
const cacheDir = arg('cache') ?? '.cache/openliga';

function parseOverrides(spec: string | undefined): Partial<ModelParams> {
  const out: Record<string, number | boolean> = {};
  if (!spec) return out;
  for (const pair of spec.split(',')) {
    const [key, raw] = pair.split('=');
    if (!(key in DEFAULT_PARAMS)) throw new Error(`Unbekannter Parameter: ${key}`);
    const value = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Ungueltiger Wert fuer ${key}: ${raw}`);
    if (typeof value !== typeof (DEFAULT_PARAMS as Record<string, unknown>)[key]) throw new Error(`Typ passt nicht fuer ${key}: ${raw}`);
    out[key] = value;
  }
  return out as Partial<ModelParams>;
}
const overrides = parseOverrides(arg('params'));
const PARAMS = withParams(overrides);
const outFile = arg('out');

/** Je-Spiel-Zeile fuer den gepaarten Vergleich zweier Laeufe (scripts/compare.ts). */
export interface ExportRow {
  id: number;
  season: number;
  matchday: number;
  actual: Score;
  probs: OutcomeProbs;
  conditional: Score;
  global: Score;
  tipGame: Score;
}
export interface ExportFile {
  modelVersion: string;
  overrides: Record<string, number | boolean>;
  seasons: number[];
  createdAt: string;
  rows: ExportRow[];
}

interface Row {
  id: number;
  season: number;
  matchday: number;
  actual: Score;
  model: OutcomeProbs;
  matrix: ScoreMatrix;
  lambda: { home: number; away: number };
  conditional: Score;
  global: Score;
  tipGame: Score;
  base: OutcomeProbs;
  baseMatrix: ScoreMatrix;
  baseConditional: Score;
  baseGlobal: Score;
  baseLambda: { home: number; away: number };
}

interface Acc {
  n: number; outcome: number; exactCond: number; exactGlobal: number; exactTip: number;
  ll: number; llScore: number; brier: number; rps: number; maeGoals: number; points: number; drawPicks: number;
  scores: Map<string, number>;
}
const acc = (): Acc => ({ n: 0, outcome: 0, exactCond: 0, exactGlobal: 0, exactTip: 0, ll: 0, llScore: 0, brier: 0, rps: 0, maeGoals: 0, points: 0, drawPicks: 0, scores: new Map() });

function cell(m: ScoreMatrix, s: Score): number {
  return m.cells[s.home]?.[s.away] ?? 1e-12;
}

function add(a: Acc, p: OutcomeProbs, matrix: ScoreMatrix, lam: { home: number; away: number }, cond: Score, glob: Score, tip: Score, actual: Score): void {
  const out = actualOutcome(actual.home, actual.away);
  const arg: 'H' | 'D' | 'A' = p.H >= p.D && p.H >= p.A ? 'H' : p.D >= p.A ? 'D' : 'A';
  a.n++;
  if (arg === out) a.outcome++;
  if (cond.home === actual.home && cond.away === actual.away) a.exactCond++;
  if (glob.home === actual.home && glob.away === actual.away) a.exactGlobal++;
  if (tip.home === actual.home && tip.away === actual.away) a.exactTip++;
  a.ll += logLoss(p, out);
  a.llScore += -Math.log(Math.max(cell(matrix, actual), 1e-12));
  a.brier += brier(p, out);
  a.rps += rps(p, out);
  a.maeGoals += (Math.abs(lam.home - actual.home) + Math.abs(lam.away - actual.away)) / 2;
  a.points += tipPoints(tip, actual);
  if (cond.home === cond.away) a.drawPicks++;
  const key = `${cond.home}:${cond.away}`;
  a.scores.set(key, (a.scores.get(key) ?? 0) + 1);
}

const pct = (x: number) => `${(x * 100).toFixed(2)} %`;
const f4 = (x: number) => x.toFixed(5);

function printAcc(label: string, a: Acc): void {
  console.log(`${label.padEnd(28)} n=${a.n}  1X2 ${pct(a.outcome / a.n)}  exakt cond ${pct(a.exactCond / a.n)} | global ${pct(a.exactGlobal / a.n)} | tipGame ${pct(a.exactTip / a.n)}  LL ${f4(a.ll / a.n)}  LL-Score ${f4(a.llScore / a.n)}  Brier ${f4(a.brier / a.n)}  RPS ${f4(a.rps / a.n)}  MAE ${f4(a.maeGoals / a.n)}  Pkt/Spiel ${(a.points / a.n).toFixed(3)}  Remis-Tipps ${a.drawPicks}`);
}

async function main(): Promise<void> {
  console.log(`BLforecast Ruecktest -- Modell ${MODEL_VERSION} (aus src/model/params.ts), Stand ${now.toISOString()}`);
  const ov = Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(', ');
  console.log(`Saisons: ${seasons.join(', ')}  |  Pfad: reines Modell (keine historischen Quoten)  |  Cache: ${cacheDir}`);
  console.log(`Parameter: ${ov ? `ABWEICHEND ${ov}` : 'DEFAULT_PARAMS (freigegeben)'}\n`);

  const source = new CachedSource(new OpenLigaSource({ onIssues: (l, s, issues) => {
    for (const i of issues) if (i.level === 'error') console.warn(`[${l}/${s}] ${i.message}`);
  } }), cacheDir, now);

  const total = acc(), baseTotal = acc();
  const rows: Row[] = [];

  for (const season of seasons) {
    const data = await loadDataset(source, season);
    const matchdays = [...new Set(data.current.map(m => m.matchday))].sort((a, b) => a - b);
    const seasonAcc = acc(), seasonBase = acc();
    let notConverged = 0, maxClipped = 0;
    const t0 = Date.now();
    for (const md of matchdays) {
      const day = data.current.filter(m => m.matchday === md && m.finished);
      if (!day.length) continue;
      const first = Math.min(...day.map(m => Date.parse(m.kickoff)));
      const asOf = new Date(first - 60_000);
      const model = prepareSeasonModel(data, asOf, PARAMS);
      maxClipped = Math.max(maxClipped, model.diagnostics.final.clippedShare);
      // Prognosen fuer den Spieltag: Spiele gelten zum Stichtag als offen
      const asOpen: MatchRecord[] = day.map(m => ({ ...m, finished: false, homeGoals: null, awayGoals: null }));
      const forecasts: Forecast[] = buildForecasts(model, asOpen);

      // Einfache Liga-Poisson-Basis: ligaweite Heim-/Auswaertsintensitaeten aus demselben Trainingsfenster
      const train = [...data.previousBl1.flat(), ...data.current].filter(m => m.finished && Date.parse(m.kickoff) < asOf.getTime());
      const bH = train.reduce((s, m) => s + m.homeGoals!, 0) / train.length;
      const bA = train.reduce((s, m) => s + m.awayGoals!, 0) / train.length;
      const baseRaw = buildMatrix(bH, bA, PARAMS.rho);
      const baseMatrix = redistribute(baseRaw, temper(baseRaw.probs, PARAMS.modelTemperature));
      const baseCond = conditionalMode(baseMatrix), baseGlob = globalMode(baseMatrix);

      for (const f of forecasts) {
        const m = day.find(x => x.id === f.id)!;
        const actual = { home: m.homeGoals!, away: m.awayGoals! };
        const cond = { home: f.decisions.conditional.score.home, away: f.decisions.conditional.score.away };
        const glob = { home: f.decisions.global.home, away: f.decisions.global.away };
        rows.push({
          id: m.id, season, matchday: md, actual, model: f.probabilities, matrix: f.scoreMatrix, lambda: { home: f.lambda.home, away: f.lambda.away },
          conditional: cond, global: glob, tipGame: f.decisions.tipGame.score,
          base: baseMatrix.probs, baseMatrix, baseConditional: { home: baseCond.score.home, away: baseCond.score.away },
          baseGlobal: { home: baseGlob.home, away: baseGlob.away }, baseLambda: { home: bH, away: bA },
        });
        add(seasonAcc, f.probabilities, f.scoreMatrix, f.lambda, cond, glob, f.decisions.tipGame.score, actual);
        add(total, f.probabilities, f.scoreMatrix, f.lambda, cond, glob, f.decisions.tipGame.score, actual);
        const bTip = tipGameMode(baseMatrix, PARAMS.tipSearchMaxGoals).score;
        add(seasonBase, baseMatrix.probs, baseMatrix, { home: bH, away: bA }, { home: baseCond.score.home, away: baseCond.score.away }, { home: baseGlob.home, away: baseGlob.away }, bTip, actual);
        add(baseTotal, baseMatrix.probs, baseMatrix, { home: bH, away: bA }, { home: baseCond.score.home, away: baseCond.score.away }, { home: baseGlob.home, away: baseGlob.away }, bTip, actual);
      }
      if (!model.diagnostics.final.converged) {
        notConverged++;
        const d = model.diagnostics.final;
        console.warn(`  Spieltag ${md}: Fit nicht konvergiert (${d.iterations} Schritte, proj. Gradient ${d.gradientNorm.toExponential(2)}, Lambda ausserhalb Grenzen ${pct(d.clippedShare)} der Trainingsspiele)`);
      }
    }
    console.log(`Saison ${season}/${String((season + 1) % 100).padStart(2, '0')}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  Fits nicht konvergiert: ${notConverged}/${matchdays.length}  max. Anteil Lambda ausserhalb Grenzen: ${pct(maxClipped)}`);
    printAcc('  Modell', seasonAcc);
    printAcc('  Liga-Poisson-Basis', seasonBase);
  }

  console.log('\nGesamt');
  printAcc('  Modell', total);
  printAcc('  Liga-Poisson-Basis', baseTotal);

  // Gepaarter Bootstrap der Log-Loss-Differenz (Modell - Basis); zieht Spiele unabhaengig
  const diffs = rows.map(r => logLoss(r.model, actualOutcome(r.actual.home, r.actual.away)) - logLoss(r.base, actualOutcome(r.actual.home, r.actual.away)));
  const B = 2000; const means: number[] = [];
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rnd() * diffs.length)]; means.push(s / diffs.length); }
  means.sort((a, b) => a - b);
  console.log(`\nLog-Loss-Differenz Modell - Basis: ${f4(diffs.reduce((a, b) => a + b, 0) / diffs.length)}  95%-Bootstrap [${f4(means[Math.floor(B * 0.025)])}; ${f4(means[Math.floor(B * 0.975)])}]  (negativ = Modell besser)`);

  const top = [...total.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`Haeufigste Primaerscores (conditional): ${top.map(([k, v]) => `${k} ${pct(v / total.n)}`).join(', ')}  |  verschiedene Scores: ${total.scores.size}`);
  console.log('\nHinweis: kein Marktvergleich, kein unangetasteter Testzeitraum, keine innere Parametersuche. Siehe docs/review-4.1.1.md Abschnitt 15.');

  if (outFile) {
    const file: ExportFile = {
      modelVersion: MODEL_VERSION, overrides: overrides as Record<string, number | boolean>, seasons, createdAt: now.toISOString(),
      rows: rows.map(r => ({ id: r.id, season: r.season, matchday: r.matchday, actual: r.actual, probs: r.model, conditional: r.conditional, global: r.global, tipGame: r.tipGame })),
    };
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, JSON.stringify(file));
    console.log(`Prognosen je Spiel geschrieben: ${outFile} (${rows.length} Zeilen)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
