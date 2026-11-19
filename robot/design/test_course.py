"""Run with uv run --with mujoco==3.17.0 python robot/design/test_course.py."""

import unittest

import numpy as np
from course import course_settings, run_course
from simulate import parameters, scene


class CollectionTrialTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.params = parameters()

    def test_two_balls_meet_and_remain_in_bin(self):
        trial = run_course(self.params, course_settings({"lane": -64}), scene)
        self.assertTrue(trial["firstStored"])
        self.assertTrue(trial["retained"])
        self.assertEqual(trial["stored"], [True, True])
        # In this lane the second ball meets the first. A missing collision mask lets
        # their centres overlap even if both endpoints look like successful loads.
        separation = min(
            np.linalg.norm(np.subtract(*f["balls"])) for f in trial["frames"]
        )
        self.assertAlmostEqual(separation, self.params.ball.dia, delta=0.5)

    def test_wide_second_ball_misses_with_first_still_retained(self):
        trial = run_course(self.params, course_settings({"lane": 185}), scene)
        self.assertEqual(trial["entered"], [True, False])
        self.assertEqual(trial["stored"], [True, False])
        self.assertTrue(trial["retained"])


if __name__ == "__main__":
    unittest.main()
