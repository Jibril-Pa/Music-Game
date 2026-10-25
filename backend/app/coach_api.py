"""Routes for the lute's coach.

POST /plays                 text/plain or JSON {playerId, runId, plays: [...], run?}: store in Tiger Data
POST /coach                 {playerId, runId, run}: {advice, source, history, services}
GET  /progress/{playerId}   ?mode=chords|notes: {history, services}

The game posts as text/plain so no CORS preflight is needed (fewer requests on bad wifi). Every
route answers fast with nulls when Tiger or Gemini is off or unreachable; the game then uses its
own tips.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, TypeVar

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, ValidationError

from . import tiger
from .coach import Input, Mode, RunSummary, coach

router = APIRouter()

ID_PATTERN = r"^[A-Za-z0-9_-]{6,64}$"
MAX_BODY = 1_000_000
M = TypeVar("M", bound=BaseModel)


class PlayIn(BaseModel):
    """One input the game judged (frontend/src/lib/coach/log.ts)."""

    t: datetime
    levelId: str = Field(max_length=16)
    world: str = Field(max_length=16)
    scene: str = Field(max_length=16)
    mode: Mode
    input: Input
    practice: bool = False
    played: str = Field(min_length=1, max_length=8)
    target: Optional[str] = Field(default=None, max_length=8)
    wanted: list[str] = Field(default_factory=list, max_length=8)
    hit: bool
    grade: Optional[Literal["perfect", "good", "off"]] = None
    offsetMs: Optional[float] = Field(default=None, ge=-10000, le=10000)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    latencyMs: Optional[float] = Field(default=None, ge=0, le=10000)


class PlaysIn(BaseModel):
    playerId: str = Field(pattern=ID_PATTERN)
    runId: str = Field(pattern=ID_PATTERN)
    plays: list[PlayIn] = Field(default_factory=list, max_length=2000)
    run: Optional[RunSummary] = None


class CoachIn(BaseModel):
    playerId: str = Field(pattern=ID_PATTERN)
    runId: str = Field(pattern=ID_PATTERN)
    run: RunSummary


async def _body(request: Request, model: type[M]) -> M:
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(413, "Body too large")
    try:
        return model.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False, include_input=False)[:5])


def services() -> dict:
    return {"tiger": tiger.status(), "gemini": coach.status}


def _play_rows(body: PlaysIn) -> list[tuple]:
    now = datetime.now(timezone.utc)
    oldest, newest = now - timedelta(days=2), now + timedelta(minutes=5)
    rows = []
    for p in body.plays:
        t = p.t if p.t.tzinfo else p.t.replace(tzinfo=timezone.utc)
        if not oldest <= t <= newest:  # a wrong clock or a replayed batch
            continue
        rows.append(
            (
                t,
                body.playerId,
                body.runId,
                p.levelId,
                p.world,
                p.scene,
                p.mode,
                p.input,
                p.practice,
                p.played,
                p.target,
                p.wanted,
                p.hit,
                p.grade,
                p.offsetMs,
                p.confidence,
                p.latencyMs,
            )
        )
    return rows


def _run_row(body: PlaysIn) -> Optional[tuple]:
    r = body.run
    if r is None or not r.levels:
        return None
    return (
        datetime.now(timezone.utc),
        body.playerId,
        body.runId,
        r.levels[0],
        r.levels[-1],
        r.world,
        r.mode,
        r.input,
        r.practice,
        r.victory,
        r.seconds,
        r.tries,
        r.hits,
        r.perfects,
        r.slain,
        r.maxCombo,
    )


@router.post("/plays")
async def post_plays(request: Request):
    body = await _body(request, PlaysIn)
    stored = 0
    if tiger.configured():
        try:
            stored = await run_in_threadpool(tiger.insert, _play_rows(body), _run_row(body))
        except tiger.TigerUnavailable:
            stored = 0
    return {"stored": stored, "services": services()}


async def _history(player: str, mode: str) -> Optional[dict]:
    if not tiger.configured():
        return None
    try:
        return await run_in_threadpool(tiger.history, player, mode)
    except tiger.TigerUnavailable:
        return None


@router.post("/coach")
async def post_coach(request: Request):
    body = await _body(request, CoachIn)
    history = await _history(body.playerId, body.run.mode)
    advice = await coach.advise(f"{body.playerId}:{body.runId}", body.run, history)
    return {
        "advice": advice,
        "source": "gemini" if advice else None,
        "model": coach.model if advice else None,
        "history": history,
        "services": services(),
    }


@router.get("/progress/{player_id}")
async def get_progress(player_id: str, mode: Mode = "chords"):
    if not 6 <= len(player_id) <= 64 or not all(c.isalnum() or c in "_-" for c in player_id):
        raise HTTPException(422, "Bad player id")
    return {"history": await _history(player_id, mode), "services": services()}
