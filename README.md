# Lunar calendar kernel

Principal lunar phases for **2001–2100**, with a small JavaScript/TypeScript API and a dependency-free Node HTTP server. Astronomy is calculated only when regenerating the data; the runtime performs table lookups.

| Runtime artifact | Bytes | Gzip | Brotli |
| --- | ---: | ---: | ---: |
| Phase data, `phases-2001-2100.lph` | 9,930 | 9,953 | 9,934 |
| Standalone kernel, `kernel.js` | 1,157 | 629 | 575 |
| Complete browser API, `lunar.js` | 2,943 | 1,391 | 1,275 |

Data is **49.88% smaller** than the original 19,812 bytes, with no compression error. The minified kernel is **8.03% smaller** than the original 1,258 bytes under the same esbuild settings. The complete API already includes the kernel; do not load both bundles. Run `npm run build` to reproduce current sizes in `dist/sizes.json`. Compression columns describe transport size, not additional shipped files.

There are **4,953 events**. The query range is `[2000-12-25T17:21:37Z, 2101-01-29T12:26:19Z)`, covering every date of 2001–2100. No runtime npm packages are required. TypeScript entry points need Node **22.6+**; `dist/` contains plain ESM. Use an actively supported Node LTS release in production (24 or 26); CI also checks the current Node 22 LTS release.

## Simple library API

Node, with `node --experimental-strip-types`:

```ts
import { readFileSync } from 'node:fs';
import { createLunarCalendar } from './src/api.ts';

const lunar = createLunarCalendar(readFileSync('./data/phases-2001-2100.lph'));
console.log(lunar.at('2026-11-11T12:00:00Z'));
```

Result:

```json
{
  "utc": "2026-11-11T12:00:00.000Z",
  "phase": "waxing-crescent",
  "phaseIndex": 1,
  "ageDays": 2.206863425925926,
  "previous": { "phase": "new", "utc": "2026-11-09T07:02:07.000Z" },
  "next": { "phase": "first-quarter", "utc": "2026-11-17T11:47:50.000Z" }
}
```

Browser, serving the contents of `dist/`:

```js
import { createLunarCalendar } from './lunar.js';

const response = await fetch('./data/phases-2001-2100.lph');
if (!response.ok) throw new Error(`Phase data: HTTP ${response.status}`);
const lunar = createLunarCalendar(await response.arrayBuffer());
console.log(lunar.at()); // now
```

`lunar.at(date)` accepts a `Date`, Unix **milliseconds**, `YYYY-MM-DD` (midnight UTC), or an ISO date-time with `Z` / an explicit offset. Impossible dates such as `2026-02-30`, invalid numbers, and date-times without a time zone throw `RangeError`. A valid date outside `lunar.range` returns `null`. The final sentinel is an exclusive upper bound.

`previous` is the principal event at or before the query; `next` is its successor. `ageDays` is measured from the actual preceding new moon. `phaseIndex` and `phase` map as follows:

| Index | Phase |
| ---: | --- |
| 0 | new |
| 1 | waxing-crescent |
| 2 | first-quarter |
| 3 | waxing-gibbous |
| 4 | full |
| 5 | waning-gibbous |
| 6 | last-quarter |
| 7 | waning-crescent |

These eight labels are conventional calendar categories, interpolated at the quarter and three-quarter points of each principal-phase interval. They do **not** give a physically exact illumination fraction or exact astronomical transitions between eight categories. Convert UTC instants to the viewer's local calendar date in the presentation layer.

## HTTP API

```bash
npm ci
npm run build
npm start
```

In another terminal:

```bash
curl "http://127.0.0.1:3000/phase?date=2026-11-11T12:00:00Z"
```

In Windows PowerShell with script execution disabled, use `npm.cmd` and `curl.exe`.

- `GET /phase?date=2026-11-11` — same JSON result as the library.
- `GET /phase` — current date/time.
- `GET /health` — status and supported range.
- Invalid date: **400**; valid date outside the table: **422**; unknown path: **404**; method other than GET: **405**.

The server binds to `127.0.0.1`, port `3000`; set `HOST` and `PORT` to change them (for example `HOST=0.0.0.0` in a container). For an internet-facing service, put it behind a reverse proxy providing TLS. The server handles SIGINT/SIGTERM by stopping new requests and closing existing connections. URL-encode `+` in time-zone offsets, for example with `curl --get --data-urlencode "date=2026-11-11T14:00:00+02:00" http://127.0.0.1:3000/phase`.

Deploy the generated `dist/` directory with Node: `node dist/server.js`. It contains its own ESM package marker and phase data, and does not require `node_modules`, Python, or the source tree. `npm run start:dev` runs the TypeScript server directly for development. Build output is ignored by Git; rebuild it from the lockfile before deployment.

## Accuracy and provenance

The shipped table uses **Swiss Ephemeris 2.10.03 / pyswisseph 2.10.3.2 with DE441-based Swiss files**. The files' DE number is recorded through the library, and their SHA-256 hashes are in `data/provenance.json`. The download script pins the official repository revision and verifies these hashes. Generation refuses silent fallback to another backend.

The model solves geocentric apparent ecliptic longitude differences of 0°, 90°, 180°, and 270°. Roots are found in UT1, then converted with `jdut1_to_utc`, instead of treating UT1 directly as UTC. Swiss's [time conversion documentation](https://www.astro.com/swisseph/swephprg.htm) describes this distinction. When future leap seconds are unknown, the library may return predicted UT1; exact civil UTC far into the future is unavailable in advance.

