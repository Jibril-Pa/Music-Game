"""Generate a 30-second synthetic test song with known guitar notes.

    .venv/bin/python tools/make_test_clip.py out/test_clip.mp3

Drums + bass + a plucked-string "guitar" (Karplus-Strong) at a fixed tempo.
Writes <name>.mp3 and <name>.truth.json (every guitar note's time and pitch),
which tools/eval_chart.py uses to measure timing error and note recall.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

SR = 44100
BPM = 110.0
OFFSET = 0.6  # first downbeat (s)
BARS = 13
BEAT = 60.0 / BPM
rng = np.random.default_rng(7)


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def kick(n=int(0.35 * SR)):
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.12)


def snare(n=int(0.25 * SR)):
    t = np.arange(n) / SR
    return (0.6 * rng.standard_normal(n) + 0.4 * np.sin(2 * np.pi * 190 * t)) * env(n, 0.001, 0.06)


def hat(n=int(0.06 * SR)):
    x = rng.standard_normal(n)
    x = np.diff(x, prepend=0)  # crude high-pass
    return 0.3 * x * env(n, 0.0005, 0.015)


def bass_note(midi: int, dur: float):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 440 * 2 ** ((midi - 69) / 12)
    saw = 2 * (t * f % 1) - 1
    y = lfilter([0.05], [1, -0.95], saw)  # one-pole low-pass
    return 0.8 * y * env(n, 0.005, 0.5)


def pluck(midi: int, dur: float):
    """Karplus-Strong plucked string: y[i] = d/2 * (y[i-P] + y[i-P-1]), seeded with noise."""
    f = 440 * 2 ** ((midi - 69) / 12)
    period = int(round(SR / f))
    n = int(dur * SR)
    decay = 0.996
    excite = np.zeros(n)
    excite[: min(period, n)] = rng.uniform(-1, 1, min(period, n))
    a = np.zeros(period + 2)
    a[0], a[period], a[period + 1] = 1.0, -decay / 2, -decay / 2
    out = lfilter([1.0], a, excite)
    fade = np.ones(n)
    k = min(n, int(0.02 * SR))
    fade[-k:] = np.linspace(1, 0, k)
    return out * fade


def add(track: np.ndarray, sig: np.ndarray, t: float, gain: float = 1.0):
    i = int(round(t * SR))
    j = min(len(track), i + len(sig))
    if i < len(track):
        track[i:j] += gain * sig[: j - i]


def beat_time(b: float) -> float:
    return OFFSET + b * BEAT


def main(out_path: Path) -> None:
    total = beat_time(BARS * 4) + 1.5
    n = int(total * SR)
    drums, bass, guitar = np.zeros(n), np.zeros(n), np.zeros(n)
    truth = []

    # Em - C - G - D, one chord per bar
    roots = [40, 36, 43, 38]  # E2 C2 G2 D2
    riffs = {
        # 8th-note riff per chord (beat offsets within bar -> midi)
        0: [(0, 52), (0.5, 55), (1, 59), (1.5, 64), (2, 62), (2.5, 59), (3, 55), (3.5, 59)],
        1: [(0, 52), (0.5, 55), (1, 60), (1.5, 64), (2, 67), (3, 64)],
        2: [(0, 55), (1, 59), (1.5, 62), (2, 67), (2.5, 62), (3, 59), (3.5, 62)],
        3: [(0, 50), (0.5, 54), (1, 57), (2, 62), (2.5, 57), (3, 54), (3.75, 57)],
    }
    chords = {  # strummed on beat 1 in the last 4 bars
        0: [40, 47, 52, 55, 59, 64],
        1: [48, 52, 55, 60, 64],
        2: [43, 47, 50, 55, 59, 67],
        3: [50, 57, 62, 66],
    }

    for bar in range(BARS):
        c = bar % 4
        for b in range(4):
            tb = beat_time(bar * 4 + b)
            add(drums, kick() if b in (0, 2) else snare(), tb, 0.9 if b in (0, 2) else 0.6)
            add(drums, hat(), tb)
            add(drums, hat(), tb + BEAT / 2, 0.7)
        for k in range(8):
            add(bass, bass_note(roots[c] + (12 if k % 4 == 3 else 0), BEAT / 2 * 0.9), beat_time(bar * 4 + k / 2), 0.5)
        if bar == 0:
            continue  # intro bar: drums + bass only
        if bar >= BARS - 4:
            t0 = beat_time(bar * 4)
            for i, m in enumerate(sorted(chords[c])):  # quick down-strum
                add(guitar, pluck(m, BEAT * 2), t0 + i * 0.008, 0.35)
                truth.append({"t": round(t0 + i * 0.008, 4), "midi": m, "beat": bar * 4, "chord": True})
            for off, m in [(2, chords[c][-1]), (3, chords[c][-2])]:
                t = beat_time(bar * 4 + off)
                add(guitar, pluck(m, BEAT), t, 0.5)
                truth.append({"t": round(t, 4), "midi": m, "beat": bar * 4 + off, "chord": False})
        else:
            riff = riffs[c]
            for i, (off, m) in enumerate(riff):
                nxt = riff[i + 1][0] if i + 1 < len(riff) else 4
                t = beat_time(bar * 4 + off)
                add(guitar, pluck(m, (nxt - off) * BEAT * 0.95), t, 0.5)
                truth.append({"t": round(t, 4), "midi": m, "beat": bar * 4 + off, "chord": False})

    mix = 0.5 * drums + 0.6 * bass + 0.9 * guitar
    mix /= max(1e-9, np.abs(mix).max()) / 0.9
    stereo = np.stack([mix, mix], axis=1)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wav = out_path.with_suffix(".wav")
    sf.write(str(wav), stereo, SR, subtype="PCM_16")
    if out_path.suffix.lower() == ".mp3":
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-b:a", "192k", str(out_path)], check=True)
        wav.unlink()
    meta = {"bpm": BPM, "offsetSec": OFFSET, "durationSec": round(total, 3), "notes": truth}
    out_path.with_suffix(".truth.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {out_path} ({total:.1f}s, {len(truth)} guitar notes, {BPM} BPM, first downbeat {OFFSET}s)")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "out/test_clip.mp3"))
