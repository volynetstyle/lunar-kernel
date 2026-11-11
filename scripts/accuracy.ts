import { readFileSync, writeFileSync } from 'node:fs';
import { openPhaseTable, eventUtcMs } from '../src/kernel.ts';
import { openPackedTable } from '../src/table.ts';

const nasa = openPhaseTable(readFileSync('tests/fixtures/nasa-2001-2100.u32le'));
const legacy = openPhaseTable(readFileSync('tests/fixtures/legacy-moshier.u32le'));
const current = openPackedTable(readFileSync('data/phases-2001-2100.lph'));
const summarize = (view: DataView, start: number, end: number) => {
  let count = 0, sum = 0, squares = 0, max = 0, worstUtc = '';
  for (let i = 0; i < nasa.byteLength / 4; i++) {
    const time = eventUtcMs(nasa, i);
    const year = new Date(time).getUTCFullYear();
    if (year < start || year > end) continue;
    const delta = (eventUtcMs(view, i + 1) - time) / 1000;
    if (Math.abs(delta) > max) { max = Math.abs(delta); worstUtc = new Date(time).toISOString(); }
    sum += Math.abs(delta); squares += delta * delta; count++;
  }
  return { count, maxAbsoluteSeconds: max, meanAbsoluteSeconds: +(sum / count).toFixed(3),
    rmsSeconds: +Math.sqrt(squares / count).toFixed(3), worstUtc };
};
let maxModelChange = 0, changed = 0;
for (let i = 0; i < current.byteLength / 4; i++) {
  const delta = Math.abs(eventUtcMs(current, i) - eventUtcMs(legacy, i)) / 1000;
  maxModelChange = Math.max(maxModelChange, delta);
  if (delta) changed++;
}
const report = {
  reference: 'NASA / Fred Espenak, published UT rounded to minutes; discrepancies are not physical error bounds',
  modelChange: { events: current.byteLength / 4, changed, maxAbsoluteSeconds: maxModelChange },
  periods: Object.fromEntries([[2001, 2026], [2026, 2026], [2027, 2100], [2001, 2100]].map(([from, to]) =>
    [`${from}-${to}`, { legacy: summarize(legacy, from, to), current: summarize(current, from, to) }])),
};
writeFileSync('data/accuracy.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
