#!/usr/bin/env node
// Wertet ein exportiertes BL-Lernprotokoll aus (Modell-Tab -> "Lernprotokoll
// exportieren"):
//   1. Alpha-Sweep der Markt-Gewichtung (Log-Loss, Brier, Trefferquote)
//   2. Dissens-Analyse: wie enden Spiele, bei denen Modell und Markt
//      unterschiedliche Sieger favorisieren? (Remis-Signal-Hypothese)
//
// Das sind die beiden Auswertungen, auf die MARKET_BLEND und
// DISSENS_DRAW_BOOST_MAX in src/lib/poisson.ts warten -- beide laufen
// aktuell auf unkalibrierten WM-Startwerten. Nach Spieltag 5 und in der
// Winterpause fahren (docs/bl-migration-playbook.md, Phase 6).
//
// Usage: node scripts/analyze-learnlog.mjs <pfad-zum-export.json>

import { readFileSync } from 'fs';

// Muss mit MARKET_BLEND in src/lib/poisson.ts uebereinstimmen -- der Wert,
// mit dem die geloggten lH_blend/lA_blend geschrieben wurden. Stimmt er
// nicht, ist die Markt-Lambda-Rekonstruktion unten falsch.
const LOGGED_ALPHA = 0.4;

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/analyze-learnlog.mjs <learnlog.json>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, 'utf8'));

// Normalisieren: v2-Eintraege (mit snapshots[]) auf den letzten SAUBEREN
// Pre-Match-Snapshot reduzieren. Zwei Filter gegen Look-ahead-Bias:
//   1. ts < kickoff (statische Planzeit; echte Anstosszeit kann abweichen)
//   2. Live-Verdacht: Snapshot, dessen Quoten gegenueber dem Vorgaenger in
//      einer Kategorie um > 12 Prozentpunkte springen, wird verworfen
//      (typisch fuer In-Play-Quoten, die vor dem Odds-Freeze durchrutschen).
const LIVE_JUMP = 12; // Prozentpunkte -- BL-Log speichert Quoten in Prozent

function lastCleanSnapshot(e) {
  const ko = Date.parse(e.kickoff ?? '') || Infinity;
  const pre = e.snapshots.filter(s => s.ts < ko);
  const pool = pre.length > 0 ? pre : e.snapshots;
  for (let i = pool.length - 1; i >= 0; i--) {
    const s = pool[i];
    const prev = pool[i - 1];
    if (!prev) return s; // erster Snapshot gilt immer als sauber
    const jump = Math.max(
      Math.abs(s.oddsH - prev.oddsH),
      Math.abs(s.oddsD - prev.oddsD),
      Math.abs(s.oddsA - prev.oddsA),
    );
    if (jump <= LIVE_JUMP) return s;
  }
  return pool[0];
}

const entries = raw
  .map(e => {
    if (Array.isArray(e.snapshots)) {
      const s = lastCleanSnapshot(e);
      return s ? { matchId: e.matchId, actual: e.actual, ...s } : null;
    }
    return e;
  })
  .filter(e => e && e.actual !== null && e.actual !== undefined);

console.log(`Auswertbare Spiele (mit Ergebnis): ${entries.length}\n`);
if (entries.length === 0) process.exit(0);

// --- Poisson + Dixon-Coles (identisch zu src/lib/poisson.ts) ---
const RHO = -0.13, M = 7;
function pmf(k, l) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function dcTau(x, y, lH, lA) {
  if (x === 0 && y === 0) return 1 - lH * lA * RHO;
  if (x === 0 && y === 1) return 1 + lH * RHO;
  if (x === 1 && y === 0) return 1 + lA * RHO;
  if (x === 1 && y === 1) return 1 - RHO;
  return 1;
}
function probs(lH, lA) {
  let pH = 0, pD = 0, pA = 0;
  for (let x = 0; x <= M; x++) for (let y = 0; y <= M; y++) {
    const p = pmf(x, lH) * pmf(y, lA) * dcTau(x, y, lH, lA);
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
  }
  const s = pH + pD + pA;
  return [pH / s, pD / s, pA / s];
}

const clamp = l => Math.max(0.3, Math.min(4.5, l));
const idx = { H: 0, D: 1, A: 2 };

// Markt-Lambda aus dem geloggten Blend rekonstruieren.
// blend = model*(1-a) + markt*a  ->  markt = model + (blend - model)/a
function marketLambda(model, blend) {
  return model + (blend - model) / LOGGED_ALPHA;
}
function lambdaAt(model, blend, a) {
  return clamp(model + a * (marketLambda(model, blend) - model));
}

