"""Stage 4: polyphonic transcription with Spotify Basic Pitch."""

from __future__ import annotations

import contextlib
import io
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List

from .config import TranscribeConfig

log = logging.getLogger("pipeline")
_MODEL = None


@dataclass
class RawNote:
    start: float
    end: float
    pitch: int
    amplitude: float

    def to_dict(self) -> dict:
        return {"start": round(self.start, 4), "end": round(self.end, 4), "pitch": self.pitch, "amplitude": round(self.amplitude, 4)}


def quiet_import():
    """basic_pitch / coremltools log several harmless 'X is not installed' warnings on import."""
    import warnings

    prev = logging.root.manager.disable
    logging.disable(logging.WARNING)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            import basic_pitch  # noqa: F401
            import basic_pitch.inference  # noqa: F401
    finally:
        logging.disable(prev)


def model_path() -> Path:
    quiet_import()
    from basic_pitch import ICASSP_2022_MODEL_PATH

    return Path(ICASSP_2022_MODEL_PATH)


def _model():
    global _MODEL
    if _MODEL is None:
        quiet_import()
        from basic_pitch.inference import Model

        path = model_path()
        log.info("[transcribe] Basic Pitch model: %s", path.name)
        _MODEL = Model(path)
    return _MODEL


def transcribe(audio_path: Path, out_mid: Path, cfg: TranscribeConfig, midi_tempo: float = 120.0) -> List[RawNote]:
    quiet_import()
    from basic_pitch.inference import predict

    with contextlib.redirect_stdout(io.StringIO()):  # predict() prints progress chatter
        _, midi_data, note_events = predict(
            str(audio_path),
            _model(),
            onset_threshold=cfg.onset_threshold,
            frame_threshold=cfg.frame_threshold,
            minimum_note_length=cfg.minimum_note_length_ms,
            minimum_frequency=cfg.minimum_frequency,
            maximum_frequency=cfg.maximum_frequency,
            multiple_pitch_bends=False,
            melodia_trick=cfg.melodia_trick,
            midi_tempo=float(midi_tempo),
        )
    midi_data.write(str(out_mid))
    notes = [RawNote(float(s), float(e), int(p), float(a)) for (s, e, p, a, *_rest) in note_events]
    notes.sort(key=lambda n: (n.start, n.pitch))
    log.info("[transcribe] %d raw notes", len(notes))
    return notes
