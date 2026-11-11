import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openPackedTable } from '../src/table.ts';
import {
  openPhaseTable, phaseEventIndex, eventUtcMs, majorPhase,
  ageSeconds, phase8, phaseEventIndexFrom, BASE_UTC_MS,
} from '../src/kernel.ts';

const filename = fileURLToPath(new URL('../data/phases-2001-2100.lph', import.meta.url));
const contents = readFileSync(filename);
const buf = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength);
const phases = openPackedTable(buf);
const n = phases.byteLength >>> 2;

test('table span and size', () => {
  assert.ok(n > 4900 && n < 5000);
  assert.equal(phases.byteLength, 4 * n);
  assert.ok(eventUtcMs(phases, 0) < Date.UTC(2001, 0, 1));
  assert.ok(eventUtcMs(phases, n - 1) > Date.UTC(2101, 0, 1));
});

test('each event belongs to correct quarter and boundaries are exact', () => {
  for (let i = 0; i < n - 1; i++) {
    const t = eventUtcMs(phases, i);
    assert.equal(phaseEventIndex(phases, t), i);
    assert.equal(majorPhase(i), i % 4);
    assert.equal(phase8(phases, t, i), (i % 4) * 2);
    if (i) assert.equal(phaseEventIndex(phases, t - 1), i - 1);
    if (i % 4 === 0) assert.equal(ageSeconds(phases, t, i), 0);
  }
  assert.equal(phaseEventIndex(phases, eventUtcMs(phases, 0) - 1), -1);
  assert.equal(phaseEventIndex(phases, eventUtcMs(phases, n - 1)), -1);
  assert.equal(phaseEventIndex(phases, NaN), -1);
});

test('calendar cursor equals binary search across all events', () => {
  let previous = 0;
  for (let i = 0; i < n - 1; i++) {
    const t = eventUtcMs(phases, i) + 123;
    previous = phaseEventIndexFrom(phases, t, previous);
    assert.equal(previous, phaseEventIndex(phases, t));
  }
  const earlier = eventUtcMs(phases, 200);
  assert.equal(phaseEventIndexFrom(phases, earlier, previous), 200);
  for (const hint of [-1, NaN, Infinity, -Infinity, 1.5, n, 0, 4000]) {
    assert.equal(phaseEventIndexFrom(phases, earlier, hint), 200);
    assert.equal(phaseEventIndexFrom(phases, NaN, hint), -1);
    assert.equal(phaseEventIndexFrom(phases, eventUtcMs(phases, n - 1), hint), -1);
  }
});

test('binary search agrees with a linear oracle for 100,000 dates', () => {
  const first = eventUtcMs(phases, 0);
  const last = eventUtcMs(phases, n - 1);
  let index = 0;
  for (let sample = 0; sample < 100000; sample++) {
    const t = first + (last - first) * sample / 100000;
    while (t >= eventUtcMs(phases, index + 1)) index++;
    assert.equal(phaseEventIndex(phases, t), index);
  }
});

test('eight-label thresholds and true new-moon age at every interval', () => {
  for (let i = 0; i < n - 1; i++) {
    const start = eventUtcMs(phases, i), next = eventUtcMs(phases, i + 1);
    const a = start + (next - start) / 4, b = start + 3 * (next - start) / 4;
    assert.equal(phase8(phases, a - 1, i), (i & 3) * 2);
    assert.equal(phase8(phases, a, i), ((i & 3) * 2 + 1) & 7);
    assert.equal(phase8(phases, b, i), ((i & 3) * 2 + 2) & 7);
    assert.equal(ageSeconds(phases, start, i), (start - eventUtcMs(phases, i - (i % 4))) / 1000);
  }
});

