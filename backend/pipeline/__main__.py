"""CLI: python -m pipeline song.mp3 --out out/song/

Pre-processes demo songs with the same code the API uses. Re-running on the
same file with the same settings is instant (cached by SHA-256); changing a
threshold re-runs everything except Demucs (stems are cached separately).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import warnings
from pathlib import Path

from . import OUTPUT_FILES, SOURCES
from .config import PipelineConfig
from .runner import StageError, run_pipeline


def setup_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    for noisy in ("numba", "matplotlib", "httpx", "urllib3", "huggingface_hub", "coremltools"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    warnings.filterwarnings("ignore", category=UserWarning)
    warnings.filterwarnings("ignore", category=FutureWarning)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m pipeline", description="Song -> chart.json + tab/sheet music + backing track")
    p.add_argument("input", help="audio file (mp3/wav/m4a/flac/...)")
    p.add_argument("--out", required=True, help="output folder, e.g. out/song/")
    p.add_argument("--source", choices=SOURCES, default="guitar",
                   help="stem to transcribe (default guitar; the run warns and suggests one when the guitar stem is weak)")
    p.add_argument("--title", help="song title (default: file tags or file name)")
    p.add_argument("--device", default="auto", choices=("auto", "cuda", "mps", "cpu"), help="Demucs device")
    p.add_argument("--stems-dir", help="where to cache Demucs stems (default <out>/stems)")
    p.add_argument("--force", action="store_true", help="ignore cached results")
    t = p.add_argument_group("transcription / cleanup tuning")
    t.add_argument("--onset-threshold", type=float, help="Basic Pitch onset threshold (default 0.5)")
    t.add_argument("--frame-threshold", type=float, help="Basic Pitch frame threshold (default 0.3)")
    t.add_argument("--min-note-ms", type=float, help="drop notes shorter than this (default 80)")
    t.add_argument("--min-amplitude", type=float, help="drop notes quieter than this, 0..1 (default 0.25)")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    setup_logging(args.verbose)
    log = logging.getLogger("pipeline")

    cfg = PipelineConfig(source=args.source, device=args.device, title=args.title)
    if args.onset_threshold is not None:
        cfg.transcribe.onset_threshold = args.onset_threshold
    if args.frame_threshold is not None:
        cfg.transcribe.frame_threshold = args.frame_threshold
    if args.min_note_ms is not None:
        cfg.transcribe.minimum_note_length_ms = args.min_note_ms
        cfg.chart.min_note_sec = args.min_note_ms / 1000.0
    if args.min_amplitude is not None:
        cfg.chart.min_amplitude = args.min_amplitude

    src = Path(args.input).expanduser()
    if not src.exists():
        log.error("Input file not found: %s", src)
        return 2

    out = Path(args.out).expanduser()
    try:
        result = run_pipeline(src, out, cfg, stems_dir=Path(args.stems_dir) if args.stems_dir else None, force=args.force)
    except StageError as e:
        log.error("%s", e)
        return 1

    print()
    print(("CACHED " if result.get("cached") else "") + f"Done: '{result['title']}' ({result['bpm']} BPM, source={result['source']}, device={result.get('device')})")
    for f in OUTPUT_FILES:
        print(f"  {out / f}")
    print("Timings: " + ", ".join(f"{k} {v:.1f}s" for k, v in result["timings"].items()) + f" (total {result['totalSec']:.1f}s)")
    print("Notes: " + json.dumps({d: s["notes"] for d, s in result["stats"].items()}))
    for w in result.get("warnings", []):
        hint = f" -> try: --source {' / '.join(w['suggestSources'])}" if w.get("suggestSources") else ""
        print(f"WARNING: {w['message']}{hint}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
