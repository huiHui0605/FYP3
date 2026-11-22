"""HTTP interface and per-workspace scenario persistence."""

import json
import os
from pathlib import Path
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request, session
from waitress import serve

from engine import simulate, topology

ROOT = Path(__file__).resolve().parent
PRESETS = [
    {"name": "Storm disruption", "failures": ["grid", "solar", "fiber"], "budget": 8},
    {"name": "Recovery drill", "failures": ["grid", "solar", "fiber"], "budget": 17},
    {"name": "Uplink isolation", "failures": ["fiber", "radio"], "budget": 5},
    {"name": "Maintenance overlap", "failures": ["grid", "identity"], "budget": 10},
]


def create_app(database=None, secret=None):
    app = Flask(__name__)
    path = Path(database or os.environ.get("CAMPUS_DB", ROOT / "data" / "campus.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    app.config.update(
        SECRET_KEY=secret or os.environ.get("CAMPUS_SECRET") or secrets.token_hex(32),
        MAX_CONTENT_LENGTH=64 * 1024,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("CAMPUS_SECURE_COOKIE") == "1",
    )
    sample = list(topology(json.loads((ROOT / "sample.json").read_text())).values())

    def connect():
        db = sqlite3.connect(path)
        db.row_factory = sqlite3.Row
        return db

    with closing(connect()) as db, db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
                created TEXT NOT NULL, payload TEXT NOT NULL
            )
        """)
        db.execute("CREATE INDEX IF NOT EXISTS runs_owner ON runs(owner, id)")

    @app.after_request
    def security_headers(response):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(ValueError)
    def validation_error(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(error="Request exceeds 64 KiB."), 413

    @app.get("/")
    def home():
        return render_template("index.html")

    @app.get("/api/bootstrap")
    def bootstrap():
        if "owner" not in session:
            session["owner"] = secrets.token_urlsafe(24)
            session["csrf"] = secrets.token_urlsafe(32)
        return jsonify(nodes=sample, presets=PRESETS, csrf=session["csrf"])

    @app.before_request
    def protect_writes():
        if request.method in {"POST", "DELETE"}:
            token = session.get("csrf")
            if not token or not secrets.compare_digest(token, request.headers.get("X-CSRF-Token", "")):
                return jsonify(error="Session expired. Reload the workspace."), 403

    def run_input():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise ValueError("Provide a JSON object.")
        nodes = topology(body.get("nodes"))
        budget = body.get("budget")
        result = simulate(nodes, body.get("failures"), budget)
        return body, dict(nodes=list(nodes.values()), budget=budget, result=result)

    @app.post("/api/simulate")
    def run():
        _, snapshot = run_input()
        return jsonify(snapshot)

    @app.get("/api/runs")
    def history():
        with closing(connect()) as db:
            rows = db.execute(
                "SELECT id, name, created, payload FROM runs WHERE owner = ? ORDER BY id DESC LIMIT 50",
                (session.get("owner"),),
            ).fetchall()
        return jsonify([dict(id=row["id"], name=row["name"], created=row["created"],
                             **json.loads(row["payload"])) for row in rows])

    @app.post("/api/runs")
    def save():
        body, snapshot = run_input()
        name = body.get("name")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 70:
            raise ValueError("Scenario name must contain 1–70 characters.")
        created = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with closing(connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            count = db.execute(
                "SELECT count(*) FROM runs WHERE owner = ?", (session["owner"],)
            ).fetchone()[0]
            if count >= 50:
                return jsonify(error="Delete a saved scenario before adding another."), 409
            cursor = db.execute(
                "INSERT INTO runs(owner, name, created, payload) VALUES (?, ?, ?, ?)",
                (session["owner"], name.strip(), created, json.dumps(snapshot)),
            )
            return jsonify(id=cursor.lastrowid, name=name.strip(), created=created, **snapshot), 201

    @app.delete("/api/runs/<int:run_id>")
    def delete(run_id):
        with closing(connect()) as db, db:
            cursor = db.execute("DELETE FROM runs WHERE owner = ? AND id = ?", (session["owner"], run_id))
            if not cursor.rowcount:
                return jsonify(error="Scenario not found."), 404
        return "", 204

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    return app


if __name__ == "__main__":
    # Persist the signing key so saved runs remain accessible after a local restart.
    database_path = Path(os.environ.get("CAMPUS_DB", ROOT / "data" / "campus.sqlite3"))
    key_path = database_path.with_suffix(".key")
    if not os.environ.get("CAMPUS_SECRET"):
        key_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w") as stream:
                stream.write(secrets.token_hex(32))
        secret_key = key_path.read_text().strip()
        if not secret_key:
            raise RuntimeError("The persistent session key is empty.")
    else:
        secret_key = os.environ["CAMPUS_SECRET"]
    serve(create_app(database_path, secret_key), host=os.environ.get("CAMPUS_HOST", "127.0.0.1"),
          port=int(os.environ.get("PORT", "8000")))
