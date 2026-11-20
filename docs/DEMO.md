# Demonstration and acceptance guide

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Load the workspace in a fresh browser session | Storm disruption shows ten offline nodes and 3.0% availability. |
| 2 | Select After recovery | Grid has been repaired and nine nodes are operational. Fiber and Solar remain offline. |
| 3 | Save the 8-unit run. Set budget to 4, change the name, run and save again | The optimal 4-unit plan repairs Solar and restores 53.0%. |
| 4 | Open Scenario library and compare both snapshots | The table shows 88.0% versus 53.0% after repair and different direct repairs. |
| 5 | Reload the page, open Scenario library and load the 4-unit run | The original model, faults, budget and results reappear. |
| 6 | Export CSV | The file lists scenario metrics and every node's initial and final status. |
| 7 | Load Uplink isolation, deselect Radio uplink, then rerun | Fiber is the only offline asset after cascade. The alternate path keeps Core network available. |
| 8 | Open the editor and set Grid supply to require itself | The editor reports a dependency cycle and preserves the current model. |

For an oral defense, walk through the redundant network path, show the cascade timeline, compare budgets, and explain why exact subset search catches repairs that become valuable only together. Use the architecture diagram and tests to connect this demonstration to the system requirements.
