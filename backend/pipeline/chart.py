"""Stage 5: raw notes -> cleaned, quantized chart with easy/medium/hard.

All difficulties start from the same cleaned notes. Each one snaps onsets to
its own grid (1/16, 1/8, 1/4); a note further than `snap_tolerance_beats`
from that grid is dropped instead of being dragged onto it, so every note in
the chart still lines up with the audio.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List

import numpy as np

from .beats import BeatGrid
from .config import ChartConfig, DifficultyConfig
from .fretboard import LOWEST_PITCH, FretAssigner, highest_pitch
from .transcribe import RawNote

log = logging.getLogger("pipeline")

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
DIFFICULTIES = ("easy", "medium", "hard")


def midi_name(m: int) -> str:
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


@dataclass
class CleanNote:
    start: float
    end: float
    pitch: int
    amp: float
    b0: float = 0.0  # onset in beats (unsnapped)
    b1: float = 0.0  # end in beats (unsnapped)


def clean_notes(raw: List[RawNote], grid: BeatGrid, cfg: ChartConfig) -> List[CleanNote]:
    lo, hi = LOWEST_PITCH, highest_pitch(cfg.max_fret)
    out: List[CleanNote] = []
    dropped_short = dropped_quiet = dropped_range = 0
    for n in raw:
        if n.end - n.start < cfg.min_note_sec:
            dropped_short += 1
            continue
        if n.amplitude < cfg.min_amplitude:
            dropped_quiet += 1
            continue
        p = n.pitch
        if cfg.fold_octaves:
            while p > hi:
                p -= 12
            while p < lo:
                p += 12
        elif not lo <= p <= hi:
            dropped_range += 1
            continue
        out.append(CleanNote(n.start, n.end, p, n.amplitude))
    if out:
        b0 = grid.time_to_beat([n.start for n in out])
        b1 = grid.time_to_beat([n.end for n in out])
        for n, x, y in zip(out, b0, b1):
            n.b0, n.b1 = float(x), float(y)
    log.info(
        "[chart] %d raw -> %d clean (dropped %d short, %d quiet, %d out of range)",
        len(raw), len(out), dropped_short, dropped_quiet, dropped_range,
    )
    return out


def _velocity(amp: float) -> int:
    return int(max(1, min(127, round(amp * 127))))


def build_difficulty(notes: List[CleanNote], grid: BeatGrid, d: DifficultyConfig, max_fret: int) -> List[dict]:
    spb = d.grid // 4  # grid slots per beat (4/4, quarter-note beat)
    step16 = 4 // spb  # grid step in 16ths
    slots: Dict[int, List[CleanNote]] = defaultdict(list)  # key: position in 16ths
    offbeat: Dict[int, List[CleanNote]] = defaultdict(list)

    for n in notes:
        k = round(n.b0 * spb)
        if abs(n.b0 - k / spb) <= d.snap_tolerance_beats:
            slots[k * step16].append(n)
        elif d.offbeat_fallback:
            k8 = round(n.b0 * 2)
            if k8 % 2 == 1 and abs(n.b0 - k8 / 2) <= d.snap_tolerance_beats:
                offbeat[k8 * 2].append(n)
    if d.offbeat_fallback:
        for q, ns in offbeat.items():
            if (q - 2) not in slots:  # nothing on that beat -> use the "and"
                slots[q] = ns

    # One entry per slot: merge same-pitch duplicates, cap simultaneous notes.
    events = []
    for q in sorted(slots):
        by_pitch: Dict[int, CleanNote] = {}
        for n in slots[q]:
            cur = by_pitch.get(n.pitch)
            if cur is None:
                by_pitch[n.pitch] = CleanNote(n.start, n.end, n.pitch, n.amp, n.b0, n.b1)
            else:
                cur.amp = max(cur.amp, n.amp)
                cur.b1 = max(cur.b1, n.b1)
        ns = list(by_pitch.values())
        if d.keep == "loudest":
            ns.sort(key=lambda n: (-n.amp, -n.pitch))
        else:
            ns.sort(key=lambda n: (-n.pitch, -n.amp))
        events.append([q, ns[: d.max_simultaneous]])

    # Density cap: at most N slots per beat, keep on-beat first, then loudest.
    if d.max_notes_per_beat:
        per_beat: Dict[int, list] = defaultdict(list)
        for ev in events:
            per_beat[ev[0] // 4].append(ev)
        keep = set()
        for beat_events in per_beat.values():
            ranked = sorted(beat_events, key=lambda ev: (ev[0] % 4 != 0, -max(n.amp for n in ev[1])))
            keep.update(id(ev) for ev in ranked[: d.max_notes_per_beat])
        events = [ev for ev in events if id(ev) in keep]

    assigner = FretAssigner(max_fret=max_fret, prefer_low=d.prefer_low_frets)
    out: List[dict] = []
    for i, (q, ns) in enumerate(events):
        next_q = events[i + 1][0] if i + 1 < len(events) else None
        end_beat = max(n.b1 for n in ns)
        dur_steps = max(1, round((end_beat - q / 4) * spb))
        end16 = q + dur_steps * step16
        if next_q is not None:
            end16 = min(end16, next_q)
        t0, t1 = grid.beat_to_time([q / 4, end16 / 4])
        amp_by_pitch = {n.pitch: n.amp for n in ns}
        for pitch, string, fret in assigner.assign([n.pitch for n in ns]):
            out.append({
                "t": round(float(t0), 4),
                "dur": round(float(t1 - t0), 4),
                "beat": round(q / 4, 4),
                "midi": pitch,
                "name": midi_name(pitch),
                "string": string,
                "fret": fret,
                "lane": string,
                "velocity": _velocity(amp_by_pitch[pitch]),
            })
    out.sort(key=lambda n: (n["t"], n["string"]))
    return out


def difficulty_stats(notes: List[dict]) -> dict:
    by_slot: Dict[float, int] = defaultdict(int)
    by_beat: Dict[int, set] = defaultdict(set)
    for n in notes:
        by_slot[n["beat"]] += 1
        by_beat[int(np.floor(n["beat"]))].add(n["beat"])
    return {
        "notes": len(notes),
        "slots": len(by_slot),
        "maxSimultaneous": max(by_slot.values(), default=0),
        "maxSlotsPerBeat": max((len(v) for v in by_beat.values()), default=0),
        "chords": sum(1 for c in by_slot.values() if c > 1),
    }


def build_chart(raw: List[RawNote], grid: BeatGrid, cfg: ChartConfig, title: str, duration: float, source: str) -> dict:
    cleaned = clean_notes(raw, grid, cfg)
    diffs = {
        "easy": build_difficulty(cleaned, grid, cfg.easy, cfg.max_fret),
        "medium": build_difficulty(cleaned, grid, cfg.medium, cfg.max_fret),
        "hard": build_difficulty(cleaned, grid, cfg.hard, cfg.max_fret),
    }
    for name in DIFFICULTIES:
        log.info("[chart] %-6s %s", name, difficulty_stats(diffs[name]))
    return {
        "version": 1,
        "song": {
            "title": title,
            "durationSec": round(float(duration), 3),
            "bpm": round(grid.bpm, 2),
            "timeSignature": [4, 4],
            "offsetSec": round(grid.offset_sec, 4),
        },
        "beats": grid.output_beats(),
        "audio": {"backing": "backing.mp3", "guitarStem": "guitar.wav"},
        "difficulties": diffs,
        "meta": {
            "source": source,
            "tuning": ["E4", "B3", "G3", "D3", "A2", "E2"],
            "grids": {"easy": cfg.easy.grid, "medium": cfg.medium.grid, "hard": cfg.hard.grid},
        },
    }
