import { describe, it, expect } from 'vitest';
import { attachMarkets, devigPower, findEvent, marketFor, normalizeTeamName, type OddsEvent } from '../src/market/odds.ts';
import type { MatchRecord } from '../src/types.ts';

const match: MatchRecord = {
  id: 1, league: 'bl1', season: 2026, matchday: 3, kickoff: '2026-09-12T13:30:00Z',
  homeId: 40, awayId: 7, homeName: 'FC Bayern München', awayName: 'Borussia Dortmund', homeShort: 'FCB', awayShort: 'BVB',
  finished: false, homeGoals: null, awayGoals: null,
};

function event(over: Partial<OddsEvent> = {}, quoteTime = '2026-09-12T10:00:00Z'): OddsEvent {
  return {
    id: 'ev1', sport_key: 'soccer_germany_bundesliga', commence_time: '2026-09-12T13:30:00Z',
    home_team: 'Bayern Munich', away_team: 'Borussia Dortmund',
    bookmakers: [
      { key: 'a', last_update: quoteTime, markets: [{ key: 'h2h', last_update: quoteTime, outcomes: [{ name: 'Bayern Munich', price: 1.5 }, { name: 'Draw', price: 4.5 }, { name: 'Borussia Dortmund', price: 6.0 }] }] },
      { key: 'b', last_update: quoteTime, markets: [{ key: 'h2h', last_update: quoteTime, outcomes: [{ name: 'Bayern Munich', price: 1.55 }, { name: 'Draw', price: 4.3 }, { name: 'Borussia Dortmund', price: 5.8 }] }] },
    ],
    ...over,
  };
}

const asOf = new Date('2026-09-12T12:00:00Z');

describe('Namensnormalisierung', () => {
  it('bringt OpenLigaDB- und Odds-API-Schreibweisen auf denselben Schluessel', () => {
    const pairs: Array<[string, string]> = [
      ['FC Bayern München', 'Bayern Munich'],
      ['1. FC Köln', 'FC Koln'],
      ['Borussia Mönchengladbach', 'Borussia Monchengladbach'],
      ['1. FC Heidenheim 1846', 'Heidenheim'],
      ['1. FSV Mainz 05', 'Mainz 05'],
      ['TSG 1899 Hoffenheim', 'TSG Hoffenheim'],
      ['SV Werder Bremen', 'Werder Bremen'],
      ['1. FC Union Berlin', 'Union Berlin'],
      ['Bayer 04 Leverkusen', 'Bayer Leverkusen'],
      ['FC St. Pauli', 'St. Pauli'],
    ];
    for (const [a, b] of pairs) expect(normalizeTeamName(a)).toEqual(normalizeTeamName(b));
  });
  it('haelt verschiedene Vereine auseinander', () => {
    expect(normalizeTeamName('Borussia Dortmund')).not.toEqual(normalizeTeamName('Borussia Mönchengladbach'));
  });
});

describe('Power-De-vig', () => {
  it('entfernt die Marge und normiert auf 1', () => {
    const r = devigPower(1.5, 4.5, 6.0);
    expect(r.method).toBe('power');
    expect(r.probs.H + r.probs.D + r.probs.A).toBeCloseTo(1, 12);
    expect(r.residual).toBeLessThan(1e-6);
    expect(r.exponent).toBeGreaterThan(1); // Overround > 0 -> c > 1
  });
  it('faellt bei Quoten ohne Marge (Summe q = 1) sauber zurueck', () => {
    // exakt faire Quoten: c = 1 loest es -- liegt im Intervall, power greift
    const r = devigPower(2, 4, 4);
    expect(r.probs.H).toBeCloseTo(0.5, 9);
    expect(r.probs.D).toBeCloseTo(0.25, 9);
  });
  it('Favorit-Longshot: power drueckt den Aussenseiter staerker als proportional', () => {
    const p = devigPower(1.2, 7, 15).probs;
    const q = [1 / 1.2, 1 / 7, 1 / 15], s = q[0] + q[1] + q[2];
    expect(p.A).toBeLessThan(q[2] / s);
  });
});

