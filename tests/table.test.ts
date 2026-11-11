import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openPackedTable } from '../src/table.ts';
import { openPhaseTable } from '../src/kernel.ts';
import { packTable } from '../scripts/pack.ts';

const packed = readFileSync(new URL('../data/phases-2001-2100.lph', import.meta.url));
const legacy = readFileSync(new URL('./fixtures/legacy-moshier.u32le', import.meta.url));
const provenance = JSON.parse(readFileSync(new URL('../data/provenance.json', import.meta.url), 'utf8'));
const rawBytes = (view: DataView) => Buffer.from(view.buffer, view.byteOffset, view.byteLength);

test('all 4,953 legacy timestamps survive packing byte for byte', () => {
  const encoded = packTable(legacy);
  assert.equal(encoded.length, 9930);
  assert.deepEqual(rawBytes(openPackedTable(encoded)), legacy);
});

test('shipped data exactly matches the generating ephemeris output hash', () => {
  const decoded = rawBytes(openPackedTable(packed));
  assert.equal(packed.length, 9930);
  assert.equal(decoded.length, provenance.count * 4);
  assert.equal(createHash('sha256').update(decoded).digest('hex'), provenance.decodedSha256);
  assert.deepEqual(Buffer.from(packTable(decoded)), packed);
});

test('opening views honors non-zero byte offsets without reading surrounding bytes', () => {
  const padded = Buffer.alloc(packed.length + 17, 0xff);
  padded.set(packed, 7);
  const slice = padded.subarray(7, 7 + packed.length);
  assert.deepEqual(rawBytes(openPackedTable(slice)), rawBytes(openPackedTable(packed)));
  assert.deepEqual(rawBytes(openPackedTable(new DataView(slice.buffer, slice.byteOffset, slice.length))), rawBytes(openPackedTable(packed)));
  const rawPadded = Buffer.alloc(legacy.length + 3, 0xff);
  rawPadded.set(legacy, 3);
  assert.deepEqual(rawBytes(openPhaseTable(rawPadded.subarray(3))), legacy);
});

test('rejects truncated, oversized, corrupt, unknown-version and overflowing tables', () => {
  for (const length of [0, 3, 15, 31, 32, 33, packed.length - 1, packed.length - 2]) {
    assert.throws(() => openPackedTable(packed.subarray(0, length)), RangeError);
  }
  assert.throws(() => openPackedTable(Buffer.concat([packed, Buffer.from([0, 0])])), RangeError);
  for (const byte of [0, 3, 4, 7, 8, 12, 16, 31, 32, packed.length - 1]) {
    const corrupt = Buffer.from(packed);
    corrupt[byte] ^= 0xff;
    assert.throws(() => openPackedTable(corrupt), RangeError, `byte ${byte}`);
  }
  const overflow = Buffer.from(packed);
  overflow.writeUInt32LE(0xffffffff, 8);
  assert.throws(() => openPackedTable(overflow), /overflow/);
  assert.throws(() => openPhaseTable(new ArrayBuffer(0)), RangeError);
  assert.throws(() => openPhaseTable(new ArrayBuffer(9)), RangeError);
  assert.throws(() => openPhaseTable(new ArrayBuffer(8)), RangeError);
});
