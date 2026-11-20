"""Deterministic dependency propagation and budget-constrained restoration."""

from itertools import combinations
import re


def integer(value, minimum, maximum, label):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{label} must be an integer from {minimum} to {maximum}.")
    return value


def topology(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 24:
        raise ValueError("Provide an array of 1–24 nodes.")
    nodes = {}
    for row in value:
        if not isinstance(row, dict):
            raise ValueError("Each node must be an object.")
        key, name, layer = (row.get(field) for field in ("id", "name", "layer"))
        if not isinstance(key, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,23}", key) or key in nodes:
            raise ValueError("Node IDs must be unique lowercase identifiers.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 32:
            raise ValueError("Node names must contain 1–32 characters.")
        if layer not in ("Utilities", "Infrastructure", "Campus services"):
            raise ValueError("Use one of the three supported layers.")
        groups = row.get("requires", [])
        if not isinstance(groups, list) or len(groups) > 8:
            raise ValueError("Use at most eight dependency groups per node.")
        for group in groups:
            if not isinstance(group, list) or not 1 <= len(group) <= 8 or any(
                not isinstance(item, str) for item in group
            ) or len(set(group)) != len(group):
                raise ValueError("Each group must contain 1–8 distinct node IDs.")
        nodes[key] = dict(
            id=key, name=name.strip(), layer=layer, requires=groups,
            weight=integer(row.get("weight"), 1, 100, "Priority"),
            cost=integer(row.get("cost"), 1, 25, "Repair cost"),
        )
    visiting, completed = set(), set()

    def visit(key):
        if key in visiting:
            raise ValueError("Dependencies must be acyclic.")
        if key not in nodes:
            raise ValueError(f"Unknown dependency: {key}")
        if key not in completed:
            visiting.add(key)
            for group in nodes[key]["requires"]:
                for source in group:
                    visit(source)
            visiting.remove(key)
            completed.add(key)

    for key in nodes:
        visit(key)
    return nodes


def propagate(nodes, failed):
    offline = set(failed)
    waves = [sorted(offline)]
    causes = {}
    while True:
        wave = []
        for key, node in nodes.items():
            if key in offline:
                continue
            blocked = [group for group in node["requires"] if all(dep in offline for dep in group)]
            if blocked:
                causes[key] = blocked
                wave.append(key)
        if not wave:
            break
        waves.append(sorted(wave))
        offline.update(wave)
    return offline, waves, causes


def simulate(nodes, failures, budget):
    if not isinstance(failures, list) or len(failures) > 12 or any(
        not isinstance(key, str) or key not in nodes for key in failures
    ) or len(set(failures)) != len(failures):
        raise ValueError("Select up to 12 distinct failed nodes.")
    integer(budget, 0, 50, "Budget")
    failures = sorted(failures)
    total = sum(node["weight"] for node in nodes.values())

    def score(offline):
        return total - sum(nodes[key]["weight"] for key in offline)

    offline, waves, causes = propagate(nodes, failures)
    best_by_cost = {0: (score(offline), 0, ())}
    evaluated = 1
    for count in range(1, len(failures) + 1):
        for repaired in combinations(failures, count):
            cost = sum(nodes[key]["cost"] for key in repaired)
            if cost > budget:
                continue
            remaining, _, _ = propagate(nodes, set(failures).difference(repaired))
            candidate = (score(remaining), -len(repaired), repaired)
            previous = best_by_cost.get(cost)
            if previous is None or candidate[:2] > previous[:2] or (
                candidate[:2] == previous[:2] and repaired < previous[2]
            ):
                best_by_cost[cost] = candidate
            evaluated += 1
    best_score, spent, repaired = score(offline), 0, ()
    frontier = [{"cost": 0, "score": best_score}]
    for cost, (candidate_score, _, candidate_repairs) in sorted(best_by_cost.items()):
        if candidate_score > best_score:
            best_score, spent, repaired = candidate_score, cost, candidate_repairs
            frontier.append({"cost": cost, "score": best_score})
    after, _, _ = propagate(nodes, set(failures).difference(repaired))
    return dict(
        failures=failures, offline=sorted(offline), waves=waves, causes=causes,
        before=score(offline), after=best_score, total=total, repairs=list(repaired),
        recovered=sorted(offline - after), remaining=sorted(after), spent=spent,
        frontier=frontier, evaluated=evaluated,
    )
