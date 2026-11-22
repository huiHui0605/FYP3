# API and deployment

Start with `GET /api/bootstrap` to obtain the sample topology, presets and a CSRF token. Preserve the returned session cookie. Send the token as `X-CSRF-Token` on POST and DELETE requests. POST bodies use JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Readiness response |
| GET | `/api/bootstrap` | Initialize the browser workspace and load the sample |
| POST | `/api/simulate` | Evaluate a topology and repair budget |
| GET | `/api/runs` | List this workspace's saved runs, newest first |
| POST | `/api/runs` | Evaluate and store a named snapshot |
| DELETE | `/api/runs/<id>` | Delete a snapshot owned by this workspace |

The simulation body contains `nodes` (see [sample.json](../sample.json)), `failures` (0–12 unique IDs), and `budget` (integer 0–50). Saving also requires a `name` of 1–70 characters. A node has an ID, name, layer, weight, cost and an optional array `requires`. Allowed layers are Utilities, Infrastructure and Campus services. Each model has 1–24 nodes. Weights range from 1 to 100 and costs from 1 to 25. The response includes normalized nodes, budget and a result object containing cascade waves, causes, before and after weighted scores, direct repairs, recovered nodes and the budget frontier.

Simulation returns 200, saving returns 201, and deletion returns 204. Errors include 400 for validation, 403 for missing session token, 404 for an inaccessible run, 409 when the workspace's 50-run quota is reached, and 413 for a request larger than 64 KiB.

| Variable | Default or purpose |
| --- | --- |
| `CAMPUS_HOST` | `127.0.0.1` |
| `PORT` | `8000` |
| `CAMPUS_DB` | Absolute or relative path to SQLite. Defaults to `data/campus.sqlite3`. |
| `CAMPUS_SECRET` | Optional persistent session signing secret. The standalone runner generates a companion key file otherwise. |
| `CAMPUS_SECURE_COOKIE` | Set to `1` when serving through an HTTPS reverse proxy. |

Use one Waitress process with a writable persistent data directory. For a controlled network demonstration, place it behind an HTTPS reverse proxy and supply a stable signing secret. Protect the database and signing key together when backing up the application.

## Timing and portable scenarios

Each node accepts integer `hours` from 1 to 168 (default 1) and optional integer `target_hours` from 0 to 720 (default null). `result.schedule` contains total crew hours, lost priority-hours over the repair horizon, ordered steps and recovery goals. Each step gives the repaired node, start and finish hours, newly restored nodes and the resulting online priority. For each goal, `actual` is zero for an initially operational node, its restoration hour for a recovered node or null for one still offline. A service returning exactly at its deadline meets the goal.

Portable JSON files contain `format` set to `campus-twin/1`, a scenario name, nodes, failures and budget. Imports validate the model and recompute all results through the simulation API. They contain no session identifiers. Opening a file leaves library persistence to the Save run action. Legacy stored snapshots can be loaded and exported. Rerun a legacy snapshot to calculate timing with the default one-hour durations and unset deadlines.
