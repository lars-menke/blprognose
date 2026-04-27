// Standalone backtest -- Node 18+
// Aufruf: node scripts/backtest-run.mjs

const OLDB = 'https://api.openligadb.de';
const DC_RHO = -0.13;
const FORM_WEIGHT = 0.40;
const DRAW_THRESHOLD = 0.23;
const DRAW_THRESHOLD_TIGHT = 0.20;
const LG_DEF_H = 1.21;
const LG_DEF_A = 1.58;
const FORM_DECAY = 0.72;

// ── Poisson ──────────────────────────────────────────────────────────────────
function pois(l, k) { let p=Math.exp(-l); for(let i=1;i<=k;i++) p*=l/i; return p; }
function dcTau(x,y,lH,lA) {
  if(x===0&&y===0) return 1-lH*lA*DC_RHO;
  if(x===0&&y===1) return 1+lH*DC_RHO;
  if(x===1&&y===0) return 1+lA*DC_RHO;
  if(x===1&&y===1) return 1-DC_RHO;
  return 1;
}
function poisMatrix(lH,lA) {
  const sc={};let tot=0;
  for(let h=0;h<=7;h++) for(let a=0;a<=7;a++){
    const p=pois(lH,h)*pois(lA,a)*dcTau(h,a,lH,lA); sc[`${h}:${a}`]=p; tot+=p;
  }
  let pH=0,pD=0,pA=0;
  for(const k in sc){sc[k]/=tot; const[h,a]=k.split(':').map(Number); h>a?pH+=sc[k]:h===a?pD+=sc[k]:pA+=sc[k];}
  return {sc,pH,pD,pA};
}

// ── Team codes ────────────────────────────────────────────────────────────────
const CODE_MAP = {
  'FC Bayern München':'FCB','Bayern München':'FCB','Borussia Dortmund':'BVB',
  'TSG 1899 Hoffenheim':'TSG','VfB Stuttgart':'VFB','RB Leipzig':'RBL',
  'Bayer 04 Leverkusen':'B04','SC Freiburg':'SCF','Eintracht Frankfurt':'SGE',
  '1. FC Union Berlin':'UNI','FC Augsburg':'FCA','Hamburger SV':'HSV',
  '1. FC Köln':'KOE','1. FSV Mainz 05':'MAI','FSV Mainz 05':'MAI','Mainz 05':'MAI',
  'Borussia Mönchengladbach':'BMG','VfL Wolfsburg':'WOB','FC St. Pauli':'STP',
  'SV Werder Bremen':'SVW','Werder Bremen':'SVW','1. FC Heidenheim 1846':'HEI',
};
const code = t => CODE_MAP[t.teamName] ?? CODE_MAP[t.shortName] ?? null;
const goals = m => { const r=m.matchResults?.find(x=>x.resultTypeID===2); return r?{g1:r.pointsTeam1,g2:r.pointsTeam2}:null; };
const outcome = (g1,g2) => g1>g2?'H':g1<g2?'A':'D';

// ── Stats + Form ──────────────────────────────────────────────────────────────
const DEF = {hGF:1.3,hGA:1.4,aGF:1.1,aGA:1.5};

function buildStats(all, beforeNr) {
  const acc={};
  for(const m of all){
    if(m.group.groupOrderID>=beforeNr) continue;
    const g=goals(m); if(!g) continue;
    const h=code(m.team1),a=code(m.team2); if(!h||!a) continue;
    acc[h]??={hGF:0,hGA:0,hN:0,aGF:0,aGA:0,aN:0};
    acc[a]??={hGF:0,hGA:0,hN:0,aGF:0,aGA:0,aN:0};
    acc[h].hGF+=g.g1;acc[h].hGA+=g.g2;acc[h].hN++;
    acc[a].aGF+=g.g2;acc[a].aGA+=g.g1;acc[a].aN++;
  }
  const out={};
  for(const[c,s] of Object.entries(acc))
    out[c]={hGF:s.hN?s.hGF/s.hN:DEF.hGF,hGA:s.hN?s.hGA/s.hN:DEF.hGA,aGF:s.aN?s.aGF/s.aN:DEF.aGF,aGA:s.aN?s.aGA/s.aN:DEF.aGA};
  return out;
}

