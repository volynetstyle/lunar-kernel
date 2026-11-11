/** Minimal lunar phase event lookup kernel (no allocations per query).
 *
 * Binary contract: little-endian Uint32 offsets in whole seconds since
 * 2000-01-01T00:00:00Z. Entries are successive major lunar phases beginning
 * with NEW, FIRST, FULL, LAST, and repeating. Last event is a sentinel.
 */

export const BASE_UTC_MS = 946684800000; // 2000-01-01T00:00:00.000Z
export const NEW = 0;
export const FIRST = 1;
export const FULL = 2;
export const LAST = 3;
export type TableBytes = ArrayBuffer | ArrayBufferView;

/** One view allocation on load; validated once, never copied. */
export function openPhaseTable(buffer: TableBytes): DataView {
  const view = ArrayBuffer.isView(buffer)
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);
  if (view.byteLength < 8 || view.byteLength % 4) throw new RangeError('Invalid phase table length');
  for (let i = 4; i < view.byteLength; i += 4) {
    const delta = view.getUint32(i, true) - view.getUint32(i - 4, true);
    if (delta < 345600 || delta > 864000) throw new RangeError('Invalid phase interval');
  }
  return view;
}

/** Event number immediately at/before utcMs; -1 outside valid range.
 * Last stored event is a right-hand sentinel (exclusive upper bound).
 * This is the hot path: no Date, arrays, closures, heap allocations, or trig.
 */
export function phaseEventIndex(view: DataView, utcMs: number, previousIndex = -1): number {
  const seconds = (utcMs - BASE_UTC_MS) / 1000;
  let lo = 0, hi = view.byteLength / 4 - 1;
  if (!(seconds >= view.getUint32(0, true) && seconds < view.getUint32(hi * 4, true))) return -1;

  if (Number.isInteger(previousIndex) && previousIndex >= 0 && previousIndex < hi
      && seconds >= view.getUint32(previousIndex * 4, true)) {
    lo = previousIndex;
    if (seconds < view.getUint32((lo + 1) * 4, true)) return lo;
    if (lo + 2 <= hi && seconds < view.getUint32((lo + 2) * 4, true)) return lo + 1;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (view.getUint32(mid * 4, true) <= seconds) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Optimized for chronological calendar grids: reuse previous event index.
 * If input time moves backward, fall back to binary search.
 */
export const phaseEventIndexFrom = phaseEventIndex;

/** Returns UTC milliseconds of the indexed event. */
export function eventUtcMs(view: DataView, eventIndex: number): number {
  return BASE_UTC_MS + view.getUint32(eventIndex << 2, true) * 1000;
}

/** 0 new, 1 first quarter, 2 full, 3 last quarter. */
export function majorPhase(eventIndex: number): number {
  return eventIndex & 3;
}

/** Seconds since last new moon using stored event times (not mean month). */
export function ageSeconds(
  view: DataView,
  utcMs: number,
  eventIndex: number,
): number {
  const lastNew = eventIndex - (eventIndex & 3);
  return (utcMs - eventUtcMs(view, lastNew)) / 1000;
}

/** Qualitative 8-phase label, NOT a physically defined event instant.
 * 0 new, 1 waxing crescent, 2 first quarter, 3 waxing gibbous,
 * 4 full, 5 waning gibbous, 6 last quarter, 7 waning crescent.
 * Boundaries are +/- 1/4 of each major-phase interval.
 */
export function phase8(
  view: DataView,
  utcMs: number,
  eventIndex: number,
): number {
  const start = eventUtcMs(view, eventIndex);
  const next = eventUtcMs(view, eventIndex + 1);
  const position = (utcMs - start) / (next - start);
  const base = (eventIndex & 3) << 1;
  if (position < 0.25) return base;
  if (position < 0.75) return (base + 1) & 7;
  return (base + 2) & 7;
}
