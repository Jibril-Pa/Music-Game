"""The lute's advice: Gemini reads how you just played (and your history in Tiger Data) and coaches you.

The bard's lute heard every chord, so after a run it talks: what went well, the one chord or chord
change to work on, what your fingers are probably doing wrong (C heard as Am: the ring finger isn't
pressing the A string), and a short drill. Gemini gets only facts the game measured (FACTS below)
and answers in a fixed JSON shape (ADVICE_SCHEMA), which the end screen draws.

Optional: without GEMINI_API_KEY, or if Gemini fails or is slow, advise() returns None and the game
shows its built-in tips (frontend/src/lib/coach/advice.ts).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import OrderedDict
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

log = logging.getLogger("coach")

DEFAULT_MODEL = "gemini-3.8-flash"
FALLBACK_MODEL = "gemini-flash-latest"
TIMEOUT_SEC = 15.0
CACHE_SIZE = 200

Mode = Literal["chords", "notes"]
Input = Literal["mic", "keyboard"]

# What the game can ask for (frontend/src/lib/combat/spells.ts: SYMBOL_SETS, CHORD_SHAPES, CHORD_FINGERS).
SYMBOLS: dict[str, list[str]] = {"chords": ["Em", "G", "D", "C", "Am", "A", "E"], "notes": ["E", "A", "D", "G", "B", "C"]}
CHORD_SHAPES = {"Em": "022000", "G": "320003", "C": "x32010", "D": "xx0232", "E": "022100", "A": "x02220", "Am": "x02210"}
CHORD_FINGERS = {"Em": "023000", "G": "210003", "C": "x32010", "D": "xx0132", "E": "023100", "A": "x01230", "Am": "x02310"}
NOTE_SPOTS = {"E": "low E string, open", "A": "A string, open", "D": "D string, open", "G": "G string, open", "B": "B string, open", "C": "B string, fret 1"}
WORLD_ERAS = {"forest": "Once Upon a Time", "desert": "A Thousand and One Nights", "future": "Ever After, Year 3000"}

SYSTEM = """You are the Lute: the talking lute of a young bard in "The Traveling Bard", a fairy-tale game played with a real guitar. You heard every chord the player strummed. After each run you coach them: short, warm, and concrete. Most players are beginners in their first weeks of guitar.

