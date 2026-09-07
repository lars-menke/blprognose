// Datei-Cache fuer Saisonabrufe (Node, fuer Skripte). Abgeschlossene
// Saisons aendern sich nicht mehr und werden gecacht; die laufende Saison
// wird immer frisch geladen.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { League, MatchRecord } from '../types.ts';
import type { SeasonSource } from './openliga.ts';
import { seasonOf } from './season.ts';

export class CachedSource implements SeasonSource {
  constructor(private readonly inner: SeasonSource, private readonly dir: string, private readonly now: Date = new Date()) {}

  async loadSeason(league: League, season: number): Promise<MatchRecord[]> {
    const completed = season < seasonOf(this.now);
    const file = join(this.dir, `${league}-${season}.json`);
    if (completed) {
      try {
        return JSON.parse(await readFile(file, 'utf8')) as MatchRecord[];
      } catch { /* kein Cache -> laden */ }
    }
    const data = await this.inner.loadSeason(league, season);
    if (completed) {
      await mkdir(this.dir, { recursive: true });
      await writeFile(file, JSON.stringify(data));
    }
    return data;
  }
}
