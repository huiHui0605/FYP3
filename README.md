# Campus Twin · Resilience Lab

Campus Twin is a campus infrastructure what-if simulator. Model dependencies with redundant paths, inject direct outages, trace the resulting cascade and find the repair subset that restores the most weighted availability within a fixed budget.

## Run locally

Requires Python 3.11 or later. From the repository root:

```sh
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:8000. The sample Storm disruption runs on first load. No external API, account or sensor is needed. SQLite and its session signing key are created in `data/` on first run. Saved scenarios are scoped to the browser session cookie and survive application restarts with the same database and signing key.

## Try the demo

1. Open **Storm disruption**. With 8 repair units, the cascade drops weighted availability to 3%. The suggested grid repair restores it to 88%.
2. Change **Graph view** to **After recovery**, then save the run.
3. Change the budget to 4, name the run “Storm · budget 4”, run and save it. The best plan restores 53% under this cap.
4. Open **Scenario library**, select both runs and compare them. Close the dialog and export the current scenario as CSV.
5. Try **Uplink isolation**. Remove one of its two selected faults to see how a redundant path prevents the network cascade. Open **Edit topology** to change the redundancy rules.

## Project documentation

- [Project report](docs/REPORT.md) covers requirements, architecture, the algorithm, evaluation and scope.
- [Demo and acceptance guide](docs/DEMO.md) contains a presentation sequence and expected outcomes.
- [API and deployment guide](docs/API.md) describes input limits, endpoints and runtime configuration.

## Verification

```sh
python -m unittest discover -s tests -v
node --check static/app.js
```

The sample uses fictional assets and synthetic repair costs and priorities. This is a campus planning prototype using a manually authored logical model. The scores measure the model's weighted availability and have no associated real-world measurement or forecast.