Rules:
- Use only numbers that appear in FACTS. Never invent statistics.
- Pick ONE focus: the chord or chord change that will help most next run. Prefer a chord or change with low accuracy and many tries.
- Be specific about technique: which finger, which string, which fret, how to strum, when to strum. FACTS.shapes lists each shape from low E to high e ("x" = don't play that string) and the finger on each string (1 index, 2 middle, 3 ring, 4 pinky, 0 open).
- When a chord was heard as another chord ("heardInstead" or "mixups"), compare the two shapes and name the likely physical cause, e.g. C heard as Am: the ring finger isn't pressing the A string at fret 3, so that string rings open.
- Timing: averageMs below 0 means strumming before the beat (rushing), above 0 after it (dragging). Only mention timing if it clearly matters (|averageMs| over 40).
- If FACTS.input is "keyboard", the player pressed keys, not strings: encourage them to try real chords, and don't diagnose fingers.
- If FACTS.history shows a chord improving across runs, celebrate it with the numbers.
- The drill uses 1 to 3 symbols from FACTS.allowed, usually the focus chord or the two chords of the focus change.
- Talk to the player as "you". A playful fairy-tale voice, but clarity first. Plain words a 12-year-old understands. No emoji, no markdown."""

ADVICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "At most 8 words, in character. Cheers a good run, rallies after a loss."},
        "praise": {"type": "string", "description": "One sentence on what went well, with one real number from FACTS."},
        "focus": {"type": "string", "description": "The chord or change to work on, like 'C' or 'G to C'. At most 12 characters."},
        "tips": {
            "type": "array",
            "minItems": 1,
            "maxItems": 2,
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "At most 6 words."},
                    "body": {"type": "string", "description": "One or two short sentences of concrete technique."},
                },
                "required": ["title", "body"],
            },
        },
        "drill": {
            "type": "object",
            "properties": {
                "chords": {"type": "array", "minItems": 1, "maxItems": 3, "items": {"type": "string"}},
                "reps": {"type": "integer", "minimum": 4, "maximum": 20},
                "how": {"type": "string", "description": "One sentence: how to practise it, slowly, off the clock."},
            },
            "required": ["chords", "reps", "how"],
        },
        "goal": {"type": "string", "description": "One measurable goal for the next run, from the numbers."},
    },
    "required": ["headline", "praise", "focus", "tips", "drill", "goal"],
}


# ------------------------------------------------------------------ request shapes (from the game)


class ChordStat(BaseModel):
    chord: str = Field(max_length=8)
    tries: int = Field(ge=0, le=100000)
    hits: int = Field(ge=0, le=100000)
    heardAs: dict[str, int] = Field(default_factory=dict, max_length=32)


class ChangeStat(BaseModel):
    from_: str = Field(alias="from", max_length=8)
    to: str = Field(max_length=8)
    changes: int = Field(ge=0, le=100000)
    firstTry: int = Field(ge=0, le=100000)


class Timing(BaseModel):
    n: int = Field(ge=0)
    meanMs: Optional[float] = None
    earlyShare: Optional[float] = None
    lateShare: Optional[float] = None


class RunSummary(BaseModel):
    """One run (Title or End -> End), summarised by the game (frontend/src/lib/coach/summary.ts)."""

    levels: list[str] = Field(max_length=16)
    world: str = Field(max_length=16)
    victory: bool
    seconds: float = Field(ge=0, le=86400)
    mode: Mode
    input: Input
    practice: bool = False
    tries: int = Field(ge=0)
    hits: int = Field(ge=0)
    perfects: int = Field(ge=0)
    slain: int = Field(ge=0)
    maxCombo: int = Field(ge=0)
    chords: list[ChordStat] = Field(default_factory=list, max_length=32)
    changes: list[ChangeStat] = Field(default_factory=list, max_length=96)
    timing: Optional[Timing] = None


# ------------------------------------------------------------------ facts -> Gemini -> advice


def _pct(hits: int, tries: int) -> Optional[int]:
    return round(100 * hits / tries) if tries else None


def build_facts(run: RunSummary, history: Optional[dict]) -> dict:
    """The only things Gemini may talk about: this run, then (if Tiger is on) earlier runs and everyone today."""
    allowed = SYMBOLS[run.mode]
    chords = sorted(run.chords, key=lambda c: (-(c.tries - c.hits), c.chord))
    facts: dict[str, Any] = {
        "input": run.input,
        "mode": run.mode,
        "practiceMode": run.practice,
        "allowed": allowed,
        "run": {
            "levels": run.levels,
            "world": WORLD_ERAS.get(run.world, run.world),
            "outcome": "won" if run.victory else "lost (the bard ran out of health)",
            "minutes": round(run.seconds / 60, 1),
            "tries": run.tries,
            "right": run.hits,
            "accuracyPct": _pct(run.hits, run.tries),
            "perfectPct": _pct(run.perfects, run.hits),
            "bestCombo": run.maxCombo,
            "foesSlain": run.slain,
            "chords": [
                {"chord": c.chord, "tries": c.tries, "right": c.hits, "accuracyPct": _pct(c.hits, c.tries), **({"heardInstead": c.heardAs} if c.heardAs else {})}
                for c in chords
                if c.tries
            ],
            "changes": [
                {"change": f"{c.from_} to {c.to}", "times": c.changes, "firstStrumRight": c.firstTry}
                for c in sorted(run.changes, key=lambda c: (c.firstTry / c.changes if c.changes else 1, -c.changes))
                if c.changes >= 2
            ][:6],
        },
    }
    if run.timing and run.timing.n >= 5 and run.timing.meanMs is not None:
        facts["run"]["timing"] = {"hitsTimed": run.timing.n, "averageMs": round(run.timing.meanMs)}
    if history:
        facts["history"] = _history_facts(history, allowed)
    used = {c.chord for c in run.chords} | {c.to for c in run.changes} | {c.from_ for c in run.changes}
    if run.mode == "chords":
        facts["shapes"] = {c: {"frets": CHORD_SHAPES[c], "fingers": CHORD_FINGERS[c]} for c in allowed if c in used and c in CHORD_SHAPES}
        # The shapes of chords it was heard as, so the mix-up can be explained.
        for c in run.chords:
            for heard in c.heardAs:
                if heard in CHORD_SHAPES:
                    facts["shapes"][heard] = {"frets": CHORD_SHAPES[heard], "fingers": CHORD_FINGERS[heard]}
    else:
        facts["notes"] = {n: NOTE_SPOTS[n] for n in allowed if n in used and n in NOTE_SPOTS}
    return facts


def _history_facts(h: dict, allowed: list[str]) -> dict:
    totals = h.get("totals") or {}
    runs = h.get("runs") or []
    trend: dict[str, list[int]] = {}
    for r in runs:
        for chord, (hits, tries) in (r.get("chords") or {}).items():
            if tries >= 3 and chord in allowed:
                trend.setdefault(chord, []).append(round(100 * hits / tries))
    out: dict[str, Any] = {
        "runs": totals.get("runs"),
        "daysPlayed": totals.get("days"),
        "minutesPlayed": totals.get("minutes"),
        "chordsPlayed": totals.get("plays"),
        "chordAccuracyByRunPct": {c: v for c, v in trend.items() if len(v) >= 2},
        "changes": [{"change": f"{c['from']} to {c['to']}", "times": c["changes"], "firstStrumRight": c["firstTry"]} for c in (h.get("changes") or [])][:4],
        "mixups": [{"needed": m["target"], "heard": m["heard"], "times": m["n"]} for m in (h.get("mixups") or [])][:4],
    }
    t = h.get("timing") or {}
    if (t.get("n") or 0) >= 10 and t.get("meanMs") is not None:
        out["timing"] = {"hitsTimed": t["n"], "averageMs": round(t["meanMs"])}
    c = h.get("community") or {}
    chords = c.get("chords") or {}
    rated = [(k, v[0], v[1]) for k, v in chords.items() if v[1] >= 20 and k in allowed]
    if (c.get("bards") or 0) >= 2 and rated:
        k, hits, tries = min(rated, key=lambda x: x[1] / x[2])
        out["everyoneLast24h"] = {"bards": c["bards"], "hardestChord": k, "hardestAccuracyPct": round(100 * hits / tries)}
    return out


def _clean(raw: Any, allowed: list[str]) -> Optional[dict]:
    """Gemini's JSON, checked and trimmed to what the end screen can draw (None if unusable)."""
    if not isinstance(raw, dict):
        return None

    def s(v: Any, n: int) -> str:
        v = " ".join(str(v or "").split())
        return v if len(v) <= n else v[: n - 1].rstrip() + "…"

    tips = [{"title": s(t.get("title"), 60), "body": s(t.get("body"), 320)} for t in (raw.get("tips") or []) if isinstance(t, dict) and t.get("body")][:2]
    drill = raw.get("drill") if isinstance(raw.get("drill"), dict) else {}
    chords: list[str] = []
    for c in drill.get("chords") or []:
        c = str(c).strip()
        if c in allowed and c not in chords:
            chords.append(c)
    if not tips or not raw.get("headline"):
        return None
    try:
        reps = max(4, min(20, int(drill.get("reps") or 8)))
    except (TypeError, ValueError):
        reps = 8
    return {
        "headline": s(raw.get("headline"), 80),
        "praise": s(raw.get("praise"), 240),
        "focus": s(raw.get("focus"), 16),
        "tips": tips,
        "drill": {"chords": chords[:3], "reps": reps, "how": s(drill.get("how"), 240)} if chords else None,
        "goal": s(raw.get("goal"), 200),
    }


class Coach:
    def __init__(self) -> None:
        self._client = None
        self._cache: "OrderedDict[str, dict]" = OrderedDict()
        self.status = "off" if not self.configured() else "unknown"

    @staticmethod
    def key() -> str:
        return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()

    def configured(self) -> bool:
        return bool(self.key())

    @property
    def model(self) -> str:
        return (os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL).strip()

    def _get_client(self):
        if self._client is None:
            from google import genai
            from google.genai import types

            self._client = genai.Client(
                api_key=self.key(),
                http_options=types.HttpOptions(timeout=int(TIMEOUT_SEC * 1000), retry_options=types.HttpRetryOptions(attempts=1)),
            )
        return self._client

    async def advise(self, cache_key: str, run: RunSummary, history: Optional[dict]) -> Optional[dict]:
        """The lute's advice for one run, or None (no key, Gemini failed, or it was too slow)."""
        if not self.configured():
            self.status = "off"
            return None
        if cache_key in self._cache:
            self._cache.move_to_end(cache_key)
            return self._cache[cache_key]
        facts = build_facts(run, history)
        prompt = "FACTS:\n" + json.dumps(facts, separators=(",", ":"), ensure_ascii=False) + "\n\nWrite the lute's advice for this run."
        try:
            raw = await asyncio.wait_for(self._generate(prompt), TIMEOUT_SEC + 2)
        except asyncio.TimeoutError:
            self.status = "error: timed out"
            log.warning("Gemini timed out after %.0fs", TIMEOUT_SEC)
            return None
        except Exception as e:  # network, auth, quota: the game falls back to its own tips
            self.status = f"error: {_describe(e)}"
            log.warning("Gemini failed: %s", self.status)
            return None
        advice = _clean(raw, facts["allowed"])
        if advice is None:
            self.status = "error: unusable answer"
            log.warning("Gemini answer didn't fit the schema: %.300s", raw)
            return None
        self.status = "ok"
        self._cache[cache_key] = advice
        while len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return advice

    async def _generate(self, prompt: str) -> Any:
        from google.genai import errors, types

        client = self._get_client()

        def config(thinking: bool) -> types.GenerateContentConfig:
            return types.GenerateContentConfig(
                system_instruction=SYSTEM,
                response_mime_type="application/json",
                response_json_schema=ADVICE_SCHEMA,
                max_output_tokens=2048,
                thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW) if thinking else None,
                # No tools here: skip the SDK's function-calling loop.
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )

        model, thinking = self.model, True
        for _ in range(3):
            try:
                resp = await client.aio.models.generate_content(model=model, contents=prompt, config=config(thinking))
                text = resp.text or ""
                usage = resp.usage_metadata
                log.info(
                    "Gemini %s: %s prompt + %s answer tokens",
                    model,
                    getattr(usage, "prompt_token_count", "?"),
                    getattr(usage, "candidates_token_count", "?"),
                )
                return json.loads(text)
            except errors.ClientError as e:
                # A model this key can't use: try the alias of the newest Flash once.
                if e.code == 404 and model != FALLBACK_MODEL:
                    log.warning("Gemini model %s not found; trying %s", model, FALLBACK_MODEL)
                    model = FALLBACK_MODEL
                    continue
                # A model that doesn't take a thinking level: ask again without one.
                if e.code == 400 and thinking and "think" in str(e.message or "").lower():
                    thinking = False
                    continue
                raise
        raise RuntimeError("Gemini: no usable model")


def _describe(e: Exception) -> str:
    code = getattr(e, "code", None)
    msg = str(getattr(e, "message", "") or e).strip().splitlines()[0][:160] if str(e).strip() else type(e).__name__
    if code == 429:
        return "rate limited (429): wait a minute"
    if code in (401, 403) or "api key" in msg.lower():
        return f"key rejected ({code}): check GEMINI_API_KEY in backend/.env"
    return f"{code} {msg}" if code else msg


coach = Coach()
