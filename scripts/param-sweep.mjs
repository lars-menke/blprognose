// Parameter-Sweep (optimiert: Kalibrierungen werden vorab gecacht)
// Aufruf: node scripts/param-sweep.mjs

const OLDB = 'https://api.openligadb.de';
const DC_RHO = -0.13;
const FORM_WEIGHT = 0.40;
const LG_DEF_H = 1.21;
const LG_DEF_A = 1.58;
const FORM_DECAY = 0.72;

function pois(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function dcTau(x, y, lH, lA) {
  if (x === 0 && y === 0) return 1 - lH * lA * DC_RHO;
  if (x === 0 && y === 1) return 1 + lH * DC_RHO;
  if (x === 1 && y === 0) return 1 + lA * DC_RHO;
  if (x === 1 && y === 1) return 1 - DC_RHO;
  return 1;
}
function poisMatrix(lH, lA) {
  const sc = {}; let tot = 0;
  for (let h = 0; h <= 7; h++) for (let a = 0; a <= 7; a++) {
    const p = pois(lH, h) * pois(lA, a) * dcTau(h, a, lH, lA); sc[`${h}:${a}`] = p; tot += p;
  }
  let pH = 0, pD = 0, pA = 0;
  for (const k in sc) { sc[k] /= tot; const [h, a] = k.split(':').map(Number); h > a ? pH += sc[k] : h === a ? pD += sc[k] : pA += sc[k]; }
  return { sc, pH, pD, pA };
}
const CODE_MAP = {
  'FC Bayern München': 'FCB', 'Bayern München': 'FCB', 'Borussia Dortmund': 'BVB',
  'TSG 1899 Hoffenheim': 'TSG', 'VfB Stuttgart': 'VFB', 'RB Leipzig': 'RBL',
  'Bayer 04 Leverkusen': 'B04', 'SC Freiburg': 'SCF', 'Eintracht Frankfurt': 'SGE',
  '1. FC Union Berlin': 'UNI', 'FC Augsburg': 'FCA', 'Hamburger SV': 'HSV',
  '1. FC Köln': 'KOE', '1. FSV Mainz 05': 'MAI', 'FSV Mainz 05': 'MAI', 'Mainz 05': 'MAI',
  'Borussia Mönchengladbach': 'BMG', 'VfL Wolfsburg': 'WOB', 'FC St. Pauli': 'STP',
  'SV Werder Bremen': 'SVW', 'Werder Bremen': 'SVW', '1. FC Heidenheim 1846': 'HEI',
};
const code = t => CODE_MAP[t.teamName] ?? CODE_MAP[t.shortName] ?? null;
const goals = m => { const r = m.matchResults?.find(x => x.resultTypeID === 2); return r ? { g1: r.pointsTeam1, g2: r.pointsTeam2 } : null; };
const outcome = (g1, g2) => g1 > g2 ? 'H' : g1 < g2 ? 'A' : 'D';
const DEF = { hGF: 1.3, hGA: 1.4, aGF: 1.1, aGA: 1.5 };

function buildStats(all, beforeNr) {
  const acc = {};
  for (const m of all) {
    if (m.group.groupOrderID >= beforeNr) continue;
    const g = goals(m); if (!g) continue;
    const h = code(m.team1), a = code(m.team2); if (!h || !a) continue;
    acc[h] ??= { hGF: 0, hGA: 0, hN: 0, aGF: 0, aGA: 0, aN: 0 };
    acc[a] ??= { hGF: 0, hGA: 0, hN: 0, aGF: 0, aGA: 0, aN: 0 };
    acc[h].hGF += g.g1; acc[h].hGA += g.g2; acc[h].hN++;
    acc[a].aGF += g.g2; acc[a].aGA += g.g1; acc[a].aN++;
  }
  const out = {};
  for (const [c, s] of Object.entries(acc))
    out[c] = { hGF: s.hN ? s.hGF / s.hN : DEF.hGF, hGA: s.hN ? s.hGA / s.hN : DEF.hGA, aGF: s.aN ? s.aGF / s.aN : DEF.aGF, aGA: s.aN ? s.aGA / s.aN : DEF.aGA };
  return out;
}
function buildForm(all, teamCode, beforeNr, home) {
  const byTime = (a, b) => new Date(b.matchDateTimeUTC ?? '').getTime() - new Date(a.matchDateTimeUTC ?? '').getTime();
  const fin = all.filter(m => m.group.groupOrderID < beforeNr && !!goals(m));
  const role = fin.filter(m => home ? code(m.team1) === teamCode : code(m.team2) === teamCode).sort(byTime).slice(0, 5);
  const prev = role.length >= 3 ? role : fin.filter(m => code(m.team1) === teamCode || code(m.team2) === teamCode).sort(byTime).slice(0, 5);
  if (!prev.length) return null;
  const w = prev.map((_, i) => Math.pow(FORM_DECAY, i));
  const tot = w.reduce((s, x) => s + x, 0);
  let gf = 0, ga = 0;
  prev.forEach((m, i) => { const g = goals(m), isH = code(m.team1) === teamCode, wi = w[i] / tot; gf += (isH ? g.g1 : g.g2) * wi; ga += (isH ? g.g2 : g.g1) * wi; });
  return { gf, ga };
}
function calcLambdas(h, a, hF, aF) {
  const eHGF = hF ? (1 - FORM_WEIGHT) * h.hGF + FORM_WEIGHT * hF.gf : h.hGF;
  const eHGA = hF ? (1 - FORM_WEIGHT) * h.hGA + FORM_WEIGHT * hF.ga : h.hGA;
  const eAGF = aF ? (1 - FORM_WEIGHT) * a.aGF + FORM_WEIGHT * aF.gf : a.aGF;
  const eAGA = aF ? (1 - FORM_WEIGHT) * a.aGA + FORM_WEIGHT * aF.ga : a.aGA;
  return { lH: Math.max(0.3, Math.min(4.5, eHGF * (eAGA / LG_DEF_A))), lA: Math.max(0.3, Math.min(4.5, eAGF * (eHGA / LG_DEF_H))) };
}
const logit = p => { const c = Math.max(0.001, Math.min(0.999, p)); return Math.log(c / (1 - c)); };
const sigmoid = x => 1 / (1 + Math.exp(-x));
function fitPlatt(samples, maxIter = 250, lr = 0.04) {
  let a = 1, b = 0; const n = samples.length;
  for (let i = 0; i < maxIter; i++) {
    let da = 0, db = 0;
    for (const s of samples) { const x = logit(s.p), e = sigmoid(a * x + b) - (s.hit ? 1 : 0); da += e * x; db += e; }
    a -= (lr / n) * da; b -= (lr / n) * db;
  }
  return { a, b };
}
function buildCalib(past) {
  if (past.length < 45) return null;
  const H = fitPlatt(past.map(r => ({ p: r.pH, hit: r.act === 'H' }))),
    D = fitPlatt(past.map(r => ({ p: r.pD, hit: r.act === 'D' }))),
    A = fitPlatt(past.map(r => ({ p: r.pA, hit: r.act === 'A' })));
  return { aH: H.a, bH: H.b, aD: D.a, bD: D.b, aA: A.a, bA: A.b };
}
function applyCalib(pH, pD, pA, c) {
  const cal = (p, a, b) => sigmoid(a * logit(p) + b);
  const cH = cal(pH, c.aH, c.bH), cD = cal(pD, c.aD, c.bD), cA = cal(pA, c.aA, c.bA), tot = cH + cD + cA;
  return { pH: cH / tot, pD: cD / tot, pA: cA / tot };
}
function shrinkToMean(pH, pD, pA) {
  const S = 0.88, s = p => 1 / 3 + (p - 1 / 3) * S;
  return { pH: s(pH), pD: s(pD), pA: s(pA) };
}

// ── Daten laden ───────────────────────────────────────────────────────────────
process.stdout.write('Lade Daten...');
const [r24, r25] = await Promise.all([fetch(`${OLDB}/getmatchdata/bl1/2024`), fetch(`${OLDB}/getmatchdata/bl1/2025`)]);
const prev = await r24.json(), all = await r25.json();
console.log(' fertig.');

const prevPool = [];
for (const m of prev.filter(m => m.matchIsFinished && !!goals(m))) {
  const nr = m.group.groupOrderID; if (nr < 5) continue;
  const h = code(m.team1), a = code(m.team2); if (!h || !a) continue;
  const g = goals(m), st = buildStats(prev, nr);
  const { lH, lA } = calcLambdas(st[h] ?? DEF, st[a] ?? DEF, buildForm(prev, h, nr, true), buildForm(prev, a, nr, false));
  const { pH, pD, pA } = poisMatrix(lH, lA);
  prevPool.push({ lH, lA, pH, pD, pA, act: outcome(g.g1, g.g2) });
}
const rawPool = [];
for (const m of all.filter(m => m.matchIsFinished && !!goals(m))) {
  const nr = m.group.groupOrderID; if (nr < 5) continue;
  const h = code(m.team1), a = code(m.team2); if (!h || !a) continue;
  const g = goals(m), st = buildStats(all, nr);
  const { lH, lA } = calcLambdas(st[h] ?? DEF, st[a] ?? DEF, buildForm(all, h, nr, true), buildForm(all, a, nr, false));
  const { sc, pH, pD, pA } = poisMatrix(lH, lA);
  rawPool.push({ nr, lH, lA, sc, pH, pD, pA, act: outcome(g.g1, g.g2), score: `${g.g1}:${g.g2}` });
}
console.log(`Vorjahr: ${prevPool.length}, 2025: ${rawPool.length} Spiele\n`);

// ── Kalibrierungen vorab cachen (nur einmal pro Spiel, unabhaengig von Parametern) ──
process.stdout.write('Berechne Kalibrierungen...');
const calibCache = rawPool.map(raw => {
  const past = [...prevPool, ...rawPool.filter(x => x.nr < raw.nr)];
  return buildCalib(past);
});
console.log(` ${calibCache.filter(Boolean).length}/${rawPool.length} aktiv.\n`);

// ── Grid Search ───────────────────────────────────────────────────────────────
function evaluate(BOOST_MAX, BOOST_RANGE, DT_BASE, DT_TIGHT, DT_FACTOR) {
  let correct = 0, drawCorrect = 0, drawTotal = 0, exactHit = 0, topCorrect = 0, topTotal = 0;
  for (let i = 0; i < rawPool.length; i++) {
    const raw = rawPool[i], calib = calibCache[i];
    const lambdaDiff = Math.abs(raw.lH - raw.lA);

    let bH = raw.pH, bD = raw.pD, bA = raw.pA;
    if (lambdaDiff < BOOST_RANGE) {
      const boost = BOOST_MAX * (1 - lambdaDiff / BOOST_RANGE);
      const boosted = Math.min(0.55, bD + boost);
      const actual = boosted - bD;
      const fromH = actual * bH / (bH + bA);
      bH = Math.max(0.05, bH - fromH);
      bA = Math.max(0.05, bA - (actual - fromH));
      bD = boosted;
      const tot = bH + bD + bA; bH /= tot; bD /= tot; bA /= tot;
    }

    let { pH, pD, pA } = calib ? applyCalib(bH, bD, bA, calib) : shrinkToMean(bH, bD, bA);
    const base = lambdaDiff < 0.25 ? DT_TIGHT : DT_BASE;
    const dt = calib ? base * DT_FACTOR : base;

    let wo = pH > pD && pH > pA ? 'H' : pA > pD && pA > pH ? 'A' : 'D';
    if (wo === 'D' && pD < dt) wo = pH >= pA ? 'H' : 'A';

    if (wo === raw.act) correct++;
    if (raw.act === 'D') { drawTotal++; if (wo === 'D') drawCorrect++; }
    const fp = Math.max(pH, pD, pA);
    if (fp >= 0.60) { topTotal++; if (wo === raw.act) topCorrect++; }
    const srt = Object.entries(raw.sc).sort((x, y) => y[1] - x[1]);
    for (const [s] of srt) { const [hi, ai] = s.split(':').map(Number), o = hi > ai ? 'H' : hi < ai ? 'A' : 'D'; if (o === wo) { if (s === raw.score) exactHit++; break; } }
  }
  const n = rawPool.length;
  const accN = correct / n, drawN = drawCorrect / (drawTotal || 1);
  return {
    acc: (accN * 100).toFixed(1),
    draw: (drawN * 100).toFixed(1),
    drawN: drawCorrect, drawTotal,
    exact: (exactHit / n * 100).toFixed(1),
    top: topTotal ? `${(topCorrect / topTotal * 100).toFixed(1)}/${topTotal}` : 'n/a',
    // Objective: maximise 1X2 accuracy + bonus for draw recognition (draws are ~24% of games)
    score: accN * 0.7 + drawN * 0.3,
  };
}

const BOOST_MAXS  = [0.05, 0.07, 0.10, 0.13, 0.15];
const BOOST_RANGES = [0.40, 0.50, 0.60, 0.70];
const DT_BASES    = [0.20, 0.23, 0.25];
const DT_TIGHTS   = [0.17, 0.20, 0.22];
const DT_FACTORS  = [0.55, 0.65, 0.72, 0.78];

console.log('Grid Search läuft...');
const results = [];
for (const bm of BOOST_MAXS)
  for (const br of BOOST_RANGES)
    for (const dt of DT_BASES)
      for (const dtt of DT_TIGHTS)
        for (const dtf of DT_FACTORS)
          results.push({ bm, br, dt, dtt, dtf, ...evaluate(bm, br, dt, dtt, dtf) });

results.sort((a, b) => b.score - a.score);
const total = BOOST_MAXS.length * BOOST_RANGES.length * DT_BASES.length * DT_TIGHTS.length * DT_FACTORS.length;
console.log(`${total} Kombinationen getestet.\n`);

console.log('Top 10 (gewichtet: 70% 1X2-Acc + 30% Draw-Recall):');
console.log('BoostMax  Range  DT_Base  DT_Tight  DTFactor | 1X2    Draw       Exact  TOP');
console.log('─'.repeat(82));
for (const r of results.slice(0, 10)) {
  console.log(
    `${String(r.bm).padEnd(9)} ${String(r.br).padEnd(6)} ${String(r.dt).padEnd(8)} ${String(r.dtt).padEnd(9)} ${String(r.dtf).padEnd(8)} | ` +
    `${r.acc}%  ${r.draw}% (${r.drawN}/${r.drawTotal})   ${r.exact}%  ${r.top}`
  );
}

const best = results[0];
console.log('\n══ EMPFEHLUNG ═══════════════════════════════════════════════════════════════');
console.log(`DRAW_BOOST_MAX        = ${best.bm}`);
console.log(`DRAW_BOOST_RANGE      = ${best.br}`);
console.log(`DRAW_THRESHOLD        = ${best.dt}`);
console.log(`DRAW_THRESHOLD_TIGHT  = ${best.dtt}`);
console.log(`effectiveDrawThreshold factor (calibrated) = ${best.dtf}`);
console.log(`\n1X2-Genauigkeit:  ${best.acc}%  (Baseline: 53.2%)`);
console.log(`Remis erkannt:    ${best.draw}%  (${best.drawN}/${best.drawTotal}, Baseline: 5.3%)`);
console.log(`Exakter Score:    ${best.exact}%`);
console.log(`TOP-Tipps:        ${best.top}`);