function buildForm(all, teamCode, beforeNr, home) {
  const byTime=(a,b)=>new Date(b.matchDateTimeUTC??'').getTime()-new Date(a.matchDateTimeUTC??'').getTime();
  const fin=all.filter(m=>m.group.groupOrderID<beforeNr&&!!goals(m));
  const role=fin.filter(m=>home?code(m.team1)===teamCode:code(m.team2)===teamCode).sort(byTime).slice(0,5);
  const prev=role.length>=3?role:fin.filter(m=>code(m.team1)===teamCode||code(m.team2)===teamCode).sort(byTime).slice(0,5);
  if(!prev.length) return null;
  const w=prev.map((_,i)=>Math.pow(FORM_DECAY,i));
  const tot=w.reduce((s,x)=>s+x,0);
  let gf=0,ga=0;
  prev.forEach((m,i)=>{const g=goals(m),isH=code(m.team1)===teamCode,wi=w[i]/tot; gf+=(isH?g.g1:g.g2)*wi; ga+=(isH?g.g2:g.g1)*wi;});
  return {gf,ga};
}

function calcLambdas(h,a,hF,aF) {
  const eHGF=hF?(1-FORM_WEIGHT)*h.hGF+FORM_WEIGHT*hF.gf:h.hGF;
  const eHGA=hF?(1-FORM_WEIGHT)*h.hGA+FORM_WEIGHT*hF.ga:h.hGA;
  const eAGF=aF?(1-FORM_WEIGHT)*a.aGF+FORM_WEIGHT*aF.gf:a.aGF;
  const eAGA=aF?(1-FORM_WEIGHT)*a.aGA+FORM_WEIGHT*aF.ga:a.aGA;
  return {lH:Math.max(0.3,Math.min(4.5,eHGF*(eAGA/LG_DEF_A))),lA:Math.max(0.3,Math.min(4.5,eAGF*(eHGA/LG_DEF_H)))};
}

// ── Platt-Kalibrierung ────────────────────────────────────────────────────────
const logit = p => { const c=Math.max(0.001,Math.min(0.999,p)); return Math.log(c/(1-c)); };
const sigmoid = x => 1/(1+Math.exp(-x));

function fitPlatt(samples, maxIter=250, lr=0.04) {
  let a=1,b=0; const n=samples.length;
  for(let i=0;i<maxIter;i++){
    let da=0,db=0;
    for(const s of samples){const x=logit(s.p),e=sigmoid(a*x+b)-(s.hit?1:0); da+=e*x; db+=e;}
    a-=(lr/n)*da; b-=(lr/n)*db;
  }
  return {a,b};
}

function buildCalib(past) {
  if(past.length<45) return null;
  const H=fitPlatt(past.map(r=>({p:r.pH,hit:r.act==='H'})));
  const D=fitPlatt(past.map(r=>({p:r.pD,hit:r.act==='D'})));
  const A=fitPlatt(past.map(r=>({p:r.pA,hit:r.act==='A'})));
  return {aH:H.a,bH:H.b,aD:D.a,bD:D.b,aA:A.a,bA:A.b};
}

function applyCalib(pH,pD,pA,c) {
  const cal=(p,a,b)=>sigmoid(a*logit(p)+b);
  const cH=cal(pH,c.aH,c.bH),cD=cal(pD,c.aD,c.bD),cA=cal(pA,c.aA,c.bA),tot=cH+cD+cA;
  return {pH:cH/tot,pD:cD/tot,pA:cA/tot};
}

