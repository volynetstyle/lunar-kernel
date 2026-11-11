import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BASE_UTC_MS } from '../src/kernel.ts';

// Input is the unmodified HTML from the URL recorded in the fixture metadata.
const html = readFileSync(process.argv[2] ?? '.cache/nasa-phases2001.html', 'utf8');
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const events: { time: number; phase: number }[] = [];
const years = new Set<number>();
let year = 0;
for (const block of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)) {
  for (const line of block[1].replace(/<[^>]*>/g, '').split(/\r?\n/)) {
    const match = /^\s(20\d{2}|2100)\s/.exec(line);
    if (match) { year = +match[1]; years.add(year); }
    if (!year) continue;
    for (let phase = 0; phase < 4; phase++) {
      const cell = line.slice(8 + phase * 18, 26 + phase * 18);
      const date = /^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2})/.exec(cell);
      if (date) events.push({
        time: Date.UTC(year, months.indexOf(date[1]), +date[2], +date[3], +date[4]), phase,
      });
    }
  }
}
events.sort((a, b) => a.time - b.time);
if (years.size !== 100 || events.length !== 4948
    || events.some((e, i) => e.phase !== (i + 1) % 4 || (i > 0 && e.time <= events[i - 1].time))) {
  throw new Error('Incomplete or unexpected NASA table layout');
}
const bytes = Buffer.alloc(events.length * 4);
events.forEach((event, i) => bytes.writeUInt32LE((event.time - BASE_UTC_MS) / 1000, i * 4));
mkdirSync('tests/fixtures', { recursive: true });
writeFileSync('tests/fixtures/nasa-2001-2100.u32le', bytes);
writeFileSync('tests/fixtures/nasa-source.json', JSON.stringify({
  source: 'https://eclipse.gsfc.nasa.gov/phase/phases2001.html',
  author: 'Fred Espenak / NASA GSFC',
  resolutionSeconds: 60, timeScale: 'UT', firstPhase: 1, count: events.length,
  htmlSha256: createHash('sha256').update(html).digest('hex'),
  dataSha256: createHash('sha256').update(bytes).digest('hex'),
}, null, 2) + '\n');
console.log(`Imported ${events.length} NASA events for ${years.size} years`);
