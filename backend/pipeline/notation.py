"""Stage 6: sheet music from the quantized chart.

score.alphatex - one track per difficulty (Hard, Medium, Easy), tab + standard
                 notation, rendered in the browser by alphaTab (alphaTex 1.7+
                 syntax: no `.` section separators).
score.musicxml - same content via music21, for MuseScore / Guitar Pro export.

Both are built from one shared layout: each grid slot becomes a beat that
lasts until the next slot (single voice), split at barlines and beats into
standard note values with ties.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .beats import BeatGrid

log = logging.getLogger("pipeline")

MEASURE = 16  # 16ths per 4/4 bar
VALUES = (16, 12, 8, 6, 4, 3, 2, 1)  # note lengths in 16ths
# length in 16ths -> (alphaTex duration, dotted)
DURATIONS = {16: (1, False), 12: (2, True), 8: (2, False), 6: (4, True), 4: (4, False), 3: (8, True), 2: (8, False), 1: (16, False)}
TRACK_ORDER = ("hard", "medium", "easy")
TUNING_ALPHATEX = "(E4 B3 G3 D3 A2 E2)"  # string 1 (high E) -> string 6


@dataclass
class Piece:
    length: int  # in 16ths, always one of VALUES
    notes: Optional[List[Tuple[int, int, int]]]  # [(string, fret, midi)] or None for a rest
    tie_from_prev: bool = False
    tie_to_next: bool = False


@dataclass
class Layout:
    first_beat: int  # beat number where measure 1 starts (<= 0)
    measures: List[List[Piece]] = field(default_factory=list)


def _allowed(pos: int, v: int) -> bool:
    if v in (16, 12):
        return pos == 0
    if v == 8:
        return pos % 8 == 0
    if v in (6, 4):
        return pos % 4 == 0
    if v == 3:
        return pos % 4 in (0, 1)
    if v == 2:
        return pos % 2 == 0
    return True


def decompose(pos: int, length: int) -> List[int]:
    """Split `length` 16ths starting at bar position `pos` into readable note values."""
    out = []
    while length > 0:
        room = length if pos % 4 == 0 else min(length, 4 - pos % 4)
        v = next(v for v in VALUES if v <= room and _allowed(pos, v))
        out.append(v)
        pos += v
        length -= v
    return out


def layout(notes: List[dict], grid: BeatGrid) -> Layout:
    # Group chart notes into slots (positions in 16ths from beat 0).
    slots: Dict[int, List[dict]] = defaultdict(list)
    for n in notes:
        slots[int(round(n["beat"] * 4))].append(n)
    qs = sorted(slots)
    events = []
    for i, q in enumerate(qs):
        ns = slots[q]
        ends = grid.time_to_beat([n["t"] + n["dur"] for n in ns])
        length = max(1, int(round(max(ends) * 4)) - q)
        if i + 1 < len(qs):
            length = min(length, qs[i + 1] - q)
        chord = sorted({(n["string"], n["fret"], n["midi"]) for n in ns})
        events.append((q, length, chord))

    first_q = qs[0] if qs else 0
    start = MEASURE * math.floor(min(0, first_q) / MEASURE)
    end = max([q + length for q, length, _ in events] + [start + MEASURE])
    end = start + MEASURE * math.ceil((end - start) / MEASURE)

    # Contiguous timeline of (start, length, notes|None).
    segs = []
    cursor = start
    for q, length, chord in events:
        if q > cursor:
            segs.append((cursor, q - cursor, None))
        segs.append((q, length, chord))
        cursor = q + length
    if cursor < end:
        segs.append((cursor, end - cursor, None))

    lay = Layout(first_beat=start // 4)
    lay.measures = [[] for _ in range((end - start) // MEASURE)]
    flat: List[Piece] = []
    for s, length, chord in segs:
        first_piece = True
        while length > 0:
            m = (s - start) // MEASURE
            pos = (s - start) % MEASURE
            chunk = min(length, MEASURE - pos)
            for v in decompose(pos, chunk):
                p = Piece(v, chord, tie_from_prev=(chord is not None and not first_piece))
                lay.measures[m].append(p)
                flat.append(p)
                first_piece = False
            s += chunk
            length -= chunk
    for a, b in zip(flat, flat[1:]):
        if a.notes is not None and b.tie_from_prev:
            a.tie_to_next = True
    return lay


# --------------------------------------------------------------------------- alphaTex

def _tex_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _tex_piece(p: Piece) -> str:
    dur, dotted = DURATIONS[p.length]
    if p.notes is None:
        content = "r"
    else:
        parts = [f"-.{s}" if p.tie_from_prev else f"{f}.{s}" for (s, f, _m) in p.notes]
        content = parts[0] if len(parts) == 1 else "(" + " ".join(parts) + ")"
    return f"{content}.{dur}" + (" {d}" if dotted else "")


def to_alphatex(chart: dict, grid: BeatGrid) -> str:
    song = chart["song"]
    bpm = max(1, int(round(song["bpm"])))
    lines = [
        f"\\title {_tex_str(song['title'])}",
        f"\\subtitle {_tex_str('Auto-transcribed - easy / medium / hard')}",
        f"\\tab {_tex_str('guitar-scroller')}",
    ]
    for ti, diff in enumerate(TRACK_ORDER):
        lay = layout(chart["difficulties"][diff], grid)
        lines.append("")
        # instrument 27 = clean electric guitar; alphaTab then shows notation an octave up (guitar convention)
        lines.append(f"\\track {_tex_str(diff.capitalize())} {{ instrument 27 }}")
        lines.append("  \\staff { score tabs }")
        lines.append(f"  \\tuning {TUNING_ALPHATEX}")
        bars = []
        for mi, pieces in enumerate(lay.measures):
            prefix = f"\\ts (4 4) \\tempo {bpm} " if (ti == 0 and mi == 0) else ""
            bars.append("  " + prefix + " ".join(_tex_piece(p) for p in pieces))
        lines.append(" |\n".join(bars))
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- MusicXML

def write_musicxml(chart: dict, grid: BeatGrid, path: Path) -> None:
    from music21 import articulations, chord, clef, metadata, meter, note, stream, tempo, tie

    song = chart["song"]
    score = stream.Score()
    score.insert(0, metadata.Metadata())
    score.metadata.title = song["title"]
    score.metadata.composer = "Auto-transcribed (guitar-scroller)"

    for diff in TRACK_ORDER:
        lay = layout(chart["difficulties"][diff], grid)
        part = stream.Part(id=f"P-{diff}")
        part.partName = f"Guitar ({diff})"
        for mi, pieces in enumerate(lay.measures):
            m = stream.Measure(number=mi + 1)
            if mi == 0:
                m.insert(0, clef.Treble8vbClef())
                m.insert(0, meter.TimeSignature("4/4"))
                m.insert(0, tempo.MetronomeMark(number=round(song["bpm"])))
            for p in pieces:
                ql = p.length / 4
                if p.notes is None:
                    el = note.Rest(quarterLength=ql)
                else:
                    ns = []
                    for s, f, midi in p.notes:
                        n = note.Note(midi, quarterLength=ql)
                        n.articulations.append(articulations.StringIndication(s))
                        n.articulations.append(articulations.FretIndication(f))
                        ns.append(n)
                    el = ns[0] if len(ns) == 1 else chord.Chord(ns, quarterLength=ql)
                    if p.tie_from_prev and p.tie_to_next:
                        el.tie = tie.Tie("continue")
                    elif p.tie_from_prev:
                        el.tie = tie.Tie("stop")
                    elif p.tie_to_next:
                        el.tie = tie.Tie("start")
                m.append(el)
            part.append(m)
        score.insert(0, part)
    score.write("musicxml", fp=str(path))
