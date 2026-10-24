"""All tunable knobs for the pipeline in one place.

The CLI exposes the most useful ones as flags; the API uses the defaults
(override them with GS_* environment variables, see `PipelineConfig.from_env`).
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class TranscribeConfig:
    # Passed straight to basic_pitch.inference.predict
    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    minimum_note_length_ms: float = 80.0
    minimum_frequency: float = 75.0  # ~D2, a bit under low E (82 Hz)
    maximum_frequency: float = 1400.0  # ~F6, above fret 12 on high E
    melodia_trick: bool = True


@dataclass
class DifficultyConfig:
    grid: int  # note value of the snap grid: 16 = 1/16 notes, 8 = 1/8, 4 = 1/4
    max_simultaneous: int  # notes per grid slot (1 = no chords)
    # Notes further than this (in beats) from a grid point are dropped rather
    # than dragged onto the grid, so kept notes still line up with the audio.
    snap_tolerance_beats: float
    max_notes_per_beat: Optional[int] = None
    keep: str = "highest"  # which notes survive when a slot has too many
    prefer_low_frets: bool = False  # easy: favour open strings / low frets
    # easy: if a beat has no on-beat note, allow one on the off-beat 8th
    offbeat_fallback: bool = False


@dataclass
class ChartConfig:
    min_note_sec: float = 0.08
    min_amplitude: float = 0.25  # basic-pitch amplitude, 0..1
    fold_octaves: bool = True  # move out-of-range notes by octaves instead of dropping
    max_fret: int = 12
    hard: DifficultyConfig = field(
        default_factory=lambda: DifficultyConfig(grid=16, max_simultaneous=6, snap_tolerance_beats=0.125)
    )
    medium: DifficultyConfig = field(
        default_factory=lambda: DifficultyConfig(grid=8, max_simultaneous=2, snap_tolerance_beats=0.15)
    )
    easy: DifficultyConfig = field(
        default_factory=lambda: DifficultyConfig(
            grid=4,
            max_simultaneous=1,
            snap_tolerance_beats=0.2,
            max_notes_per_beat=2,
            prefer_low_frets=True,
            offbeat_fallback=True,
        )
    )


@dataclass
class PipelineConfig:
    source: str = "guitar"  # guitar | other | vocals | bass | piano | mix
    max_duration_sec: float = 8 * 60
    device: str = "auto"  # auto | cuda | mps | cpu
    demucs_model: str = "htdemucs_6s"
    demucs_shifts: int = 1
    demucs_overlap: float = 0.25
    backing_bitrate: str = "192k"
    title: Optional[str] = None
    transcribe: TranscribeConfig = field(default_factory=TranscribeConfig)
    chart: ChartConfig = field(default_factory=ChartConfig)

    def fingerprint(self) -> str:
        """Hash of every setting that changes the outputs (used for caching)."""
        d = asdict(self)
        d.pop("device", None)
        d.pop("title", None)
        blob = json.dumps(d, sort_keys=True).encode()
        return hashlib.sha256(blob).hexdigest()[:16]

    @classmethod
    def from_env(cls) -> "PipelineConfig":
        cfg = cls()
        env = os.environ
        if "GS_DEVICE" in env:
            cfg.device = env["GS_DEVICE"]
        if "GS_MAX_DURATION_SEC" in env:
            cfg.max_duration_sec = float(env["GS_MAX_DURATION_SEC"])
        if "GS_ONSET_THRESHOLD" in env:
            cfg.transcribe.onset_threshold = float(env["GS_ONSET_THRESHOLD"])
        if "GS_FRAME_THRESHOLD" in env:
            cfg.transcribe.frame_threshold = float(env["GS_FRAME_THRESHOLD"])
        if "GS_MIN_NOTE_MS" in env:
            cfg.transcribe.minimum_note_length_ms = float(env["GS_MIN_NOTE_MS"])
            cfg.chart.min_note_sec = float(env["GS_MIN_NOTE_MS"]) / 1000.0
        if "GS_MIN_AMPLITUDE" in env:
            cfg.chart.min_amplitude = float(env["GS_MIN_AMPLITUDE"])
        return cfg