// --- 1. Alpha-Sweep ---
function evalAlpha(a) {
  let ll = 0, br = 0, acc = 0;
  for (const m of entries) {
    const p = probs(lambdaAt(m.lH_model, m.lH_blend, a), lambdaAt(m.lA_model, m.lA_blend, a));
    const t = idx[m.actual];
    ll += -Math.log(Math.max(1e-9, p[t]));
    for (let k = 0; k < 3; k++) br += (p[k] - (k === t ? 1 : 0)) ** 2;
    if (p.indexOf(Math.max(...p)) === t) acc++;
  }
  const n = entries.length;
  return { ll: ll / n, br: br / n, acc: acc / n };
}

console.log('=== Alpha-Sweep (Markt-Gewichtung) ===');
console.log(`aktuell genutzt: alpha=${LOGGED_ALPHA} (MARKET_BLEND in src/lib/poisson.ts)\n`);
console.log('alpha | LogLoss | Brier  | Trefferquote');
let best = { a: 0, ll: Infinity };
for (let a = 0; a <= 1.0001; a += 0.1) {
  const r = evalAlpha(a);
  if (r.ll < best.ll) best = { a, ...r };
  const mark = Math.abs(a - LOGGED_ALPHA) < 1e-9 ? '  <- aktuell' : '';
  console.log(`${a.toFixed(1)}   | ${r.ll.toFixed(4)}  | ${r.br.toFixed(4)} | ${(r.acc * 100).toFixed(1)}%${mark}`);
}
let fine = { a: 0, ll: Infinity };
for (let a = 0; a <= 1.0001; a += 0.02) {
  const r = evalAlpha(a);
  if (r.ll < fine.ll) fine = { a, ...r };
}
console.log(`\nOptimum (grob): alpha=${best.a.toFixed(1)}  |  Optimum (fein): alpha=${fine.a.toFixed(2)}, LogLoss=${fine.ll.toFixed(4)}`);
console.log(`Aktueller Wert: alpha=${LOGGED_ALPHA}, LogLoss=${evalAlpha(LOGGED_ALPHA).ll.toFixed(4)}`);
console.log('\nAchtung: Das Tal ist erfahrungsgemaess flach. Nur umstellen, wenn der');
console.log('Abstand deutlich und die Stichprobe gross genug ist (Faustwert n > 90).');

// --- 2. Dissens-Analyse (Remis-Signal-Hypothese) ---
console.log('\n=== Dissens-Analyse: Modell vs. Markt uneinig ueber den Sieger ===');
function sides(m) {
  const [pH, , pA] = probs(clamp(m.lH_model), clamp(m.lA_model));
  return { modelW: pH >= pA ? 'H' : 'A', marketW: m.oddsH >= m.oddsA ? 'H' : 'A' };
}
let dis = 0, modelRight = 0, marketRight = 0, draws = 0;
for (const m of entries) {
  const { modelW, marketW } = sides(m);
  if (modelW === marketW) continue;
  dis++;
  const tag = m.actual === 'D' ? 'REMIS' : m.actual === modelW ? 'Modell richtig' : 'Markt richtig';
  if (m.actual === 'D') draws++;
  else if (m.actual === modelW) modelRight++;
  else marketRight++;
  console.log(`  ${String(m.matchId).padEnd(16)} Modell:${modelW} Markt:${marketW} -> ${m.actual} (${tag})`);
}
const einigEntries = entries.filter(m => { const s = sides(m); return s.modelW === s.marketW; });
const einig = einigEntries.length;
const einigDraws = einigEntries.filter(m => m.actual === 'D').length;

const disRate = dis ? draws / dis * 100 : 0;
const einigRate = einig ? einigDraws / einig * 100 : 0;
console.log(`\nDissens-Spiele: ${dis}  ->  Modell ${modelRight} | Markt ${marketRight} | Remis ${draws} (${disRate.toFixed(0)}%)`);
console.log(`Einigkeit-Spiele: ${einig}  ->  davon Remis ${einigDraws} (${einigRate.toFixed(0)}%)`);
console.log(`\nDISSENS_DRAW_BOOST_MAX steht aktuell auf 0.08 (unkalibrierter WM-Startwert).`);
if (dis < 10) {
  console.log(`Stichprobe zu klein (${dis} Dissens-Faelle) -- noch nicht nachjustieren.`);
} else if (disRate > einigRate + 10) {
  console.log(`Signal bestaetigt sich (${disRate.toFixed(0)}% vs. ${einigRate.toFixed(0)}%). Boost beibehalten oder leicht anheben.`);
} else {
  console.log(`Signal traegt in der BL nicht (${disRate.toFixed(0)}% vs. ${einigRate.toFixed(0)}%). Boost senken oder abschalten.`);
}
