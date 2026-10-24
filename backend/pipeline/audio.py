"""ffmpeg / ffprobe helpers and hashing."""

from __future__ import annotations

import hashlib
import json
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Optional

SAMPLE_RATE = 44100
log = logging.getLogger("pipeline")


class AudioError(RuntimeError):
    pass


def require_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise AudioError(
                f"{tool} not found on PATH. Install it: macOS `brew install ffmpeg`, "
                "Windows `winget install Gyan.FFmpeg`, Linux `sudo apt install ffmpeg`."
            )


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            buf = f.read(chunk)
            if not buf:
                break
            h.update(buf)
    return h.hexdigest()


def probe(path: Path) -> dict:
    """Return {'duration': seconds, 'title': str|None, 'artist': str|None}."""
    require_ffmpeg()
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration:format_tags=title,artist:stream=codec_type",
        "-of", "json", str(path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        log.warning("ffprobe failed on %s: %s", path, res.stderr.strip()[:300])
        raise AudioError("Couldn't read that file as audio. Is it a valid MP3/WAV?")
    info = json.loads(res.stdout or "{}")
    streams = info.get("streams", [])
    if not any(s.get("codec_type") == "audio" for s in streams):
        raise AudioError("That file has no audio stream.")
    fmt = info.get("format", {})
    tags = {k.lower(): v for k, v in (fmt.get("tags") or {}).items()}
    try:
        duration = float(fmt.get("duration"))
    except (TypeError, ValueError):
        duration = 0.0
    return {"duration": duration, "title": tags.get("title"), "artist": tags.get("artist")}


def decode_to_wav(src: Path, dst: Path, sample_rate: int = SAMPLE_RATE, channels: int = 2) -> None:
    require_ffmpeg()
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.wav")
    cmd = [
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-i", str(src), "-vn", "-map", "0:a:0",
        "-ac", str(channels), "-ar", str(sample_rate), "-c:a", "pcm_s16le",
        str(tmp),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise AudioError(f"ffmpeg couldn't decode the audio: {res.stderr.strip()[:300]}")
    tmp.replace(dst)


def encode_mp3(src_wav: Path, dst: Path, bitrate: str = "192k") -> None:
    require_ffmpeg()
    tmp = dst.with_suffix(".tmp.mp3")
    cmd = [
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-i", str(src_wav), "-codec:a", "libmp3lame", "-b:a", bitrate, str(tmp),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise AudioError(f"ffmpeg couldn't encode MP3: {res.stderr.strip()[:300]}")
    tmp.replace(dst)


def nice_title(path: Path, tags: Optional[dict] = None) -> str:
    tags = tags or {}
    title, artist = tags.get("title"), tags.get("artist")
    if title and artist:
        return f"{artist} - {title}"
    if title:
        return title
    return path.stem.replace("_", " ").strip() or "Untitled"
