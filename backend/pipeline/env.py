"""Paths and environment defaults.

Imported before torch / huggingface_hub so that model caches live inside the
project (backend/models/) and the demo keeps working offline once
`python setup_models.py` has downloaded everything.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("GS_MODELS_DIR", BACKEND_DIR / "models"))
DATA_DIR = Path(os.environ.get("GS_DATA_DIR", BACKEND_DIR / "data"))
JOBS_DIR = DATA_DIR / "jobs"


def configure() -> None:
    os.environ.setdefault("HF_HOME", str(MODELS_DIR / "huggingface"))
    os.environ.setdefault("TORCH_HOME", str(MODELS_DIR / "torch"))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    # Let unsupported MPS ops fall back to CPU instead of crashing.
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


configure()
