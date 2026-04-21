"""Remote Browser Worker client.

Thin HTTP client to the Playwright worker service. If the worker URL is not
configured or the worker is unreachable, callers receive a WorkerUnavailable
exception so the frontend can render a graceful message (Reader Mode still
works independently).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)


class WorkerUnavailable(Exception):
    pass


class WorkerError(Exception):
    pass


def _worker_url() -> Optional[str]:
    url = os.environ.get("REMOTE_BROWSER_WORKER_URL")
    if not url:
        return None
    return url.rstrip("/")


def _worker_token() -> Optional[str]:
    return os.environ.get("REMOTE_BROWSER_WORKER_TOKEN") or None


def is_configured() -> bool:
    return _worker_url() is not None


async def worker_health() -> dict:
    base = _worker_url()
    if not base:
        return {"configured": False, "ok": False, "detail": "REMOTE_BROWSER_WORKER_URL not set"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{base}/health")
        if r.status_code == 200:
            data = r.json()
            return {"configured": True, "ok": True, **data}
        return {"configured": True, "ok": False, "detail": f"HTTP {r.status_code}"}
    except httpx.HTTPError as exc:
        return {"configured": True, "ok": False, "detail": str(exc)}


async def _request(method: str, path: str, json: Optional[dict] = None, timeout: float = 30.0) -> Any:
    base = _worker_url()
    if not base:
        raise WorkerUnavailable("Remote browser worker is not configured")
    headers = {}
    token = _worker_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.request(method, f"{base}{path}", json=json, headers=headers)
    except httpx.HTTPError as exc:
        raise WorkerUnavailable(f"Worker unreachable: {exc}") from exc

    if r.status_code >= 500:
        raise WorkerError(f"Worker error {r.status_code}: {r.text[:200]}")
    if r.status_code >= 400:
        try:
            return {"error": r.json(), "_status": r.status_code}
        except Exception:  # noqa: BLE001
            raise WorkerError(f"Worker error {r.status_code}")

    # Screenshot endpoint returns JSON with base64 already; all endpoints JSON.
    try:
        return r.json()
    except Exception:  # noqa: BLE001
        raise WorkerError("Worker returned invalid JSON")


async def start_session(url: str, viewport: Optional[dict] = None) -> dict:
    body = {"url": url}
    if viewport:
        body["viewport"] = viewport
    return await _request("POST", "/sessions", json=body, timeout=45.0)


async def get_frame(session_id: str, quality: int = 55) -> dict:
    return await _request("GET", f"/sessions/{session_id}/frame?q={quality}", timeout=15.0)


async def click(session_id: str, x: float, y: float) -> dict:
    return await _request("POST", f"/sessions/{session_id}/click", json={"x": x, "y": y})


async def scroll(session_id: str, dy: int) -> dict:
    return await _request("POST", f"/sessions/{session_id}/scroll", json={"dy": dy})


async def type_text(session_id: str, text: str, submit: bool = False) -> dict:
    return await _request(
        "POST", f"/sessions/{session_id}/type", json={"text": text, "submit": submit}
    )


async def navigate(session_id: str, url: Optional[str] = None, action: Optional[str] = None) -> dict:
    body: dict = {}
    if url:
        body["url"] = url
    if action:
        body["action"] = action
    return await _request("POST", f"/sessions/{session_id}/navigate", json=body, timeout=30.0)


async def close_session(session_id: str) -> dict:
    return await _request("POST", f"/sessions/{session_id}/close")
