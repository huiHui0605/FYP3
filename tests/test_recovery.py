from itertools import permutations
import json
from pathlib import Path
import unittest

from engine import propagate, simulate, topology


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.sample = json.loads((Path(__file__).parents[1] / "sample.json").read_text())
        self.nodes = topology(self.sample)

    def test_drill_schedule_matches_exhaustive_orders(self):
        failures = ["grid", "solar", "fiber", "identity", "building"]
        result = simulate(self.nodes, failures, 50)
        schedule = result["schedule"]
        possibilities = []
        for order in permutations(failures):
            remaining = set(failures)
            loss = 0
            for key in order:
                offline, _, _ = propagate(self.nodes, remaining)
                loss += sum(self.nodes[item]["weight"] for item in offline) * self.nodes[key]["hours"]
                remaining.remove(key)
            possibilities.append((loss, order))
        self.assertEqual((schedule["lost_priority_hours"], tuple(s["repair"] for s in schedule["steps"])),
                         min(possibilities))

    def test_drill_checkpoints_and_deadline_boundaries(self):
        result = simulate(self.nodes, ["grid", "solar", "fiber"], 17)
        schedule = result["schedule"]
        self.assertEqual([(s["finish"], s["online_score"]) for s in schedule["steps"]],
                         [(2, 53), (8, 93), (11, 100)])
        self.assertEqual(schedule["lost_priority_hours"], 497)
        self.assertTrue(all(g["outcome"] == "met" for g in schedule["goals"]))
        self.assertEqual(sorted(key for s in schedule["steps"] for key in s["restored"]),
                         result["recovered"])

    def test_unreached_late_and_always_online_goals(self):
        failures = ["grid", "solar", "fiber"]
        with_budget = simulate(self.nodes, failures, 8)["schedule"]
        self.assertEqual({g["node"] for g in with_budget["goals"] if g["outcome"] == "late"},
                         {"support", "learning"})
        without_budget = simulate(self.nodes, failures, 0)["schedule"]
        self.assertEqual(without_budget["steps"], [])
        self.assertTrue(all(g["actual"] is None for g in without_budget["goals"]))
        no_faults = simulate(self.nodes, [], 0)["schedule"]
        self.assertTrue(all(g["actual"] == 0 for g in no_faults["goals"]))

    def test_malformed_and_legacy_timing(self):
        for field, value in [("hours", 0), ("hours", False), ("target_hours", -1),
                             ("target_hours", 721), ("hours", 1.5)]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                topology([dict(self.sample[0], **{field: value})])
        legacy = dict(self.sample[0])
        del legacy["hours"]
        nodes = topology([legacy])
        result = simulate(nodes, ["grid"], 8)["schedule"]
        self.assertEqual(result["hours"], 1)
        self.assertEqual(result["goals"], [])