describe('Ereigniszuordnung', () => {
  it('findet das Ereignis ueber Namen und Anstoss innerhalb von 2 Stunden', () => {
    const r = findEvent(match, [event()], { asOf });
    expect('event' in r).toBe(true);
  });
  it('lehnt bei passenden Namen, aber >2h Anstossabweichung ab', () => {
    const r = findEvent(match, [event({ commence_time: '2026-09-12T17:00:00Z' })], { asOf });
    expect(r).toEqual({ reason: 'kickoff-mismatch' });
  });
  it('meldet fehlende Ereignisse fuer dieses Spiel, nicht fuer den ganzen Abruf', () => {
    const r = findEvent(match, [event({ home_team: 'Unbekannter FC' })], { asOf });
    expect(r).toEqual({ reason: 'no-event' });
  });
});

describe('Zeitregeln (Review-Fehler 4)', () => {
  it('akzeptiert Vorabquoten vor beiden Anstosszeiten und vor dem Stichtag', () => {
    const { market } = marketFor(match, [event()], { asOf });
    expect(market).not.toBeNull();
    expect(market!.bookmakerCount).toBe(2);
    expect(market!.method).toBe('power');
    expect(market!.probabilities.H).toBeGreaterThan(0.5);
  });
  it('reproduziertes 13:00/11:00-Beispiel: Quote 11:59 wird abgewiesen, weil das Marktspiel um 11:00 begann', () => {
    const m = { ...match, kickoff: '2026-09-12T13:00:00Z' };
    const ev = event({ commence_time: '2026-09-12T11:00:00Z' }, '2026-09-12T11:59:00Z');
    const { market, reason } = marketFor(m, [ev], { asOf: new Date('2026-09-12T12:00:00Z') });
    expect(market).toBeNull();
    expect(reason).toBe('no-usable-quotes');
  });
  it('verwirft Quoten mit Zeitstempel nach dem Stichtag (Look-ahead)', () => {
    const { market } = marketFor(match, [event({}, '2026-09-12T12:30:00Z')], { asOf });
    expect(market).toBeNull();
  });
  it('verwirft Quoten, die aelter als maxQuoteAge sind', () => {
    const { market, reason } = marketFor(match, [event({}, '2026-09-01T10:00:00Z')], { asOf, maxQuoteAgeMs: 24 * 3_600_000 });
    expect(market).toBeNull();
    expect(reason).toBe('no-usable-quotes');
  });
  it('liefert keinen Markt fuer ein bereits begonnenes Spiel', () => {
    const { reason } = marketFor(match, [event()], { asOf: new Date('2026-09-12T13:31:00Z') });
    expect(reason).toBe('match-started');
  });
  it('verlangt eine Mindestzahl Buchmacher', () => {
    const ev = event(); ev.bookmakers = ev.bookmakers.slice(0, 1);
    const { reason } = marketFor(match, [ev], { asOf, minBookmakers: 2 });
    expect(reason).toBe('too-few-bookmakers');
  });
  it('ignoriert Buchmacher mit fehlenden oder ungueltigen Preisen', () => {
    const ev = event();
    ev.bookmakers.push({ key: 'c', last_update: '2026-09-12T10:00:00Z', markets: [{ key: 'h2h', outcomes: [{ name: 'Bayern Munich', price: 0.9 }, { name: 'Draw', price: 4 }] }] });
    const { market } = marketFor(match, [ev], { asOf });
    expect(market!.bookmakerCount).toBe(2);
  });
});

describe('attachMarkets', () => {
  it('ordnet je Spiel zu und listet nicht zugeordnete Ereignisse als Alias-Hinweis', () => {
    const other = event({ id: 'ev2', home_team: 'Phantom United', away_team: 'Nobody FC' });
    const res = attachMarkets([match], [event(), other], { asOf });
    expect(res.markets.has(1)).toBe(true);
    expect(res.unmatchedEvents.map(e => e.eventId)).toEqual(['ev2']);
    expect(res.rejected).toHaveLength(0);
  });
});
