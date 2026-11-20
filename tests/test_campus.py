import json
from pathlib import Path
import tempfile
import unittest

from app import create_app
from engine import propagate, simulate, topology


SAMPLE = json.loads((Path(__file__).parents[1] / "sample.json").read_text())


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.nodes = topology(SAMPLE)

    def test_redundancy_and_wave_order(self):
        offline, waves, causes = propagate(self.nodes, ["fiber"])
        self.assertEqual(offline, {"fiber"})
        self.assertEqual(waves, [["fiber"]])
        self.assertEqual(causes, {})
        _, waves, causes = propagate(self.nodes, ["fiber", "radio"])
        self.assertEqual(waves, [
            ["fiber", "radio"], ["switch"], ["identity", "support"],
            ["labs", "learning", "library"],
        ])
        self.assertEqual(causes["switch"], [["fiber", "radio"]])

    def test_repair_selection_and_budget_frontier(self):
        result = simulate(self.nodes, ["grid", "solar", "fiber"], 8)
        self.assertEqual((result["before"], result["after"], result["total"]), (3, 88, 100))
        self.assertEqual(result["repairs"], ["grid"])
        self.assertEqual(result["remaining"], ["fiber", "solar"])
        self.assertEqual(result["frontier"], [
            {"cost": 0, "score": 3}, {"cost": 4, "score": 53}, {"cost": 8, "score": 88}
        ])

    def test_optimal_plan_accounts_for_complementary_repairs(self):
        nodes = topology([
            dict(id="a", name="A", layer="Utilities", weight=1, cost=2),
            dict(id="b", name="B", layer="Utilities", weight=1, cost=2),
            dict(id="c", name="C", layer="Utilities", weight=5, cost=3),
            dict(id="d", name="D", layer="Campus services", weight=100, cost=1, requires=[["a"], ["b"]]),
        ])
        result = simulate(nodes, ["a", "b", "c"], 4)
        self.assertEqual(result["repairs"], ["a", "b"])
        self.assertEqual(result["after"], 102)

    def test_no_faults_and_zero_budget(self):
        clean = simulate(self.nodes, [], 0)
        self.assertEqual(clean["before"], clean["total"])
        failed = simulate(self.nodes, ["grid"], 0)
        self.assertEqual(failed["before"], failed["after"])
        self.assertEqual(failed["evaluated"], 1)

    def test_invalid_topologies_and_parameters(self):
        for dependency, error in [("grid", "acyclic"), ("missing", "Unknown")]:
            modified = [dict(SAMPLE[0], requires=[[dependency]]), *SAMPLE[1:]]
            with self.assertRaisesRegex(ValueError, error):
                topology(modified)
        with self.assertRaises(ValueError):
            simulate(self.nodes, ["grid", "grid"], 8)
        with self.assertRaises(ValueError):
            simulate(self.nodes, ["grid"], True)


class ApiTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.app = create_app(Path(temporary.name) / "db.sqlite3", "unit-test")
        self.client = self.app.test_client()
        csrf = self.client.get("/api/bootstrap").json["csrf"]
        self.headers = {"X-CSRF-Token": csrf}
        self.body = dict(nodes=SAMPLE, failures=["fiber", "radio"], budget=5, name="Network test")

    def test_home_health_and_validation(self):
        self.assertIn(b"Resilience workspace", self.client.get("/").data)
        self.assertEqual(self.client.get("/health").json, {"status": "ok"})
        self.assertEqual(self.client.post("/api/simulate", json=self.body).status_code, 403)
        invalid = dict(self.body, budget=51)
        self.assertEqual(self.client.post("/api/simulate", json=invalid, headers=self.headers).status_code, 400)
        oversized = dict(self.body, name="a" * 65536)
        self.assertEqual(self.client.post("/api/runs", json=oversized, headers=self.headers).status_code, 413)

    def test_simulate_save_list_delete_and_isolation(self):
        result = self.client.post("/api/simulate", json=self.body, headers=self.headers).json
        saved = self.client.post("/api/runs", json=self.body, headers=self.headers)
        self.assertEqual(saved.status_code, 201)
        self.assertEqual(saved.json["result"], result["result"])
        runs = self.client.get("/api/runs").json
        self.assertEqual(runs, [saved.json])
        url = f"/api/runs/{saved.json['id']}"
        other = self.app.test_client()
        csrf = other.get("/api/bootstrap").json["csrf"]
        self.assertEqual(other.get("/api/runs").json, [])
        self.assertEqual(other.delete(url, headers={"X-CSRF-Token": csrf}).status_code, 404)
        self.assertEqual(self.client.delete(url, headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get("/api/runs").json, [])


if __name__ == "__main__":
    unittest.main()
