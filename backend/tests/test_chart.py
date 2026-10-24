"""Fast checks for the cleanup/chart/notation rules (no ML models needed).

    cd backend && .venv/bin/python -m pytest -q
"""

import numpy as np

from pipeline.beats import BeatGrid
from pipeline.chart import build_chart
from pipeline.config import ChartConfig
from pipeline.notation import layout, to_alphatex
from pipeline.transcribe import RawNote

BPM = 120.0
GRID = BeatGrid.constant(BPM, duration=20.0, offset=0.5)  # beat 0 at 0.5 s, 0.5 s per beat


def t_of(beat):
    return 0.5 + beat * 0.5


def make_raw():
    rng = np.random.default_rng(0)
    raw = []
    for k in range(32):  # 16th notes for 8 beats, with chords on every beat, +-10 ms jitter
        b = k / 4
        pitches = [52, 55, 59, 64] if k % 4 == 0 else [60 + (k % 5)]
        for p in pitches:
            s = t_of(b) + rng.uniform(-0.01, 0.01)
            raw.append(RawNote(s, s + 0.2, p, 0.6))
    raw.append(RawNote(t_of(9), t_of(9) + 0.03, 60, 0.9))  # too short
    raw.append(RawNote(t_of(10), t_of(10) + 0.3, 60, 0.05))  # too quiet
    raw.append(RawNote(t_of(11), t_of(11) + 0.3, 90, 0.6))  # above fret 12 -> folded down
    return raw


def test_easy_is_playable():
    chart = build_chart(make_raw(), GRID, ChartConfig(), "t", 20.0, "guitar")
    easy = chart["difficulties"]["easy"]
    slots = {}
    for n in easy:
        slots.setdefault(n["beat"], []).append(n)
    assert all(len(v) == 1 for v in slots.values()), "easy must have no chords"
    per_beat = {}
    for b in slots:
        per_beat.setdefault(int(np.floor(b)), []).append(b)
    assert max(len(v) for v in per_beat.values()) <= 2
    assert all(float(b).is_integer() for b in slots), "easy notes sit on the 1/4 grid"
    assert all(n["midi"] == 64 for n in easy if n["beat"] < 8), "easy keeps the highest note of each chord"


def test_snapping_cleanup_and_ranges():
    chart = build_chart(make_raw(), GRID, ChartConfig(), "t", 20.0, "guitar")
    hard, medium = chart["difficulties"]["hard"], chart["difficulties"]["medium"]
    assert all(abs(n["beat"] * 4 - round(n["beat"] * 4)) < 1e-9 for n in hard)
    assert all(abs(n["t"] - t_of(n["beat"])) < 1e-3 for n in hard), "t matches the snapped beat"
    assert all(abs(n["beat"] * 2 - round(n["beat"] * 2)) < 1e-9 for n in medium)
    from collections import Counter
    assert max(Counter(n["beat"] for n in medium).values()) <= 2
    assert not any(n["beat"] in (9, 10) for n in hard), "short and quiet notes are dropped"
    folded = [n for n in hard if n["beat"] == 11]
    assert folded and folded[0]["midi"] == 78 - 12 and 0 <= folded[0]["fret"] <= 12
    for d in chart["difficulties"].values():
        for n in d:
            assert 1 <= n["string"] <= 6 and 0 <= n["fret"] <= 12 and n["lane"] == n["string"]
        assert [n["t"] for n in d] == sorted(n["t"] for n in d)


def test_notation_bars_are_full():
    chart = build_chart(make_raw(), GRID, ChartConfig(), "t", 20.0, "guitar")
    for diff in ("easy", "medium", "hard"):
        lay = layout(chart["difficulties"][diff], GRID)
        assert lay.measures and all(sum(p.length for p in m) == 16 for m in lay.measures)
    tex = to_alphatex(chart, GRID)
    assert tex.count("\\track") == 3 and "\\ts (4 4)" in tex and "\n.\n" not in tex
