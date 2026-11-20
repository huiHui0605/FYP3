# Campus Twin project report

## Abstract

A university's network, utilities and digital services often share upstream resources. A disruption can therefore affect systems far removed from the original fault. Campus Twin models the dependencies explicitly, computes each step of a cascade, and recommends a repair portfolio under a constrained budget. Its contributions are a visual outage workbench, an explainable dependency model with redundancy and an exact optimization algorithm with an availability-versus-budget frontier.

## Motivation and related work

NIST describes infrastructure dependencies as a source of cascading failure and identifies scenario assessment and prioritization as applications for resilience planning. UC Berkeley's 2025–26 campus digital twin capstone illustrates the use of a unified campus model for infrastructure and energy management. UConn's Disaster Mitigation Lab treats cascade simulation and recovery optimization as related research directions. This project adapts those ideas to a browser-accessible teaching simulator with explicit decision rules and a repeatable demonstration.

- [NIST Community Resilience Planning Guide, Volume II](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1190v2.pdf)
- [UC Berkeley Campus Digital Twin capstone](https://funginstitute.berkeley.edu/capstone-project/campus-digital-twin-for-infrastructure-and-energy-management/)
- [UConn Infrastructure Interdependency & Cascading Risk](https://dm2l.uconn.edu/research/infrastructure-interdependency/)

## Requirements

| ID | User need | Acceptance condition |
| --- | --- | --- |
| R1 | Build or load a campus model | Valid JSON edits apply. Unknown sources and dependency cycles are rejected. |
| R2 | Model direct and downstream outages | The graph distinguishes states and the timeline lists each wave with explainable dependency groups. |
| R3 | Allocate a scarce repair budget | The returned plan maximizes total operational weight within the specified budget. |
| R4 | Review alternatives | Two saved runs with the same topology can be compared by impact, budget and repair plan. |
| R5 | Share results | The export downloads scenario metrics and the status of each node as CSV. |
| R6 | Reproduce results | Saved runs retain topology, inputs and derived outputs, including after reload. |
| R7 | Keep separate workspaces | Switching browser sessions separates stored scenarios. Requests that mutate state require a session token. |

## Architecture

```mermaid
flowchart LR
  Browser["Browser · topology canvas, controls, comparison"] -->|JSON / HTTP| Flask["Flask · validation and workspace API"]
  Flask --> Engine["Python · propagation and exact optimization"]
  Flask --> DB[("SQLite · saved snapshots")]
  Sample["Sample topology JSON"] --> Flask
```

The engine operates on validated topology, faults and budget. The HTTP layer owns request validation and persistence. The UI renders server results, with explicit invalidation when faults, model or budget change. The stored data entity is a run with an integer ID, browser workspace ID, name, UTC timestamp and serialized snapshot. The snapshot includes node definitions, faults, budget and result.

### Dependency and recovery rules

Each node has a positive priority weight, positive integer repair cost and zero or more groups of upstream prerequisites. A powered network switch might require either the grid or solar **and** either fiber or radio. Each group therefore represents alternatives, and every group must have an operational member. Cycles are rejected to preserve an unambiguous logical model.

Propagation starts with the direct faults. In each wave, all operational nodes with a fully offline dependency group join the outage set simultaneously. The set grows monotonically and converges after at most the number of nodes in the topology. The API records which group or groups became fully offline at each node's failure.

The optimizer enumerates all feasible subsets of directly failed assets. For each subset, it reruns propagation with the repaired assets removed from the direct fault set and sums operational weights. It chooses the greatest score, then the lowest repair cost, then the smallest repair count, then lexicographical asset IDs. Every feasible subset is considered, so the result is exact under the model's assumptions. The frontier records each spend level that strictly improves the best score over lower spend levels, up to the budget. For `N` nodes, `E` prerequisite references and `F` directly failed assets, the conservative upper bound is `O(2^F × (F + N × (N + E)))`. The 12-fault cap bounds the search to 4,096 subsets.

## Evaluation

The sample contains 11 synthetic nodes and 100 total priority points. The Storm disruption gives 3 points before repair, 53 points with the optimal 4-unit plan and 88 points with the optimal 8-unit plan. Its 8-unit plan repairs the grid and restores several downstream services. The test suite includes a separate case where two inexpensive repairs jointly unlock a service and outperform selecting the most valuable standalone repair. Additional tests cover redundancy, wave order, zero budget, cycle rejection, API validation and browser-workspace isolation. Seven automated tests passed. A Chromium acceptance run also verified outage and recovery views, blocked-dependency inspection, saving, comparison, reload, CSV export, cycle validation and a 390-pixel viewport. The demo guide provides user-facing acceptance steps.

## Scope and limitations

The model assumes binary service state, successful repairs, simultaneous repair completion and fixed costs. It uses manually supplied synthetic weights, so its results describe a modeled scenario. It has no physical telemetry, repair durations, correlated hazard probabilities or claim of calibrated operational reliability. Workspaces use browser cookies and do not synchronize across browsers. The app is designed for a local or controlled lab deployment.