function shrinkToMean(pH,pD,pA) {
  const S=0.88,s=p=>1/3+(p-1/3)*S;
  return {pH:s(pH),pD:s(pD),pA:s(pA)};
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Lade Saison-Daten von OpenLigaDB...');
const r = await fetch(`${OLDB}/getmatchdata/bl1/2025`);
const all = await r.json();
const played = all.filter(m=>m.matchIsFinished&&!!goals(m));
console.log(`${played.length} gespielte Spiele geladen.\n`);

// Pass 1: Rohwahrscheinlichkeiten fuer alle Spiele berechnen
const rawPool = [];
const MIN_ST = 5;
for(const m of played){
  const nr=m.group.groupOrderID; if(nr<MIN_ST) continue;
  const h=code(m.team1),a=code(m.team2); if(!h||!a) continue;
  const g=goals(m), st=buildStats(all,nr);
  const {lH,lA}=calcLambdas(st[h]??DEF,st[a]??DEF,buildForm(all,h,nr,true),buildForm(all,a,nr,false));
  const {sc,pH,pD,pA}=poisMatrix(lH,lA);
  rawPool.push({nr,h,a,lH,lA,sc,pH,pD,pA,act:outcome(g.g1,g.g2),score:`${g.g1}:${g.g2}`});
}

// Pass 2: Rollierend kalibrieren (nur Daten VOR dem jeweiligen Spieltag)
const results = [];
for(const raw of rawPool){
  const past=rawPool.filter(x=>x.nr<raw.nr);
  const calib=buildCalib(past);
  let {pH,pD,pA}=calib?applyCalib(raw.pH,raw.pD,raw.pA,calib):shrinkToMean(raw.pH,raw.pD,raw.pA);

  const lambdaDiff=Math.abs(raw.lH-raw.lA);
  const base=lambdaDiff<0.25?DRAW_THRESHOLD_TIGHT:DRAW_THRESHOLD;
  const dt=calib?base*0.78:base;
  let wo=pH>pD&&pH>pA?'H':pA>pD&&pA>pH?'A':'D';
  if(wo==='D'&&pD<dt) wo=pH>=pA?'H':'A';

  const srt=Object.entries(raw.sc).sort((x,y)=>y[1]-x[1]);
  let tipp=null;
  for(const[s] of srt){const[hi,ai]=s.split(':').map(Number),o=hi>ai?'H':hi<ai?'A':'D'; if(o===wo){tipp=s;break;}}

  results.push({nr:raw.nr,h:raw.h,a:raw.a,wo,act:raw.act,tipp,score:raw.score,fp:Math.max(pH,pD,pA),pH,pD,pA});
}

// ── Ausgabe ───────────────────────────────────────────────────────────────────
const total=results.length;
const correct=results.filter(r=>r.wo===r.act).length;
const exactHit=results.filter(r=>r.tipp===r.score).length;
const topTips=results.filter(r=>r.fp>=0.60); // fp nach Kalibrierung niedriger -> 0.60
const topCorrect=topTips.filter(r=>r.wo===r.act).length;
const byAct={H:results.filter(r=>r.act==='H'),D:results.filter(r=>r.act==='D'),A:results.filter(r=>r.act==='A')};
const pct=(n,d)=>d?`${(n/d*100).toFixed(1)}%`:'n/a';

console.log('══════════════════════════════════════════');
console.log('  BACKTEST  (Spieltage 5–32, mit Kalibrierung)');
console.log('══════════════════════════════════════════');
console.log(`Spiele ausgewertet:       ${total}`);
console.log(`1X2-Genauigkeit:          ${pct(correct,total)}  (${correct}/${total})`);
console.log(`Exakter Score:            ${pct(exactHit,total)}  (${exactHit}/${total})`);
console.log(`TOP-Tipp (fp≥0.60):       ${pct(topCorrect,topTips.length)}  (${topCorrect}/${topTips.length})`);
console.log('──────────────────────────────────────────');
console.log(`Echte Heimsiege erkannt:  ${pct(byAct.H.filter(r=>r.wo==='H').length,byAct.H.length)}`);
console.log(`Echte Remis erkannt:      ${pct(byAct.D.filter(r=>r.wo==='D').length,byAct.D.length)}`);
console.log(`Echte Auswärtssiege:      ${pct(byAct.A.filter(r=>r.wo==='A').length,byAct.A.length)}`);
console.log('──────────────────────────────────────────');

// Kalibrierungscheck nach den Verbesserungen
console.log('\n  KALIBRIERUNG NACH VERBESSERUNGEN');
console.log('Bucket        | Pred  | Actual | n');
console.log('──────────────────────────────────────────');
const pts=results.flatMap(r=>[{p:r.pH,hit:r.act==='H'},{p:r.pD,hit:r.act==='D'},{p:r.pA,hit:r.act==='A'}]);
for(let i=0;i<10;i++){
  const lo=i*0.1,hi=(i+1)*0.1;
  const bin=pts.filter(p=>p.p>=lo&&p.p<hi);
  const hits=bin.filter(p=>p.hit).length;
  const pred=`${((lo+hi)/2*100).toFixed(0)}%`.padStart(5);
  const act2=bin.length?`${(hits/bin.length*100).toFixed(1)}%`.padStart(6):'  n/a ';
  console.log(`${`${(lo*100).toFixed(0).padStart(2)}–${(hi*100).toFixed(0)}%`.padEnd(12)}  | ${pred} | ${act2} | ${bin.length}`);
}

console.log('\n  GENAUIGKEIT PRO SPIELTAG');
console.log('══════════════════════════════════════════');
const byNr={};
results.forEach(r=>(byNr[r.nr]??=[]).push(r));
for(const nr of Object.keys(byNr).map(Number).sort((a,b)=>a-b)){
  const rows=byNr[nr],c=rows.filter(r=>r.wo===r.act).length;
  const bar='█'.repeat(c)+'░'.repeat(rows.length-c);
  console.log(`ST ${String(nr).padStart(2)}: ${pct(c,rows.length).padStart(6)}  ${bar}`);
}
