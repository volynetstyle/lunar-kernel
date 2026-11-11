import { ageSeconds, eventUtcMs, majorPhase, phase8, phaseEventIndex, type TableBytes } from './kernel.ts';
import { openPackedTable } from './table.ts';

const MAJOR = ['new', 'first-quarter', 'full', 'last-quarter'] as const;
const PHASES = ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous',
  'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'] as const;
export type DateInput = number | string | Date;

/** Numbers are Unix milliseconds. Date-only strings mean midnight UTC.
 * Date-time strings require Z or an explicit offset, never the host time zone. */
export function toUtcMs(date: DateInput): number {
  if (typeof date === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(date);
    if (!match) throw new RangeError('Use YYYY-MM-DD or an ISO date-time with Z or an offset');
    const [, year, month, day, hour = '0', minute = '0', second = '0', , zone] = match;
    const days = new Date(`${year}-${month}-01T00:00:00Z`);
    days.setUTCMonth(days.getUTCMonth() + 1, 0);
    if (+month < 1 || +month > 12 || +day < 1 || +day > days.getUTCDate()
        || +hour > 23 || +minute > 59 || +second > 59
        || (zone && zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) {
      throw new RangeError('Invalid calendar date');
    }
    date = Date.parse(date);
  }
  const ms = date instanceof Date ? date.getTime() : date;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || Math.abs(ms) > 8.64e15) {
    throw new RangeError('Invalid date');
  }
  return ms;
}

/** Load the shipped LPH1 asset once, then call .at(date). */
export function createLunarCalendar(data: TableBytes) {
  const table = openPackedTable(data);
  const event = (index: number) => ({
    phase: MAJOR[majorPhase(index)],
    utc: new Date(eventUtcMs(table, index)).toISOString(),
  });
  const range = Object.freeze({
    from: event(0).utc,
    toExclusive: event(table.byteLength / 4 - 1).utc,
  });
  return Object.freeze({
    range,
    /** null outside [range.from, range.toExclusive); invalid input throws. */
    at(date: DateInput = Date.now()) {
      const utcMs = toUtcMs(date);
      const index = phaseEventIndex(table, utcMs);
      if (index < 0) return null;
      const phaseIndex = phase8(table, utcMs, index);
      return {
        utc: new Date(utcMs).toISOString(),
        phase: PHASES[phaseIndex],
        phaseIndex,
        ageDays: ageSeconds(table, utcMs, index) / 86400,
        previous: event(index),
        next: event(index + 1),
      };
    },
  });
}

export type LunarCalendar = ReturnType<typeof createLunarCalendar>;
