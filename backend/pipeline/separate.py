"""Stage 2: stem separation with Demucs htdemucs_6s.

Writes all six stems to a cache folder (stems/*.flac) so switching --source
never re-runs Demucs, then builds:
  guitar.wav  - the part the player plays (guitar stem, plus the --source stem
                when that is `other` or `vocals`)
  backing.mp3 - everything else, so backing + guitar.wav == original mix
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Callable, Dict, Optional

import numpy as np
import soundfile as sf

from . import env  # noqa: F401
from .audio import SAMPLE_RATE, encode_mp3

log = logging.getLogger("pipeline")

STEM_NAMES = ("drums", "bass", "other", "vocals", "guitar", "piano")
_MODEL_CACHE: dict = {}


# --------------------------------------------------------------------------- device

def pick_device(preference: str = "auto") -> str:
    import torch

    pref = (preference or "auto").lower()
    if pref != "auto":
        if pref == "cuda" and not torch.cuda.is_available():
            log.warning("CUDA requested but not available, using CPU")
            return "cpu"
        if pref == "mps" and not torch.backends.mps.is_available():
            log.warning("MPS requested but not available, using CPU")
            return "cpu"
        return pref
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def describe_device(device: str) -> str:
    import torch

    if device == "cuda":
        return f"cuda (NVIDIA {torch.cuda.get_device_name(0)})"
    if device == "mps":
        return "mps (Apple Silicon GPU)"
    return "cpu"


# --------------------------------------------------------------------------- model

def load_demucs(name: str = "htdemucs_6s"):
    """Load from the local HuggingFace cache first (works offline), else download."""
    if name in _MODEL_CACHE:
        return _MODEL_CACHE[name]
    import yaml
    from demucs.apply import BagOfModels
    from demucs.hf import DEFAULT_NAMESPACE, hf_repo_name, load_safetensors_model
    from huggingface_hub import hf_hub_download

    repo_id = f"{DEFAULT_NAMESPACE}/{hf_repo_name(name)}"

    def _load(local_only: bool):
        with open(hf_hub_download(repo_id, f"{name}.yaml", local_files_only=local_only)) as f:
            bag = yaml.safe_load(f)
        models = [
            load_safetensors_model(hf_hub_download(repo_id, f"{sig}.safetensors", local_files_only=local_only))
            for sig in bag["models"]
        ]
        return BagOfModels(models, bag.get("weights"), bag.get("segment"))

    try:
        model = _load(local_only=True)
    except Exception:
        log.info("Demucs weights not cached yet, downloading %s (run setup_models.py to pre-fetch)", repo_id)
        try:
            model = _load(local_only=False)
        except Exception:
            # Last resort: demucs' own loader (HF hub, then the legacy AWS repo).
            from demucs.pretrained import get_model

            model = get_model(name)
    model.eval()
    _MODEL_CACHE[name] = model
    return model


# --------------------------------------------------------------------------- separation

def stems_key(input_wav: Path, input_sha: str) -> str:
    # Length is part of the key: a trimmed input.wav must not reuse untrimmed stems.
    return f"{input_sha}:{sf.info(str(input_wav)).frames}"


def stems_complete(stems_dir: Path, key: str) -> bool:
    marker = stems_dir / ".input_sha256"
    return (
        marker.exists()
        and marker.read_text().strip() == key
        and all((stems_dir / f"{s}.flac").exists() for s in STEM_NAMES)
    )


def run_demucs(
    input_wav: Path,
    stems_dir: Path,
    input_sha: str,
    model_name: str = "htdemucs_6s",
    device_pref: str = "auto",
    shifts: int = 1,
    overlap: float = 0.25,
    progress: Optional[Callable[[float], None]] = None,
) -> Dict[str, object]:
    """Separate input_wav into stems_dir/{stem}.flac. Returns info dict."""
    key = stems_key(input_wav, input_sha)
    if stems_complete(stems_dir, key):
        log.info("[separate] stems already cached in %s, skipping Demucs", stems_dir)
        return {"device": "cached", "cached": True}

    import torch
    from demucs.apply import apply_model

    model = load_demucs(model_name)
    if list(model.sources) != list(STEM_NAMES):
        log.info("[separate] model sources: %s", model.sources)

    data, sr = sf.read(str(input_wav), dtype="float32", always_2d=True)  # (n, ch)
    if sr != model.samplerate:
        raise RuntimeError(f"input.wav is {sr} Hz, Demucs expects {model.samplerate} Hz")
    wav = torch.from_numpy(data.T.copy())  # (ch, n)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    norm = (wav - mean) / std
    length = norm.shape[-1]

    done = {"max": 0.0}
    sub = model.models[0] if hasattr(model, "models") else model
    seg_len = int(float(getattr(sub, "segment", 8.0)) * model.samplerate)

    def cb(d: dict) -> None:
        if progress is None or d.get("state") != "end":
            return
        frac = min(1.0, (d.get("segment_offset", 0) + seg_len) / max(1, length))
        if frac > done["max"]:
            done["max"] = frac
            progress(frac)

    device = pick_device(device_pref)
    log.info("[separate] Demucs %s on device: %s", model_name, describe_device(device))

    def _apply(dev: str):
        with torch.no_grad():
            return apply_model(
                model, norm[None], device=dev, shifts=shifts, split=True,
                overlap=overlap, progress=False, callback=cb,
            )[0]

    try:
        out = _apply(device)
    except Exception as e:  # MPS can still hit unsupported ops / OOM
        if device == "cpu":
            raise
        log.warning("[separate] Demucs failed on %s (%s); retrying on CPU", device, e)
        device = "cpu"
        done["max"] = 0.0
        out = _apply("cpu")

    out = (out * std + mean).cpu().numpy()  # (sources, ch, n)
    stems_dir.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(model.sources):
        sf.write(str(stems_dir / f"{name}.flac"), out[i].T, sr, subtype="PCM_16")
    (stems_dir / ".input_sha256").write_text(key)
    if progress:
        progress(1.0)
    return {"device": device, "cached": False}


def player_stems(source: str) -> list:
    stems = ["guitar"]
    if source in ("other", "vocals", "bass", "piano"):
        stems.append(source)
    return stems


def build_outputs(stems_dir: Path, out_dir: Path, source: str, bitrate: str = "192k") -> dict:
    """Mix stems into guitar.wav (player part) and backing.mp3 (everything else).

    Returns per-stem levels (see checks.stem_levels) for the weak-stem warning.
    """
    from .checks import stem_levels

    play = set(player_stems(source))
    player_mix = None
    backing_mix = None
    stems = {}
    for name in STEM_NAMES:
        audio, sr = sf.read(str(stems_dir / f"{name}.flac"), dtype="float32", always_2d=True)
        stems[name] = audio
        if name in play:
            player_mix = audio if player_mix is None else player_mix + audio
        else:
            backing_mix = audio if backing_mix is None else backing_mix + audio

    sf.write(str(out_dir / "guitar.wav"), np.clip(player_mix, -1, 1), SAMPLE_RATE, subtype="PCM_16")
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "backing.wav"
        sf.write(str(tmp), backing_mix, SAMPLE_RATE, subtype="FLOAT")
        encode_mp3(tmp, out_dir / "backing.mp3", bitrate=bitrate)
    return stem_levels(stems, SAMPLE_RATE)


def source_audio_path(source: str, stems_dir: Path, input_wav: Path) -> Path:
    """Which audio file gets transcribed for a given --source."""
    if source == "mix":
        return input_wav
    return stems_dir / f"{source}.flac"
