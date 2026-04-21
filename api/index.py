"""Vercel Python serverless entrypoint.

Vercel's @vercel/python runtime auto-detects an ASGI `app` object. We simply
re-export the FastAPI app defined in ../backend/server.py so all existing
/api/* routes work unchanged.

The `vercel.json` at the repo root rewrites every /api/(.*) request to this
file, which means the FastAPI router's own /api prefix still matches.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Make backend/ importable as a flat package on the serverless runtime
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Optional env hygiene: skip load_dotenv inside Vercel (env vars come from
# the project dashboard, not a .env file checked into the repo).
os.environ.setdefault("CLOUDBROWSE_RUNTIME", "vercel")

from server import app  # noqa: E402,F401  (re-exported for Vercel)
