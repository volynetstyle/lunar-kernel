import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openPhaseTable, eventUtcMs, phaseEventIndex, majorPhase } from '../src/kernel.ts';
import { openPackedTable } from '../src/table.ts';

test('all 4,948 NASA events across 2001–2100: phase order, coverage and measured discrepancies', () => {
  const bytes = readFileSync(new URL('./fixtures/nasa-2001-2100.u32le', import.meta.url));
  const source = JSON.parse(readFileSync(new URL('./fixtures/nasa-source.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.dataSha256);
  const reference = openPhaseTable(bytes);
  const current = openPackedTable(readFileSync(new URL('../data/phases-2001-2100.lph', import.meta.url)));
  assert.equal(reference.byteLength / 4, 4948);
  let max = 0, currentMax = 0;
  for (let i = 0; i < 4948; i++) {
    const time = eventUtcMs(reference, i);
    // Locate independently, then ensure no missing events in either sequence.
    const candidate = phaseEventIndex(current, time - 86400000) + 1;
    assert.equal(candidate, i + 1);
    assert.equal(majorPhase(candidate), (i + source.firstPhase) % 4);
    const delta = Math.abs(eventUtcMs(current, candidate) - time) / 1000;
    max = Math.max(max, delta);
    if (new Date(time).getUTCFullYear() <= 2026) currentMax = Math.max(currentMax, delta);
    assert.ok(delta <= 142, `NASA ${new Date(time).toISOString()}: ${delta} seconds`);
  }
  assert.equal(max, 142);
  assert.equal(currentMax, 40);
});
