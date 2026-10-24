"""Greedy string/fret assignment for standard tuning (EADGBE)."""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

# string number (1 = high E) -> open-string MIDI pitch
STANDARD_TUNING = {1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40}
LOWEST_PITCH = STANDARD_TUNING[6]


def highest_pitch(max_fret: int) -> int:
    return STANDARD_TUNING[1] + max_fret


def candidates(pitch: int, max_fret: int) -> List[Tuple[int, int]]:
    return [(s, pitch - o) for s, o in STANDARD_TUNING.items() if 0 <= pitch - o <= max_fret]


class FretAssigner:
    """Assigns each grid slot (single note or chord) to strings, greedily in time order.

    hard/medium: minimise distance from where the hand was on the previous slot.
    easy (prefer_low): prefer open strings and low frets.
    """

    def __init__(self, max_fret: int = 12, prefer_low: bool = False, start_position: float = 2.0):
        self.max_fret = max_fret
        self.prefer_low = prefer_low
        self.hand = start_position

    def _cost(self, frets: Sequence[int]) -> float:
        fretted = [f for f in frets if f > 0]
        c = 0.0
        for f in frets:
            if self.prefer_low:
                c += f
            else:
                c += 0.8 if f == 0 else abs(f - self.hand)
        if fretted:
            span = max(fretted) - min(fretted)
            if span > 3:  # hard-to-reach stretch
                c += 4.0 * (span - 3)
            if self.prefer_low:
                c += 0.25 * abs(sum(fretted) / len(fretted) - self.hand)
        return c

    def _search(self, pitches: Sequence[int]) -> Optional[List[Tuple[int, int, int]]]:
        best: dict = {"cost": float("inf"), "assign": None}
        cands = [candidates(p, self.max_fret) for p in pitches]

        def rec(i: int, used: set, cur: list):
            if i == len(pitches):
                c = self._cost([f for (_, _, f) in cur])
                if c < best["cost"]:
                    best["cost"], best["assign"] = c, list(cur)
                return
            for s, f in cands[i]:
                if s in used:
                    continue
                used.add(s)
                cur.append((pitches[i], s, f))
                rec(i + 1, used, cur)
                cur.pop()
                used.remove(s)

        rec(0, set(), [])
        return best["assign"]

    def assign(self, pitches_by_priority: Sequence[int]) -> List[Tuple[int, int, int]]:
        """Returns [(pitch, string, fret)]; drops lowest-priority notes that don't fit."""
        pitches = list(dict.fromkeys(pitches_by_priority))[:6]
        while pitches:
            result = self._search(pitches)
            if result is not None:
                fretted = [f for (_, _, f) in result if f > 0]
                if fretted:
                    self.hand = sum(fretted) / len(fretted)
                return sorted(result, key=lambda x: x[1])
            pitches = pitches[:-1]
        return []
