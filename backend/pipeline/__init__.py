"""Song -> chart + sheet music pipeline for the guitar side-scroller.

Run `python -m pipeline song.mp3 --out out/song/` from the backend/ folder.
"""

from . import env  # noqa: F401  (sets model cache paths before heavy imports)

OUTPUT_FILES = (
    "chart.json",
    "score.alphatex",
    "score.musicxml",
    "transcription.mid",
    "guitar.wav",
    "backing.mp3",
)

SOURCES = ("guitar", "other", "vocals", "bass", "piano", "mix")

__version__ = "0.2.0"  # bump to invalidate cached results when outputs change