test('UTC is independent of host timezone and can represent milliseconds', () => {
  const t = Date.parse('2026-10-10T15:50:00Z');
  const before = phaseEventIndex(phases, t - 86400_000);
  const newMoon = eventUtcMs(phases, before + 1);
  assert.ok(Math.abs(newMoon - t) <= 60_000);
  assert.equal(majorPhase(before + 1), 0);
  assert.ok(ageSeconds(phases, newMoon + 100, before + 1) >= 0);
  assert.equal(phaseEventIndex(phases, BASE_UTC_MS - 1), -1);
});

// Independent reference: Fred Espenak / NASA, 2026 phase table (minute precision).
// https://eclipse.gsfc.nasa.gov/phase/phases2001.html
const nasa2026 = [
  [0, '2026-01-18T19:52:00Z'], [1, '2026-01-26T04:47:00Z'],
  [2, '2026-02-01T22:09:00Z'], [3, '2026-02-09T12:43:00Z'],
  [0, '2026-02-17T12:01:00Z'], [1, '2026-02-24T12:28:00Z'],
  [2, '2026-03-03T11:38:00Z'], [3, '2026-03-11T09:39:00Z'],
  [0, '2026-04-17T11:52:00Z'], [1, '2026-04-24T02:32:00Z'],
  [2, '2026-05-01T17:23:00Z'], [3, '2026-05-09T21:10:00Z'],
  [0, '2026-08-12T17:37:00Z'], [1, '2026-08-20T02:46:00Z'],
  [2, '2026-08-28T04:18:00Z'], [3, '2026-09-04T07:51:00Z'],
  [0, '2026-10-10T15:50:00Z'], [1, '2026-10-18T16:13:00Z'],
  [2, '2026-10-26T04:12:00Z'], [3, '2026-11-01T20:28:00Z'],
  [0, '2026-12-09T00:52:00Z'], [1, '2026-12-17T05:43:00Z'],
  [2, '2026-12-24T01:28:00Z'], [3, '2026-12-30T18:59:00Z'],
] as const;

test('comparison against independent NASA 2026 timestamps', () => {
  let largest = 0;
  for (const [expectedPhase, iso] of nasa2026) {
    const official = Date.parse(iso);
    const i = phaseEventIndex(phases, official - 86400_000);
    assert.notEqual(i, -1);
    // The next expectedPhase event is between 0 and 2 days ahead.
    const candidate = eventUtcMs(phases, i + 1);
    assert.equal(majorPhase(i + 1), expectedPhase, iso);
    const seconds = Math.abs(candidate - official) / 1000;
    largest = Math.max(largest, seconds);
    assert.ok(seconds <= 120, `${iso}: deviation ${seconds} s`);
  }
  console.log(`NASA 2026 checkpoint count ${nasa2026.length}; max |Δ| ${largest}s`);
});

// The far future involves predicted ΔT, so divergence from an independent
// published UT table cannot be treated as an encoding error.
const futureRefs = [
  [0, '2050-01-23T04:57:00Z'], [1, '2050-01-29T20:48:00Z'],
  [2, '2050-02-06T20:47:00Z'], [3, '2050-02-14T22:10:00Z'],
  [0, '2099-01-21T09:07:00Z'], [1, '2099-01-29T14:38:00Z'],
  [2, '2099-02-05T12:48:00Z'], [3, '2099-02-12T05:08:00Z'],
  [0, '2100-01-10T12:55:00Z'], [1, '2100-01-18T12:34:00Z'],
  [2, '2100-01-26T02:49:00Z'], [3, '2100-02-01T21:16:00Z'],
] as const;

test('NASA spot checks in 2050 and 2099-2100: quantify future model drift', () => {
  let largest = 0;
  for (const [phase, iso] of futureRefs) {
    const expected = Date.parse(iso);
    const i = phaseEventIndex(phases, expected - 86_400_000) + 1;
    assert.equal(majorPhase(i), phase);
    const difference = Math.abs(eventUtcMs(phases, i) - expected) / 1000;
    largest = Math.max(largest, difference);
    assert.ok(difference < 180, `${iso}: ${difference}s`);
  }
  console.log(`NASA distant checkpoints ${futureRefs.length}; max |Δ| ${largest}s`);
});
