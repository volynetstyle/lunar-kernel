import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openPhaseTable } from '../src/kernel.ts';
import { checksum } from '../src/table.ts';

/** Exact lag-4 prediction: each phase is close to its previous lunation. */
export function packTable(raw: Uint8Array): Uint8Array {
  const view = openPhaseTable(raw);
  const count = view.byteLength / 4;
  if (count < 5) throw new RangeError('At least five events required');
  let base = Infinity;
  let max = 0;
  for (let i = 4; i < count; i++) {
    const delta = view.getUint32(i * 4, true) - view.getUint32((i - 4) * 4, true);
    base = Math.min(base, delta);
    max = Math.max(max, delta);
  }
  if (max - base > 65535) throw new RangeError('Lunation residual exceeds uint16');
  const out = new Uint8Array(24 + count * 2);
  const packed = new DataView(out.buffer);
  packed.setUint32(0, 0x3148504c, true); // LPH1
  packed.setUint32(4, count, true);
  packed.setUint32(8, base, true);
  packed.setUint32(12, checksum(raw), true);
  out.set(raw.subarray(0, 16), 16);
  for (let i = 4; i < count; i++) {
    packed.setUint16(24 + i * 2,
      view.getUint32(i * 4, true) - view.getUint32((i - 4) * 4, true) - base, true);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2] ?? '.cache/phases-2001-2100.u32le';
  const output = process.argv[3] ?? 'data/phases-2001-2100.lph';
  const raw = readFileSync(input);
  const packed = packTable(raw);
  writeFileSync(output, packed);
  console.log(`${raw.length} -> ${packed.length} bytes (${(100 * (1 - packed.length / raw.length)).toFixed(2)}% smaller), lossless`);
}
