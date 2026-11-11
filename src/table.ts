import { openPhaseTable, type TableBytes } from './kernel.ts';

/** FNV-1a over decoded bytes: accidental corruption detection, not authentication. */
export function checksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

/** Decode once; hot queries still read exact uint32 seconds directly. */
export function openPackedTable(source: TableBytes): DataView {
  const bytes = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  const packed = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 34 || packed.getUint32(0, true) !== 0x3148504c) {
    throw new RangeError('Invalid LPH1 table');
  }
  const count = packed.getUint32(4, true);
  const base = packed.getUint32(8, true);
  if (count < 5 || bytes.length !== 24 + count * 2) {
    throw new RangeError('Invalid LPH1 length');
  }
  const raw = new Uint8Array(count * 4);
  const view = new DataView(raw.buffer);
  raw.set(bytes.subarray(16, 32));
  for (let i = 4; i < count; i++) {
    const seconds = view.getUint32((i - 4) * 4, true) + base + packed.getUint16(24 + i * 2, true);
    if (seconds > 0xffffffff) throw new RangeError('LPH1 timestamp overflow');
    view.setUint32(i * 4, seconds, true);
  }
  if (checksum(raw) !== packed.getUint32(12, true)) throw new RangeError('LPH1 checksum mismatch');
  return openPhaseTable(raw);
}
