import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createLunarCalendar, toUtcMs, type DateInput } from '../src/api.ts';
import { openPackedTable } from '../src/table.ts';
import { eventUtcMs } from '../src/kernel.ts';

const raw = readFileSync(new URL('../data/phases-2001-2100.lph', import.meta.url));
const lunar = createLunarCalendar(raw);
const table = openPackedTable(raw);

test('one-call API accepts ISO, offset, date-only, Date and Unix milliseconds', () => {
  const expected = lunar.at('2026-11-11T12:00:00Z');
  for (const input of ['2026-11-11T14:00:00+02:00', new Date('2026-11-11T12:00:00Z'), Date.UTC(2026, 10, 11, 12)]) {
    assert.deepEqual(lunar.at(input), expected);
  }
  assert.deepEqual(lunar.at('2026-11-11'), lunar.at('2026-11-11T00:00:00Z'));
  assert.equal(toUtcMs('2024-02-29'), Date.UTC(2024, 1, 29));
  assert.equal(toUtcMs('2026-11-11T12:00:00.123Z'), Date.UTC(2026, 10, 11, 12, 0, 0, 123));
  assert.equal(typeof lunar.at()?.ageDays, 'number');
});

test('rejects ambiguous dates and impossible calendar dates', () => {
  const bad: unknown[] = ['', '2026-11-11T12:00:00', '11/11/2026', '2026-02-29', '2100-02-29',
    '2026-02-30T12:00:00Z', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-11-11T24:00:00Z', '2026-11-11T12:60:00Z', '2026-11-11T12:00:60Z',
    '2026-11-11T12:00:00+24:00', '2026-11-11T12:00:00+02:60', ' 2026-11-11 ',
    NaN, Infinity, -Infinity, 9e15, new Date(NaN), null, {}, true];
  for (const value of bad) assert.throws(() => lunar.at(value as DateInput), RangeError, String(value));
});

test('all principal events and the exclusive sentinel have correct API semantics', () => {
  const names = ['new', 'first-quarter', 'full', 'last-quarter'];
  for (let i = 0; i < table.byteLength / 4 - 1; i++) {
    const time = eventUtcMs(table, i);
    const phase = lunar.at(time)!;
    assert.equal(phase.phase, names[i % 4]);
    assert.equal(phase.previous.utc, new Date(time).toISOString());
    assert.equal(phase.next.utc, new Date(eventUtcMs(table, i + 1)).toISOString());
    if (i % 4 === 0) assert.equal(phase.ageDays, 0);
  }
  assert.equal(lunar.at(Date.parse(lunar.range.from) - 1), null);
  assert.equal(lunar.at(lunar.range.toExclusive), null);
  assert.ok(lunar.at(Date.parse(lunar.range.toExclusive) - 1));
  assert.ok(lunar.at('2001-01-01'));
  assert.ok(lunar.at('2100-12-31T23:59:59.999Z'));
});
