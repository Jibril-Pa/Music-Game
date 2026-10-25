"""The lute's coach without the network: the facts Gemini gets, and how its answer is checked."""

import asyncio

from app import coach as coach_mod
from app.coach import Coach, RunSummary, _clean, build_facts

RUN = RunSummary.model_validate(
    {
        "levels": ["1-1", "1-2"],
        "world": "forest",
        "victory": False,
        "seconds": 252,
        "mode": "chords",
        "input": "mic",
        "tries": 40,
        "hits": 30,
        "perfects": 12,
        "slain": 25,
        "maxCombo": 9,
        "chords": [
            {"chord": "Em", "tries": 20, "hits": 19},
            {"chord": "C", "tries": 14, "hits": 6, "heardAs": {"Am": 6, "G": 2}},
            {"chord": "G", "tries": 6, "hits": 5},
        ],
        "changes": [{"from": "G", "to": "C", "changes": 7, "firstTry": 2}, {"from": "Em", "to": "G", "changes": 1, "firstTry": 1}],
        "timing": {"n": 30, "meanMs": -64.4},
    }
)

HISTORY = {
    "totals": {"plays": 400, "runs": 3, "days": 2, "minutes": 21.5},
    "runs": [
        {"chords": {"C": [2, 10], "Em": [9, 10]}},
        {"chords": {"C": [5, 10], "Em": [10, 10]}},
        {"chords": {"C": [6, 14], "Em": [19, 20], "G": [1, 2]}},
    ],
    "changes": [{"from": "G", "to": "C", "changes": 20, "firstTry": 6}],
    "mixups": [{"target": "C", "heard": "Am", "n": 14}],
    "timing": {"n": 200, "meanMs": -51},
    "community": {"bards": 12, "chords": {"C": [120, 260], "Em": [300, 320], "D": [5, 10]}},
}


def test_facts_lead_with_the_weakest_chord_and_carry_its_shapes():
    f = build_facts(RUN, None)
    assert f["run"]["chords"][0]["chord"] == "C"  # most misses first
    assert f["run"]["chords"][0]["heardInstead"] == {"Am": 6, "G": 2}
    assert f["run"]["accuracyPct"] == 75
    assert f["run"]["timing"] == {"hitsTimed": 30, "averageMs": -64}
    # Changes seen only once are noise.
    assert [c["change"] for c in f["run"]["changes"]] == ["G to C"]
    # The shapes of what was asked for and of what it was heard as, to explain the mix-up.
    assert f["shapes"]["C"] == {"frets": "x32010", "fingers": "x32010"}
    assert f["shapes"]["Am"]["frets"] == "x02210"
    assert "history" not in f


def test_history_facts_trend_and_community():
    f = build_facts(RUN, HISTORY)["history"]
    assert f["chordAccuracyByRunPct"]["C"] == [20, 50, 43]
    assert "G" not in f["chordAccuracyByRunPct"]  # under 3 tries in a run doesn't count
    assert f["mixups"] == [{"needed": "C", "heard": "Am", "times": 14}]
    assert f["everyoneLast24h"] == {"bards": 12, "hardestChord": "C", "hardestAccuracyPct": 46}


def test_keyboard_runs_get_no_finger_shapes_for_notes_mode():
    notes = RUN.model_copy(update={"mode": "notes", "chords": [], "changes": []})
    f = build_facts(notes, None)
    assert f["allowed"] == ["E", "A", "D", "G", "B", "C"]
    assert "shapes" not in f


def test_clean_trims_and_keeps_only_playable_drill_chords():
    raw = {
        "headline": "Your C is almost there!",
        "praise": "You landed Em 19 of 20 times.",
        "focus": "G to C",
        "tips": [{"title": "Ring finger down", "body": "Press the A string at fret 3 with your ring finger."}, {"title": "x", "body": "y"}, {"title": "z", "body": "w"}],
        "drill": {"chords": ["G", "C", "F#m", "C"], "reps": 99, "how": "Slowly."},
        "goal": "Land C 8 times out of 10.",
    }
    out = _clean(raw, ["Em", "G", "D", "C", "Am", "A", "E"])
    assert len(out["tips"]) == 2
    assert out["drill"] == {"chords": ["G", "C"], "reps": 20, "how": "Slowly."}
    assert _clean({"tips": []}, ["C"]) is None
    assert _clean("nope", ["C"]) is None


def test_advise_off_without_key_and_cached_with_one(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    c = Coach()
    assert asyncio.run(c.advise("p:r", RUN, None)) is None
    assert c.status == "off"

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = []

    async def fake_generate(self, prompt):
        calls.append(prompt)
        return {"headline": "Well played!", "praise": "p", "focus": "C", "tips": [{"title": "t", "body": "b"}], "drill": {"chords": ["C"], "reps": 8, "how": "h"}, "goal": "g"}

    monkeypatch.setattr(coach_mod.Coach, "_generate", fake_generate)
    c = Coach()
    a = asyncio.run(c.advise("p:r", RUN, HISTORY))
    b = asyncio.run(c.advise("p:r", RUN, HISTORY))
    assert a == b and a["headline"] == "Well played!"
    assert len(calls) == 1 and '"heardInstead":{"Am":6,"G":2}' in calls[0]
    assert c.status == "ok"


def test_advise_survives_a_failing_gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    async def boom(self, prompt):
        raise RuntimeError("network down")

    monkeypatch.setattr(coach_mod.Coach, "_generate", boom)
    c = Coach()
    assert asyncio.run(c.advise("p:r2", RUN, None)) is None
    assert c.status.startswith("error")
