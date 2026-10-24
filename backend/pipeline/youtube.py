"""Optional YouTube ingestion (off unless ENABLE_YOUTUBE=true).

Isolated on purpose: imported lazily, every failure becomes one friendly
message, and it never touches the MP3 upload path.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Tuple
from urllib.parse import urlparse

log = logging.getLogger("pipeline")

FRIENDLY_ERROR = "Couldn't fetch that link, please upload an MP3 instead."
ALLOWED_HOSTS = ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be")


class YouTubeError(Exception):
    pass


def enabled() -> bool:
    return os.environ.get("ENABLE_YOUTUBE", "false").strip().lower() in ("1", "true", "yes", "on")


def fetch_audio(url: str, dest_dir: Path, max_duration_sec: float = 480) -> Tuple[Path, str]:
    """Download audio only. Returns (path, title). Raises YouTubeError with a friendly message."""
    try:
        host = (urlparse(url).hostname or "").lower()
        if host not in ALLOWED_HOSTS:
            raise YouTubeError("That doesn't look like a YouTube link, please upload an MP3 instead.")
        import yt_dlp

        dest_dir.mkdir(parents=True, exist_ok=True)
        opts = {
            "format": "bestaudio/best",
            "outtmpl": str(dest_dir / "youtube.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 20,
            "retries": 2,
            "max_filesize": 150 * 1024 * 1024,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if (info.get("duration") or 0) > max_duration_sec:
                raise YouTubeError(f"That video is longer than {int(max_duration_sec // 60)} minutes, please upload a shorter MP3.")
            info = ydl.extract_info(url, download=True)
            path = Path(ydl.prepare_filename(info))
        if not path.exists():
            raise YouTubeError(FRIENDLY_ERROR)
        return path, info.get("title") or "YouTube audio"
    except YouTubeError:
        raise
    except Exception as e:  # network, extractor, ffmpeg... all the same to the user
        log.warning("YouTube fetch failed for %s: %s", url, e)
        raise YouTubeError(FRIENDLY_ERROR) from e
