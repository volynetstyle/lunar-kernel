#!/usr/bin/env python3
"""Build a second-quantized reference table of principal lunar phases.

Build dependency: pyswisseph==2.10.3.2. Runtime has NO ephemeris dependency.
The calculation uses geocentric apparent ecliptic longitudes. Select Swiss
files for the shipped model, or Moshier for a self-contained analytic model.
Roots are in UT1; jdut1_to_utc handles UTC conversion where possible.

The binary format has NO HEADER: little-endian uint32 seconds since
2000-01-01T00:00:00Z, beginning with NEW, then FIRST, FULL, LAST.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import struct
import hashlib
import json
import swisseph as swe

BASE_DT = datetime(2000, 1, 1, tzinfo=timezone.utc)
START_DT = datetime(2000, 12, 20, tzinfo=timezone.utc)
END_DT = datetime(2101, 2, 1, tzinfo=timezone.utc)
UNIX_JD = 2440587.5
FLAGS = swe.FLG_MOSEPH  # self-contained analytic backend, no ephe files
LEGACY_UT = False
DAY = 86400


def jd_of(dt: datetime) -> float:
    return dt.timestamp() / DAY + UNIX_JD


def elongation(jd: float) -> float:
    moon_pos, moon_flags = swe.calc_ut(jd, swe.MOON, FLAGS)
    sun_pos, sun_flags = swe.calc_ut(jd, swe.SUN, FLAGS)
    if (moon_flags & 7) != FLAGS or (sun_flags & 7) != FLAGS:
        raise RuntimeError("Ephemeris backend fell back; verify the required ephemeris files")
    moon, sun = moon_pos[0], sun_pos[0]
    return (moon - sun) % 360.0


def signed_angle(deg: float) -> float:
    return (deg + 180.0) % 360.0 - 180.0


def root(left: float, right: float, target: float) -> float:
    """Bisection across a single 90 degree elongation crossing."""
    a = signed_angle(elongation(left) - target)
    b = signed_angle(elongation(right) - target)
    if not (a <= 0 <= b):
        raise ValueError(f"root not bracketed: {a}, {b} @ {left}")
    # 30 iterations on a 1-day interval: <0.0001 seconds resolution.
    for _ in range(30):
        mid = (left + right) / 2
        if signed_angle(elongation(mid) - target) < 0:
            left = mid
        else:
            right = mid
    return (left + right) / 2


def generate() -> list[int]:
    jd = jd_of(START_DT)
    end = jd_of(END_DT)
    angle = elongation(jd)
    unwrapped = angle
    next_crossing = 90.0 * (int(unwrapped // 90) + 1)
    events: list[tuple[int, int]] = []  # (quarter type, unix seconds)

    while jd < end:
        jd_next = min(jd + 1.0, end)
        next_angle = elongation(jd_next)
        delta = signed_angle(next_angle - angle)
        if not 0.0 < delta < 20.0:
            raise ValueError(f"Unexpected lunar motion {delta} @ {jd}")
        next_unwrapped = unwrapped + delta

        if next_unwrapped >= next_crossing:
            target = next_crossing % 360.0
            when = root(jd, jd_next, target)
            if LEGACY_UT:
                seconds = round((when - UNIX_JD) * DAY)
            else:
                year, month, day, hour, minute, second = swe.jdut1_to_utc(when)
                utc = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
                seconds = round(utc.timestamp() + second)
            phase = (round(next_crossing / 90.0) % 4)
            events.append((phase, seconds))
            next_crossing += 90.0
            if next_unwrapped >= next_crossing:
                raise AssertionError("Stepped over two phases in one day")

        jd = jd_next
        angle = next_angle
        unwrapped = next_unwrapped

    # The first event in this generation window is NEW; we require it.
    if not events or events[0][0] != 0:
        raise AssertionError(f"First event is not NEW: {events[:1]}")

    base = int(BASE_DT.timestamp())
    offsets = []
    for i, (phase, unix_second) in enumerate(events):
        if phase != i % 4:
            raise AssertionError(f"Phase order broke at {i}: {phase}")
        offset = unix_second - base
        if not 0 <= offset <= 0xffffffff:
            raise OverflowError("Uint32 epoch offsets exceeded")
        if offsets and offset <= offsets[-1]:
            raise AssertionError("Time is not strictly increasing")
        offsets.append(offset)

    # Cover entire UTC years 2001..2100 with a NEW leading event and a future successor.
    if not (base + offsets[0] < datetime(2001, 1, 1, tzinfo=timezone.utc).timestamp()):
        raise AssertionError("No event preceding covered range")
    if not (base + offsets[-1] > datetime(2101, 1, 1, tzinfo=timezone.utc).timestamp()):
        raise AssertionError("No successor after covered range")
    return offsets


def main() -> None:
    global FLAGS, LEGACY_UT
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=".cache/phases-2001-2100.u32le")
    ap.add_argument("--backend", choices=["moshier", "swiss"], default="moshier")
    ap.add_argument("--ephe-path", type=Path)
    ap.add_argument("--legacy-ut", action="store_true", help="Reproduce the original UT1-as-UTC table")
    ap.add_argument("--metadata", type=Path)
    args = ap.parse_args()
    FLAGS = swe.FLG_SWIEPH if args.backend == "swiss" else swe.FLG_MOSEPH
    LEGACY_UT = args.legacy_ut
    files = {}
    if args.backend == "swiss":
        if not args.ephe_path:
            ap.error("--backend swiss requires --ephe-path")
        for name in ("semo_18.se1", "sepl_18.se1"):
            path = args.ephe_path / name
            files[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        swe.set_ephe_path(str(args.ephe_path.resolve()))
    offsets = generate()
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(struct.pack(f"<{len(offsets)}I", *offsets))
    base = int(BASE_DT.timestamp())
    first = datetime.fromtimestamp(base + offsets[0], timezone.utc).isoformat()
    last = datetime.fromtimestamp(base + offsets[-1], timezone.utc).isoformat()
    print(f"{len(offsets)} phase events, {out.stat().st_size} bytes; {first} through {last}")
    if args.metadata:
        args.metadata.parent.mkdir(parents=True, exist_ok=True)
        args.metadata.write_text(json.dumps({
            "backend": args.backend, "swissephVersion": swe.version,
            "pyswissephBuild": swe.__version__, "ephemerisSha256": files,
            "jplEphemeris": swe.get_current_file_data(1)[3] if files else None,
            "timeScale": "UT1 treated as UTC (legacy)" if LEGACY_UT else "Swiss jdut1_to_utc; predicted UT1 when future leap seconds are unknown",
            "count": len(offsets), "firstUtc": first, "lastSentinelUtc": last,
            "resolutionSeconds": 1, "quantizationErrorSeconds": 0.5,
            "decodedSha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
