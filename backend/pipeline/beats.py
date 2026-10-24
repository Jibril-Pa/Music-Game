"""Stage 3: tempo, beats and first downbeat (librosa, assumes 4/4).

Beat numbering used everywhere downstream:
  beat 0 == first downbeat == song.offsetSec == chart.beats[0]
  beat k == chart.beats[k]; fractional beats interpolate between tracked beats
  (so the grid follows tempo drift). Pickup notes before the first downbeat get
  negative beat values.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import numpy as np

log = logging.getLogger("pipeline")

SR = 22050
HOP = 128  # ~5.8 ms frames
N_FFT = 512  # short window: a 2048 window made beats ~25 ms late
MIN_BPM, MAX_BPM = 70.0, 190.0


@dataclass
class BeatGrid:
    """Tracked beat times extended (with the median period) past both ends."""

    times: np.ndarray  # extended grid, may start slightly below 0
    downbeat_index: int  # index in `times` of beat 0 (first downbeat >= 0)
    period: float  # median seconds per beat
    duration: float

    @property
    def bpm(self) -> float:
        return 60.0 / self.period

    @property
    def offset_sec(self) -> float:
        return float(self.times[self.downbeat_index])

    def output_beats(self) -> List[float]:
        b = self.times[self.downbeat_index:]
        return [round(float(t), 4) for t in b if t <= self.duration + 1e-6]

    def time_to_beat(self, t):
        t = np.asarray(t, dtype=float)
        idx = np.arange(len(self.times), dtype=float)
        b = np.interp(t, self.times, idx)
        lo, hi = self.times[0], self.times[-1]
        b = np.where(t < lo, (t - lo) / self.period, b)
        b = np.where(t > hi, idx[-1] + (t - hi) / self.period, b)
        return b - self.downbeat_index

    def beat_to_time(self, b):
        b = np.asarray(b, dtype=float) + self.downbeat_index
        idx = np.arange(len(self.times), dtype=float)
        t = np.interp(b, idx, self.times)
        t = np.where(b < 0, self.times[0] + b * self.period, t)
        t = np.where(b > idx[-1], self.times[-1] + (b - idx[-1]) * self.period, t)
        return t

    def to_dict(self) -> dict:
        return {
            "bpm": round(self.bpm, 2),
            "offsetSec": round(self.offset_sec, 4),
            "period": self.period,
            "times": [float(x) for x in self.times],
            "downbeatIndex": self.downbeat_index,
            "duration": self.duration,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "BeatGrid":
        return cls(np.asarray(d["times"], dtype=float), int(d["downbeatIndex"]), float(d["period"]), float(d["duration"]))

    @classmethod
    def constant(cls, bpm: float, duration: float, offset: float = 0.0) -> "BeatGrid":
        period = 60.0 / bpm
        times = np.arange(offset - period, duration + 2 * period, period)
        return cls(times, 1, period, duration)


def _fill_gaps(times: np.ndarray, period: float) -> np.ndarray:
    """Insert beats where the tracker skipped some (interval ~2x, 3x period)."""
    out = [times[0]]
    for a, b in zip(times[:-1], times[1:]):
        n = int(round((b - a) / period))
        if n >= 2:
            out.extend(a + (b - a) * k / n for k in range(1, n))
        out.append(b)
    return np.asarray(out)


def _strength_at(env: np.ndarray, times: np.ndarray) -> np.ndarray:
    frames = np.round(times * SR / HOP).astype(int)
    vals = []
    for f in frames:
        lo, hi = max(0, f - 2), min(len(env), f + 7)  # onset peaks trail the beat a little
        vals.append(env[lo:hi].max() if hi > lo else 0.0)
    return np.asarray(vals)


def _low_onset_env(y: np.ndarray) -> np.ndarray:
    """Onset strength of the low end (kick + bass) -- downbeats tend to be there."""
    import librosa

    S = librosa.feature.melspectrogram(y=y, sr=SR, hop_length=HOP, n_fft=1024, n_mels=64, fmax=8000)
    mel_f = librosa.mel_frequencies(n_mels=64, fmax=8000)
    low = S[mel_f < 180]
    return librosa.onset.onset_strength(S=librosa.power_to_db(low), sr=SR, hop_length=HOP)


def track_beats(mix_wav: Path, duration: float, stems_dir: Optional[Path] = None) -> BeatGrid:
    import librosa

    y, _ = librosa.load(str(mix_wav), sr=SR, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP, n_fft=N_FFT, n_mels=64, aggregate=np.median)
    tempo, frames = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, start_bpm=120.0, units="frames")
    times = librosa.frames_to_time(frames, sr=SR, hop_length=HOP)

    if len(times) < 8:
        log.warning("[beats] only %d beats found; falling back to a constant 120 BPM grid", len(times))
        return BeatGrid.constant(120.0, duration)

    period = float(np.median(np.diff(times)))
    times = _fill_gaps(times, period)

    # Fix tempo octave errors so the 1/16 / 1/8 / 1/4 grids make musical sense.
    while 60.0 / period < MIN_BPM:
        mids = (times[:-1] + times[1:]) / 2
        times = np.sort(np.concatenate([times, mids]))
        period /= 2
    while 60.0 / period > MAX_BPM:
        s = _strength_at(env, times)
        phase = 0 if s[0::2].mean() >= s[1::2].mean() else 1
        times = times[phase::2]
        period *= 2
    period = float(np.median(np.diff(times)))

    # Extend with the median period: back to just below 0, forward past the end.
    first, last = times[0], times[-1]
    n_back = int(np.ceil((first + period) / period))
    back = first - period * np.arange(n_back, 0, -1)
    n_fwd = int(np.ceil((duration + 2 * period - last) / period))
    fwd = last + period * np.arange(1, max(n_fwd, 1) + 1)
    ext = np.concatenate([back, times, fwd])
    tracked = slice(len(back), len(back) + len(times))

    # Downbeat phase: which of the 4 beat positions has the most low-end onsets.
    low_y = None
    if stems_dir is not None and (stems_dir / "drums.flac").exists():
        try:
            d, _ = librosa.load(str(stems_dir / "drums.flac"), sr=SR, mono=True)
            b, _ = librosa.load(str(stems_dir / "bass.flac"), sr=SR, mono=True)
            n = min(len(d), len(b))
            low_y = d[:n] + b[:n]
        except Exception as e:  # stems optional here
            log.warning("[beats] couldn't use drum/bass stems for downbeats: %s", e)
    low_env = _low_onset_env(low_y if low_y is not None else y)
    strength = _strength_at(low_env, ext[tracked])
    idx = np.arange(len(ext))[tracked]
    scores = [strength[(idx % 4) == p].mean() if np.any((idx % 4) == p) else 0.0 for p in range(4)]
    phase = int(np.argmax(scores))
    candidates = [i for i in range(len(ext)) if i % 4 == phase and ext[i] >= 0]
    downbeat = candidates[0]

    grid = BeatGrid(ext, downbeat, period, duration)
    log.info(
        "[beats] %.1f BPM, first downbeat at %.3fs, %d tracked beats (librosa tempo est. %.1f)",
        grid.bpm, grid.offset_sec, len(times), float(np.atleast_1d(tempo)[0]),
    )
    return grid
