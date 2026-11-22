# Demonstration and acceptance guide

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Load the workspace in a fresh browser session | Storm disruption shows ten offline nodes and 3.0% availability. |
| 2 | Select After recovery | Grid has been repaired and nine nodes are operational. Fiber and Solar remain offline. |
| 3 | Save the 8-unit run. Set budget to 4, change the name, run and save again | The optimal 4-unit plan repairs Solar and restores 53.0%. |
| 4 | Open Scenario library and compare both snapshots | The table shows 88.0% versus 53.0% after repair and different direct repairs. |
| 5 | Reload the page, open Scenario library and load the 4-unit run | The original model, faults, budget and results reappear. |
| 6 | Export CSV | The file lists scenario metrics and every node's initial and final status. |
| 7 | Load Uplink isolation, inspect Radio uplink and select Remove direct fault, then rerun | Fiber is the only offline asset after cascade. The alternate path keeps Core network available. |
| 8 | Open the editor and set Grid supply to require itself | The editor reports a dependency cycle and preserves the current model. |

For an oral defense, walk through the redundant network path, show the cascade timeline, compare budgets, and explain why exact subset search catches repairs that become valuable only together. Use the architecture diagram and tests to connect this demonstration to the system requirements.

## Time-based recovery demonstration

1. Select **Recovery drill**. The 17-unit portfolio funds all three repairs. Click **0–2 h · Solar microgrid**. The graph changes to the hour-2 state and the learning portal and student help desk have recovered.
2. Click the grid and fiber milestones. Availability advances to 93% at hour 8 and 100% at hour 11. The plan loses 497 priority-hours across the repair window.
3. Open **Edit recovery assumptions** and change the learning portal deadline to 1 hour. Apply it. The portal now shows a late recovery at hour 2.
4. Download the scenario under **Transfer scenario**. Open it in a new browser session, verify the same late deadline and save the run. Download the CSV to inspect the repair intervals alongside the deadlines.

## Compare a proposed repair order

Open **Recovery drill → Try a repair order**. Move Grid supply earlier by one position and choose **Compare orders**. Both plans reach full availability at hour 11. The grid-first trial incurs 627 lost priority-hours versus 497 under the recommendation. The learning portal and help desk miss their deadlines in the trial. Inspect the chart and the hour-by-hour comparison table at each completion time, then close the rehearsal to return to the original scenario.
