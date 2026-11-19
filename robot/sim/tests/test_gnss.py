import math
import random
import statistics

import pytest

from mulligan_sim import params as P
from mulligan_sim.sensors import GNSS_FIXED, GNSS_FLOAT, PERFECT_GNSS, Gnss, GnssSpec
from mulligan_sim.world import IDEAL, World


def reads(spec, world, seconds, seed=0, gnss=None):
    g = gnss or Gnss(spec, random.Random(seed))
    out = []
    for _ in range(int(round(seconds / spec.period_s))):
        out.append(g.read(world))
    return g, out


def test_perfect_receiver_reports_truth_outside_the_roof():
    w = World(IDEAL, random.Random(0), x=12.0, y=-0.7)
    _, out = reads(PERFECT_GNSS, w, 2.0)
    fixed = [r for r in out if r is not None and r[2] == GNSS_FIXED]
    assert fixed
    for x, y, _ in fixed:
        assert (x, y) == (pytest.approx(12.0, abs=1e-12), pytest.approx(-0.7, abs=1e-12))


def test_no_solution_under_the_roof():
    w = World(IDEAL, random.Random(0), x=0.0)
    _, out = reads(GnssSpec(), w, 30.0)
    assert all(r is None for r in out)


def test_first_fix_arrives_within_the_configured_time_after_leaving_the_roof():
    spec = GnssSpec(float_rate_edge_per_s=0.0, float_rate_open_per_s=0.0, wrong_fix_p=0.0)
    for seed in range(30):
        w = World(IDEAL, random.Random(0), x=10.0)
        _, out = reads(spec, w, 15.0, seed)
        first = next(i for i, r in enumerate(out) if r[2] == GNSS_FIXED)
        assert spec.first_fix_s[0] - 0.2 <= first * spec.period_s <= spec.first_fix_s[1] + 0.2
        assert all(r[2] == GNSS_FLOAT for r in out[:first])


def test_fixed_error_is_centimetres_and_float_is_decimetres():
    spec = GnssSpec(survey_sd_m=0.0, survey_rot_sd_rad=0.0, wrong_fix_p=0.0)
    fixed_err, float_err = [], []
    for seed in range(40):
        w = World(IDEAL, random.Random(0), x=15.0, y=0.4)
        _, out = reads(spec, w, 60.0, seed)
        for x, y, q in out:
            (fixed_err if q == GNSS_FIXED else float_err).append(y - 0.4)
    expected_fixed = math.hypot(spec.fixed_white_sd_m, spec.fixed_slow_sd_m)
    assert statistics.pstdev(fixed_err) == pytest.approx(expected_fixed, rel=0.25)
    assert 0.2 < statistics.pstdev(float_err) < 0.6


def test_float_episodes_happen_at_the_configured_rate():
    spec = GnssSpec(first_fix_s=(0.0, 0.0), wrong_fix_p=0.0)
    w = World(IDEAL, random.Random(0), x=20.0)
    starts, total_s = 0, 0.0
    for seed in range(20):
        _, out = reads(spec, w, 600.0, seed)
        q = [r[2] for r in out]
        starts += sum(1 for a, b in zip(q, q[1:]) if a == GNSS_FIXED and b == GNSS_FLOAT)
        total_s += 600.0
    assert starts / total_s == pytest.approx(spec.float_rate_open_per_s, rel=0.3)


def test_wrong_fixes_happen_and_are_tens_of_centimetres():
    spec = GnssSpec(wrong_fix_p=1.0, survey_sd_m=0.0, survey_rot_sd_rad=0.0,
                    fixed_white_sd_m=0.0, fixed_slow_sd_m=0.0)
    w = World(IDEAL, random.Random(0), x=20.0)
    g, out = reads(spec, w, 15.0)
    fixed = [math.hypot(x - 20.0, y) for x, y, q in out if q == GNSS_FIXED]
    assert fixed and all(0.1 - 1e-9 <= e <= 0.4 + 1e-9 for e in fixed)


def test_no_corrections_means_float_only():
    w = World(IDEAL, random.Random(0), x=20.0)
    _, out = reads(GnssSpec(corrections=False), w, 60.0)
    assert {r[2] for r in out} == {GNSS_FLOAT}


def test_reproducible():
    w = World(IDEAL, random.Random(0), x=20.0)
    assert reads(GnssSpec(), w, 20.0, 5)[1] == reads(GnssSpec(), w, 20.0, 5)[1]
