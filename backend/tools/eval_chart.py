"""Check a pipeline output folder: timing alignment and the easy-mode rules.

    .venv/bin/python tools/eval_chart.py out/test_clip/ [--truth out/test_clip.truth.json]

With --truth (from make_test_clip.py): note recall, precision and timing error
against the known guitar notes. Without it: distance from each chart note to
the nearest onset detected in guitar.wav (a proxy for "lines up with audio").
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np


def pct(x) -> str:
    return f"{100 * x:.0f}%"


def ms(x) -> str:
    return f"{1000 * x:.0f} ms"


def check_easy(chart: dict) -> list:
    problems = []
    easy = chart["difficulties"]["easy"]
    slots = defaultdict(int)
    per_beat = defaultdict(set)
    for n in easy:
        slots[n["beat"]] += 1
        per_beat[int(np.floor(n["beat"]))].add(n["beat"])
    chords = [b for b, c in slots.items() if c > 1]
    dense = [b for b, s in per_beat.items() if len(s) > 2]
    if chords:
        problems.append(f"easy has {len(chords)} chords (e.g. beat {chords[0]})")
    if dense:
        problems.append(f"easy has {len(dense)} beats with >2 notes")
    print(f"easy: {len(easy)} notes, chords={len(chords)}, max notes/beat={max((len(s) for s in per_beat.values()), default=0)}"
          f", frets used={sorted({n['fret'] for n in easy})}")
    return problems


def eval_truth(chart: dict, truth: dict, tol: float = 0.1) -> None:
    tnotes = truth["notes"]
    print(f"\ntruth: {len(tnotes)} notes, {truth['bpm']} BPM, first downbeat {truth['offsetSec']}s")
    print(f"chart: {chart['song']['bpm']} BPM, first downbeat {chart['song']['offsetSec']}s")
    for diff in ("hard", "medium", "easy"):
        cn = chart["difficulties"][diff]
        ct = np.array([n["t"] for n in cn]) if cn else np.zeros(0)
        errs, matched = [], 0
        for tn in tnotes:
            same = [n for n in cn if n["midi"] % 12 == tn["midi"] % 12 and abs(n["t"] - tn["t"]) <= tol]
            if same:
                best = min(same, key=lambda n: abs(n["t"] - tn["t"]))
                errs.append(best["t"] - tn["t"])
                matched += 1
        prec = 0.0
        if len(ct):
            tt = np.array([n["t"] for n in tnotes])
            prec = np.mean([np.min(np.abs(tt - t)) <= tol for t in ct])
        e = np.abs(errs) if errs else np.array([np.nan])
        print(f"  {diff:6s} recall {pct(matched / len(tnotes)):>4} (pitch-class match)  onset precision {pct(prec):>4}  "
              f"|err| median {ms(np.median(e))}, p90 {ms(np.percentile(e, 90))}, bias {ms(np.mean(errs) if errs else 0)}  "
              f"within 50ms: {pct(np.mean(e <= 0.05))}")


def eval_onsets(chart: dict, audio: Path) -> None:
    import librosa

    y, sr = librosa.load(str(audio), sr=22050, mono=True)
    on = librosa.onset.onset_detect(y=y, sr=sr, hop_length=128, units="time", backtrack=False)
    print(f"\n{len(on)} onsets detected in {audio.name}")
    for diff in ("hard", "medium", "easy"):
        ts = sorted({n["t"] for n in chart["difficulties"][diff]})
        if not ts or not len(on):
            continue
        d = np.array([on[np.argmin(np.abs(on - t))] - t for t in ts])
        a = np.abs(d)
        print(f"  {diff:6s} {len(ts)} slots  |chart-onset| median {ms(np.median(a))}, p90 {ms(np.percentile(a, 90))}, "
              f"bias {ms(np.median(d))}, within 50ms: {pct(np.mean(a <= 0.05))}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("out_dir")
    p.add_argument("--truth")
    args = p.parse_args()
    out = Path(args.out_dir)
    chart = json.loads((out / "chart.json").read_text())
    result = json.loads((out / "result.json").read_text()) if (out / "result.json").exists() else {}
    if result:
        print(f"timings: {result.get('timings')} total {result.get('totalSec')}s, device {result.get('device')}")
    problems = check_easy(chart)
    if args.truth:
        eval_truth(chart, json.loads(Path(args.truth).read_text()))
    eval_onsets(chart, out / "guitar.wav")
    print("\nPROBLEMS: " + "; ".join(problems) if problems else "\neasy rules OK (no chords, <=2 notes per beat)")


if __name__ == "__main__":
    main()
