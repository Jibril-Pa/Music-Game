"""Runs the six stages in order, with per-stage timing, progress and caching."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

import soundfile as sf

from . import OUTPUT_FILES, SOURCES, __version__
from .audio import decode_to_wav, nice_title, probe, sha256_file
from .config import PipelineConfig

log = logging.getLogger("pipeline")

# (stage, share of the progress bar)
STAGES = (
    ("ingest", 0.03),
    ("separate", 0.62),
    ("beats", 0.05),
    ("transcribe", 0.20),
    ("chart", 0.03),
    ("notation", 0.07),
)
STAGE_NAMES = tuple(s for s, _ in STAGES)

ProgressFn = Callable[[str, float], None]  # (stage, overall 0..1)


class StageError(RuntimeError):
    def __init__(self, stage: str, detail: str):
        super().__init__(f"Stage '{stage}' failed: {detail}")
        self.stage = stage
        self.detail = detail


def fmt_duration(sec: float) -> str:
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def outputs_complete(out_dir: Path) -> bool:
    return all((out_dir / f).exists() and (out_dir / f).stat().st_size > 0 for f in OUTPUT_FILES)


def cached_result(out_dir: Path, input_sha: str, cfg: PipelineConfig) -> Optional[dict]:
    path = out_dir / "result.json"
    if not path.exists() or not outputs_complete(out_dir):
        return None
    try:
        prev = json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
    if (prev.get("inputSha256") == input_sha and prev.get("configFingerprint") == cfg.fingerprint()
            and prev.get("pipelineVersion") == __version__):
        return prev
    return None


def dump_chart(chart: dict) -> str:
    """Pretty JSON, but one line per note so the file stays readable."""
    def note_list(notes):
        if not notes:
            return "[]"
        return "[\n" + ",\n".join("      " + json.dumps(n, separators=(", ", ": ")) for n in notes) + "\n    ]"

    parts = []
    for k, v in chart.items():
        if k == "difficulties":
            diffs = ",\n".join(f'    "{d}": {note_list(n)}' for d, n in v.items())
            parts.append('  "difficulties": {\n' + diffs + "\n  }")
        else:
            parts.append(f'  "{k}": {json.dumps(v)}')
    return "{\n" + ",\n".join(parts) + "\n}\n"


def run_pipeline(
    input_path: Path,
    out_dir: Path,
    cfg: Optional[PipelineConfig] = None,
    stems_dir: Optional[Path] = None,
    progress: Optional[ProgressFn] = None,
    force: bool = False,
    input_sha: Optional[str] = None,
    display_name: Optional[str] = None,
) -> dict:
    cfg = cfg or PipelineConfig()
    if cfg.source not in SOURCES:
        raise ValueError(f"source must be one of {SOURCES}, got {cfg.source!r}")
    input_path, out_dir = Path(input_path), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stems_dir = Path(stems_dir) if stems_dir else out_dir / "stems"
    report = progress or (lambda stage, p: None)

    input_sha = input_sha or sha256_file(input_path)
    if not force:
        prev = cached_result(out_dir, input_sha, cfg)
        if prev:
            log.info("Cache hit for %s (sha256 %s...), nothing to do", input_path.name, input_sha[:12])
            report("done", 1.0)
            return {**prev, "cached": True}

    ctx: dict = {"input_wav": out_dir / "input.wav", "warnings": [], "levels": {}}

    def warn(w):
        if w:
            log.warning("[warning] %s", w["message"])
            ctx["warnings"].append(w)
    timings: dict = {}

    # ---------------------------------------------------------------- stages
    def ingest(sub):
        meta = probe(input_path)
        if meta["duration"] > cfg.max_duration_sec:
            raise StageError("ingest", f"Song is {fmt_duration(meta['duration'])} long; the limit is "
                                       f"{fmt_duration(cfg.max_duration_sec)}. Trim it and try again.")
        from .checks import cutoff_warning, trim_silent_tail

        marker = out_dir / ".input_sha256"
        ingest_json = out_dir / "ingest.json"
        if ctx["input_wav"].exists() and marker.exists() and marker.read_text().strip() == input_sha and ingest_json.exists():
            silence = json.loads(ingest_json.read_text())
        else:
            decode_to_wav(input_path, ctx["input_wav"])
            silence = trim_silent_tail(ctx["input_wav"])
            ingest_json.write_text(json.dumps(silence))
            marker.write_text(input_sha)
        if silence["audioEndSec"] < 0.5:
            raise StageError("ingest", "The file is silent: there's no audio in it.")
        warn(cutoff_warning(silence))
        info = sf.info(str(ctx["input_wav"]))
        duration = info.frames / info.samplerate
        if duration > cfg.max_duration_sec:
            raise StageError("ingest", f"Song is {fmt_duration(duration)} long; the limit is "
                                       f"{fmt_duration(cfg.max_duration_sec)}.")
        if duration < 1.0:
            raise StageError("ingest", "Audio is shorter than 1 second.")
        ctx["duration"] = duration
        ctx["title"] = cfg.title or nice_title(Path(display_name) if display_name else input_path, meta)
        log.info("[ingest] '%s', %s, decoded to 44.1 kHz WAV", ctx["title"], fmt_duration(duration))

    def separate(sub):
        from .separate import build_outputs, run_demucs

        info = run_demucs(
            ctx["input_wav"], stems_dir, input_sha, model_name=cfg.demucs_model,
            device_pref=cfg.device, shifts=cfg.demucs_shifts, overlap=cfg.demucs_overlap,
            progress=lambda f: sub(0.9 * f),
        )
        from .checks import weak_stem_warning

        ctx["device"] = info["device"]
        ctx["levels"] = build_outputs(stems_dir, out_dir, cfg.source, bitrate=cfg.backing_bitrate)
        log.info("[separate] stem levels: %s", ", ".join(
            f"{k} {v['share']:.0%}/{v['active']:.0%}" for k, v in ctx["levels"].items()))
        warn(weak_stem_warning(ctx["levels"], cfg.source))

    def beats(sub):
        from .beats import track_beats

        grid = track_beats(ctx["input_wav"], ctx["duration"], stems_dir)
        (out_dir / "beats.json").write_text(json.dumps(grid.to_dict()))
        ctx["grid"] = grid

    def transcribe(sub):
        from .separate import source_audio_path
        from .transcribe import transcribe as bp_transcribe

        audio = source_audio_path(cfg.source, stems_dir, ctx["input_wav"])
        log.info("[transcribe] source=%s (%s)", cfg.source, audio.name)
        raw = bp_transcribe(audio, out_dir / "transcription.mid", cfg.transcribe, midi_tempo=ctx["grid"].bpm)
        (out_dir / "notes_raw.json").write_text(json.dumps([n.to_dict() for n in raw]))
        ctx["raw"] = raw

    def chart(sub):
        from .chart import build_chart, difficulty_stats

        c = build_chart(ctx["raw"], ctx["grid"], cfg.chart, ctx["title"], ctx["duration"], cfg.source)
        (out_dir / "chart.json").write_text(dump_chart(c))
        ctx["chart"] = c
        ctx["stats"] = {d: difficulty_stats(n) for d, n in c["difficulties"].items()}
        if not any(w["code"] == "weak_stem" for w in ctx["warnings"]):
            from .checks import few_notes_warning

            warn(few_notes_warning(ctx["stats"]["hard"]["notes"], ctx["duration"], cfg.source, ctx["levels"]))

    def notation(sub):
        from .notation import to_alphatex, write_musicxml

        (out_dir / "score.alphatex").write_text(to_alphatex(ctx["chart"], ctx["grid"]))
        sub(0.3)
        write_musicxml(ctx["chart"], ctx["grid"], out_dir / "score.musicxml")

    funcs = {"ingest": ingest, "separate": separate, "beats": beats,
             "transcribe": transcribe, "chart": chart, "notation": notation}

    # ---------------------------------------------------------------- run
    t_all = time.perf_counter()
    base = 0.0
    for name, weight in STAGES:
        report(name, base)
        log.info("[%s] starting", name)
        t0 = time.perf_counter()
        try:
            funcs[name](lambda f, b=base, w=weight, n=name: report(n, b + w * max(0.0, min(1.0, f))))
        except StageError:
            log.error("[%s] failed after %.2fs", name, time.perf_counter() - t0)
            raise
        except Exception as e:
            log.exception("[%s] failed after %.2fs", name, time.perf_counter() - t0)
            from .audio import AudioError

            detail = str(e) if isinstance(e, AudioError) else f"{type(e).__name__}: {e}"
            raise StageError(name, detail) from e
        timings[name] = round(time.perf_counter() - t0, 2)
        log.info("[%s] done in %.2fs", name, timings[name])
        base += weight

    total = round(time.perf_counter() - t_all, 2)
    result = {
        "title": ctx["title"],
        "durationSec": round(ctx["duration"], 3),
        "bpm": ctx["chart"]["song"]["bpm"],
        "source": cfg.source,
        "device": ctx.get("device"),
        "inputSha256": input_sha,
        "configFingerprint": cfg.fingerprint(),
        "timings": timings,
        "totalSec": total,
        "stats": ctx["stats"],
        "warnings": ctx["warnings"],
        "stemLevels": ctx["levels"],
        "files": list(OUTPUT_FILES),
        "pipelineVersion": __version__,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out_dir / "result.json").write_text(json.dumps(result, indent=2))
    log.info("All stages done in %.1fs: %s", total, ", ".join(f"{k} {v:.1f}s" for k, v in timings.items()))
    report("done", 1.0)
    return {**result, "cached": False}
