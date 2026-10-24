"""Cut-off file detection and weak-stem warnings."""

import numpy as np
import soundfile as sf

from pipeline.checks import cutoff_warning, few_notes_warning, stem_levels, trim_silent_tail, weak_stem_warning

SR = 44100


def tone(sec, amp=0.3):
    t = np.arange(int(sec * SR)) / SR
    x = amp * np.sin(2 * np.pi * 220 * t)
    return np.stack([x, x], axis=1).astype(np.float32)


def test_cut_off_file_is_trimmed_and_flagged(tmp_path):
    wav = tmp_path / "a.wav"
    sf.write(wav, np.concatenate([tone(20), np.zeros((SR * 60, 2), np.float32)]), SR)
    info = trim_silent_tail(wav)
    assert info["trimmed"] and abs(info["audioEndSec"] - 20) < 0.01 and abs(info["originalSec"] - 80) < 0.01
    assert abs(sf.info(str(wav)).duration - 21.0) < 0.01  # music + 1 s
    w = cutoff_warning(info)
    assert w and w["code"] == "cut_off" and "0:20" in w["message"] and "1:00" in w["message"]


def test_normal_ending_is_left_alone(tmp_path):
    wav = tmp_path / "b.wav"
    sf.write(wav, np.concatenate([tone(20), np.zeros((SR * 2, 2), np.float32)]), SR)
    info = trim_silent_tail(wav)
    assert not info["trimmed"] and cutoff_warning(info) is None
    assert abs(sf.info(str(wav)).duration - 22.0) < 0.01


def test_weak_guitar_suggests_strongest_stem():
    sec = 30.37  # not a whole number of seconds
    loud, quiet = tone(sec, 0.3), tone(sec, 0.01)
    stems = {"drums": loud, "bass": loud, "guitar": quiet, "other": tone(sec, 0.2),
             "vocals": tone(sec, 0.005), "piano": np.zeros_like(loud)}
    levels = stem_levels(stems, SR)
    assert levels["guitar"]["share"] < 0.1 and levels["other"]["share"] > 0.2
    w = weak_stem_warning(levels, "guitar")
    assert w and w["code"] == "weak_stem" and w["suggestSources"] == ["other", "bass", "mix"]
    assert weak_stem_warning(levels, "other") is None  # a strong stem gets no warning
    assert weak_stem_warning(levels, "mix") is None


def test_few_notes():
    assert few_notes_warning(10, 60.0, "guitar", {})["code"] == "few_notes"
    assert few_notes_warning(100, 60.0, "guitar", {}) is None
