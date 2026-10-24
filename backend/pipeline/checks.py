"""Sanity checks that turn into user-facing warnings.

- Cut-off files: online converters sometimes stop mid-song and pad the rest
  with digital silence. We trim that tail (so the backing track and chart end
  where the music ends) and warn.
- Weak stems: if the stem we transcribe is barely there, the chart will be
  thin. We measure every stem and suggest a better --source.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import soundfile as sf

SILENCE_PEAK = 1e-3  # about -60 dBFS
MIN_SILENT_TAIL_SEC = 5.0  # shorter tails are normal fade-outs
KEEP_TAIL_SEC = 1.0

# A stem counts as weak below either threshold (measured on the audible part).
WEAK_SHARE = 0.20  # stem RMS / mix RMS
WEAK_ACTIVE = 0.25  # fraction of 1-second windows where the stem is clearly present
MIN_NOTES_PER_SEC = 0.5  # hard difficulty

ALT_SOURCES = ("other", "piano", "vocals", "bass")


def fmt_time(sec: float) -> str:
    s = int(round(sec))
    return f"{s // 60}:{s % 60:02d}"


def audio_end(samples: np.ndarray, sr: int, threshold: float = SILENCE_PEAK) -> float:
    """Time (s) just after the last sample louder than `threshold`; 0 if all silent."""
    peak = np.abs(samples).max(axis=1) if samples.ndim == 2 else np.abs(samples)
    loud = np.nonzero(peak > threshold)[0]
    return 0.0 if len(loud) == 0 else (loud[-1] + 1) / sr


def trim_silent_tail(wav: Path) -> dict:
    """Trim a long digital-silence tail in place. Returns info for the warning."""
    data, sr = sf.read(str(wav), dtype="float32", always_2d=True)
    total = len(data) / sr
    end = audio_end(data, sr)
    info = {"originalSec": round(total, 3), "audioEndSec": round(end, 3), "trimmed": False}
    if end > 0 and total - end > MIN_SILENT_TAIL_SEC:
        keep = min(len(data), int((end + KEEP_TAIL_SEC) * sr))
        sf.write(str(wav), data[:keep], sr, subtype="PCM_16")
        info["trimmed"] = True
    return info


def cutoff_warning(info: dict) -> Optional[dict]:
    if not info.get("trimmed"):
        return None
    end, total = info["audioEndSec"], info["originalSec"]
    return {
        "code": "cut_off",
        "message": (
            f"The music stops at {fmt_time(end)}; the last {fmt_time(total - end)} of the file is silence, "
            "so the file looks cut off (common with online video-to-MP3 converters). "
            f"Only the first {fmt_time(end)} was used. Upload a complete copy to chart the whole song."
        ),
    }


def stem_levels(stems: Dict[str, np.ndarray], sr: int) -> Dict[str, dict]:
    """Per stem: share = RMS relative to the mix, active = fraction of audible seconds it's present.

    Only whole 1-second windows where the mix is audible are counted.
    """
    mono = {k: (x.mean(axis=1) if x.ndim == 2 else x) for k, x in stems.items()}
    m = sum(mono.values())
    n_win = len(m) // sr
    if n_win == 0:
        return {k: {"share": 0.0, "active": 0.0} for k in stems}
    L = n_win * sr

    def windows(x):
        return np.sqrt((x[:L].reshape(n_win, sr) ** 2).mean(axis=1))

    mix_w = windows(m)
    audible = mix_w > 0.01
    if not audible.any():
        return {k: {"share": 0.0, "active": 0.0} for k in stems}
    mask = np.repeat(audible, sr)
    mix_rms = float(np.sqrt((m[:L][mask] ** 2).mean()))
    out = {}
    for name, xm in mono.items():
        rms = float(np.sqrt((xm[:L][mask] ** 2).mean()))
        active = float(np.mean(windows(xm)[audible] > 0.15 * mix_w[audible]))
        out[name] = {"share": round(rms / mix_rms, 3), "active": round(active, 3)}
    return out


def suggest_sources(levels: Dict[str, dict], current: str) -> List[str]:
    """Up to two alternative stems that are clearly present, then 'mix'.

    Fixed preference order: 'other' first (Demucs puts guitars it doesn't
    recognise there), then piano/keys, vocals (melody), bass (riffs).
    """
    picks = [
        s for s in ALT_SOURCES
        if s != current and s in levels and levels[s]["share"] >= WEAK_SHARE and levels[s]["active"] >= WEAK_ACTIVE
    ][:2]
    return picks + (["mix"] if current != "mix" else [])


def weak_stem_warning(levels: Dict[str, dict], source: str) -> Optional[dict]:
    if source == "mix" or source not in levels:
        return None
    lv = levels[source]
    if lv["share"] >= WEAK_SHARE and lv["active"] >= WEAK_ACTIVE:
        return None
    return {
        "code": "weak_stem",
        "message": (
            f"The {source} stem is weak: {lv['share']:.0%} of the song's level, present in {lv['active']:.0%} of it. "
            "The chart will be thin. Try transcribing a different stem."
        ),
        "suggestSources": suggest_sources(levels, source),
    }


def few_notes_warning(hard_notes: int, duration: float, source: str, levels: Dict[str, dict]) -> Optional[dict]:
    rate = hard_notes / max(duration, 1e-6)
    if rate >= MIN_NOTES_PER_SEC:
        return None
    return {
        "code": "few_notes",
        "message": f"Only {hard_notes} notes found ({rate:.1f} per second on hard).",
        "suggestSources": suggest_sources(levels, source) if levels else ["mix"],
    }
