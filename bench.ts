import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { phaseEventIndex, phaseEventIndexFrom, eventUtcMs } from './src/kernel.ts';
import { openPackedTable } from './src/table.ts';

const raw = readFileSync(new URL('./data/phases-2001-2100.lph', import.meta.url));
const view = openPackedTable(raw);
const n = view.byteLength >>> 2;

// Randomized queries precomputed outside the timed region.
const times = new Float64Array(100_000);
const min = eventUtcMs(view, 0);
const span = eventUtcMs(view, n - 1) - min - 1;
let state = 123456789;
for (let i = 0; i < times.length; i++) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  times[i] = min + (state / 0x100000000) * span;
}

function measure(label: string, fn: () => number) {
  for (let i = 0; i < 10; i++) fn();
  const samples = [];
  let checksum = 0;
  for (let i = 0; i < 7; i++) {
    const a = performance.now();
    checksum = fn();
    samples.push(performance.now() - a);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label}: ${(times.length / samples[3] * 1000).toFixed(0)} queries/s (median of 7); checksum ${checksum}`);
}

measure('random / binary', () => {
  let checksum = 0;
  for (let i = 0; i < times.length; i++) {
    checksum += phaseEventIndex(view, times[i]);
  }
  return checksum;
});

measure('ascending 1d / cursor', () => {
  let checksum = 0;
  let hint = 0;
  const start = min + 2 * 86_400_000;
  for (let i = 0; i < times.length; i++) {
    const t = start + (i % 35000) * 86_400_000;
    hint = phaseEventIndexFrom(view, t, hint);
    checksum += hint;
  }
  return checksum;
});
