// Deterministischer Zufall fuer die Saisonsimulation. Gleiche Eingaben =>
// gleiche Ziehungen, damit Ergebnisse reproduzierbar und Unterschiede
// zwischen zwei Laeufen auf Eingabeaenderungen zurueckfuehrbar sind.

/** mulberry32 -- klein, schnell, ausreichend gleichverteilt fuer Monte Carlo. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a ueber einen String -> 32-Bit-Seed. */
export function hashSeed(input: string): number {
  let h = 0x811C9DC5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
