"""Download and verify every model file up front, so the demo works offline.

    cd backend && .venv/bin/python setup_models.py

- Demucs htdemucs_6s weights -> backend/models/huggingface/ (HF cache)
- Basic Pitch model files ship inside the pip package; this checks they are
  there and runs a 1-second warm-up transcription.
- Runs a tiny Demucs separation on the chosen device (CUDA / MPS / CPU) to
  make sure that device actually works on this machine.
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pipeline  # noqa: E402  (sets HF_HOME etc. first)
from pipeline.env import MODELS_DIR  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s")
warnings.filterwarnings("ignore")


def step(msg: str) -> None:
    print(f"\n==> {msg}", flush=True)


def main() -> int:
    ok = True
    print(f"Model cache: {MODELS_DIR}")
    print(f"HF_HOME:     {os.environ['HF_HOME']}")

    # ------------------------------------------------------------ Demucs
    step("Demucs htdemucs_6s weights")
    import torch
    from pipeline.separate import describe_device, load_demucs, pick_device

    t = time.time()
    model = load_demucs("htdemucs_6s")
    print(f"    loaded in {time.time() - t:.1f}s, stems: {', '.join(model.sources)}")

    step("Demucs device check")
    from demucs.apply import apply_model

    device = pick_device("auto")
    x = torch.randn(1, 2, model.samplerate * 3) * 0.1
    try:
        t = time.time()
        with torch.no_grad():
            apply_model(model, x, device=device, split=True, overlap=0.25, progress=False)
        print(f"    {describe_device(device)} works ({time.time() - t:.1f}s for 3s of audio)")
    except Exception as e:
        print(f"    {device} failed ({e}); the pipeline will fall back to CPU")
        if device != "cpu":
            with torch.no_grad():
                apply_model(model, x, device="cpu", split=True, overlap=0.25, progress=False)
            print("    cpu works")

    # ------------------------------------------------------------ Basic Pitch
    step("Basic Pitch model files")
    import numpy as np
    import soundfile as sf
    from pipeline.config import TranscribeConfig
    from pipeline.transcribe import model_path, transcribe

    mp = model_path()
    for f in sorted(mp.parent.iterdir()):
        print(f"    {'*' if f.name == mp.name else ' '} {f.name}")
    if not mp.exists():
        print(f"    MISSING: {mp}")
        ok = False
    else:
        with tempfile.TemporaryDirectory() as td:
            sr = 22050
            tt = np.arange(sr) / sr
            sf.write(f"{td}/a.wav", 0.5 * np.sin(2 * np.pi * 220 * tt), sr)  # A3
            t = time.time()
            notes = transcribe(Path(f"{td}/a.wav"), Path(f"{td}/a.mid"), TranscribeConfig())
            print(f"    warm-up transcription OK in {time.time() - t:.1f}s -> {[n.pitch for n in notes]} (expect [57])")

    # ------------------------------------------------------------ librosa / numba warm-up
    step("librosa beat tracker warm-up (numba JIT)")
    import librosa

    y = np.zeros(22050 * 4, dtype=np.float32)
    y[:: 11025] = 1.0
    t = time.time()
    librosa.beat.beat_track(y=y, sr=22050)
    print(f"    OK in {time.time() - t:.1f}s")

    print("\nAll models ready. The pipeline now runs without internet." if ok else "\nSome checks failed (see above).")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