The [Swiss Ephemeris overview](https://www.astro.com/swisseph/swephinfo_e.htm) describes the precision of the file-backed model versus analytic Moshier. This is a model upgrade, not an adjustment to fit a rounded reference table. Relative to the legacy dataset, 3,740 instants change by at most **6 seconds**.

Whole-second storage adds at most **0.5 seconds of rounding relative to the computed solution**. Compression adds **zero** error. Neither establishes sub-second astronomical accuracy: future Earth rotation / Delta T prediction remains a limiting factor.

All **4,948 events** in [Fred Espenak's NASA table for 2001–2100](https://eclipse.gsfc.nasa.gov/phase/phases2001.html) are checked offline, including phase order and coverage:

| Period | Events | Legacy max | Current max | Legacy / current mean absolute difference |
| --- | ---: | ---: | ---: | ---: |
| 2001–2026 | 1,287 | 40 s | 40 s | 15.632 / 15.601 s |
| 2026 | 50 | 36 s | 37 s | 15.960 / 15.860 s |
| 2027–2100 | 3,661 | 144 s | 142 s | 48.703 / 48.950 s |
| 2001–2100 | 4,948 | 144 s | 142 s | 40.101 / 40.275 s |

NASA publishes UT rounded to a minute and uses a different time/ephemeris model. These are discrepancies, not physical error bounds. Agreement does not improve on every metric: the full-century mean increases slightly while the maximum decreases. `data/accuracy.json` also records RMS and worst-event details. The legacy dataset and NASA reference live in test fixtures and are excluded from the runtime distribution.

## Compact format and kernel

`data/phases-2001-2100.lph` is a little-endian **LPH1** stream:

| Byte offset | Encoding | Meaning |
| ---: | --- | --- |
| 0 | 4 ASCII bytes | `LPH1`: version, fixed epoch, NEW origin, second resolution |
| 4 | uint32 | Event count N |
| 8 | uint32 | Minimum lag-4 interval B, seconds |
| 12 | uint32 | FNV-1a of decoded uint32 little-endian bytes |
| 16 | 4 × uint32 | First four timestamps, seconds since 2000-01-01T00:00:00Z |
| 32 | (N − 4) × uint16 | `time[i] − time[i − 4] − B` |

Total size: `24 + 2*N`. The interval between the same principal phase in consecutive lunations varies within a range narrower than 65,536 seconds. The encoder verifies that residuals fit uint16. The loader checks version, exact length, overflow, checksum, and phase spacing. FNV detects accidental corruption; it is not cryptographic authentication.

`openPackedTable(bytes)` in `src/table.ts` decodes once into a **19,812-byte** buffer. Savings are in file/download size; decoded table memory is unchanged. Loading accepts `ArrayBuffer`, `DataView`, typed-array slices, and Node `Buffer` with non-zero offsets.

The low-level API remains available:

```ts
import { openPackedTable } from './src/table.ts';
import { phaseEventIndex, eventUtcMs, majorPhase } from './src/kernel.ts';

const table = openPackedTable(bytes);
const index = phaseEventIndex(table, Date.now());
if (index >= 0) {
  const lastPrincipalPhase = majorPhase(index); // 0 NEW, 1 FIRST, 2 FULL, 3 LAST
  const nextUtcMs = eventUtcMs(table, index + 1);
}
```

`openPhaseTable` still accepts the original raw uint32 format. `phaseEventIndexFrom(table, utcMs, previousIndex)` remains an alias of `phaseEventIndex` with an optional hint. Nearby dates reuse the position; backward and large forward jumps use binary search. Invalid hints fall back safely. Hot queries allocate no objects. Pass valid indices to `eventUtcMs`, `majorPhase`, `ageSeconds`, and `phase8`; low-level index arguments are preconditions. Do not mutate an opened table.

## Checks and regeneration

Tests, demo, benchmark, and server need only Node:

```bash
npm test
npm run demo
npm run bench
npm run accuracy
```

Tests cover every event boundary, 100,000 dates against a linear oracle, cursor hints, phase-label thresholds, all NASA references, complete lossless round trips, SHA-256 provenance, corrupt/truncated tables, date parsing, and live HTTP on an ephemeral localhost port. The benchmark uses warmup and the median of seven measurements.

Rebuild browser bundles and check types:

```bash
npm ci
npm run typecheck
npm run build
npm run verify:dist
```

Only development dependencies are installed. `dist/kernel.js` is the standalone raw-table kernel; `dist/lunar.js` is the complete API, using `dist/data/phases-2001-2100.lph`. CI runs checks on Windows and Linux. `verify:dist` starts the built server on a temporary port and checks the HTTP response against the browser bundle.

Regenerate astronomy with Python (**3.11** has a ready-made Windows wheel for the pinned pyswisseph):

```bash
python -m pip install -r requirements-build.txt
python scripts/fetch-ephemeris.py
python scripts/generate.py --backend swiss --ephe-path .cache/ephe --metadata data/provenance.json
npm run pack:data
npm run accuracy
npm test
npm run build
```

The intermediate `.cache/phases-2001-2100.u32le`, Python environments, and ephemeris files are build-only and ignored. For an analytic model without external files, omit `--backend swiss`; add `--legacy-ut` to reproduce the original table exactly. Regenerate the metadata whenever changing the model.

To refresh the NASA fixture, download the linked HTML into `.cache/nasa-phases2001.html`, then run `node --experimental-strip-types scripts/import-nasa.ts`. The importer checks 100 years, 4,948 events, chronology, and phase order, and stores source/data hashes. Normal tests make no network requests.

Swiss Ephemeris and pyswisseph are separately licensed build dependencies. Their [official licensing terms](https://www.astro.com/swisseph/swephinfo_e.htm) apply to their use and redistribution.
