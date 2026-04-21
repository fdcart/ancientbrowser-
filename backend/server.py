"""CloudBrowse FastAPI backend.

Acts as the "Vercel API" layer for the CloudBrowse cloud-browser MVP. When
deployed on Vercel, these same handlers map 1:1 to Next.js route handlers.
Reader Mode runs entirely here. Live Mode is proxied to a separate Playwright
worker service configured via REMOTE_BROWSER_WORKER_URL.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from rate_limit import RateLimiter
from reader import ReaderError, fetch_and_extract
from url_validator import URLValidationError, validate_url
import worker_client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("cloudbrowse")

# MongoDB is optional — only used for best-effort reader_log analytics.
# On Vercel serverless, most users don't configure it; that's fine.
mongo_client = None
db = None
mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
if mongo_url and db_name:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient

        mongo_client = AsyncIOMotorClient(mongo_url)
        db = mongo_client[db_name]
    except Exception:  # noqa: BLE001
        logger.warning("Mongo client failed to initialize; analytics disabled", exc_info=True)

app = FastAPI(title="CloudBrowse API", version="0.1.0")
api = APIRouter(prefix="/api")

reader_limiter = RateLimiter(max_calls=30, window_s=60.0)
live_limiter = RateLimiter(max_calls=60, window_s=60.0)


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "anon"


# ---------- Models ----------
class OpenRequest(BaseModel):
    url: str


class ReaderResponse(BaseModel):
    url: str
    final_url: str
    title: str
    byline: Optional[str] = None
    site_name: Optional[str] = None
    content_html: str
    text_length: int


class StartLiveRequest(BaseModel):
    url: str
    viewport: Optional[dict] = Field(default=None)


class ClickRequest(BaseModel):
    x: float
    y: float


class ScrollRequest(BaseModel):
    dy: int


class TypeRequest(BaseModel):
    text: str
    submit: bool = False


class KeyRequest(BaseModel):
    key: str


class NavigateRequest(BaseModel):
    url: Optional[str] = None
    action: Optional[str] = None  # "back" | "forward" | "reload"


# ---------- Health / meta ----------
@api.get("/")
async def root():
    return {"service": "cloudbrowse", "ok": True}


@api.get("/health")
async def health():
    worker = await worker_client.worker_health()
    return {"ok": True, "worker": worker}


# ---------- Reader Mode ----------
@api.post("/reader/open", response_model=ReaderResponse)
async def reader_open(body: OpenRequest, request: Request):
    if not reader_limiter.allow(_client_key(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    try:
        safe_url = validate_url(body.url)
    except URLValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        article = fetch_and_extract(safe_url)
    except ReaderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Reader failed for %s", safe_url)
        raise HTTPException(status_code=500, detail="Reader Mode failed") from exc

    # Log to Mongo for analytics (non-blocking best-effort; skipped on Vercel when Mongo not configured)
    if db is not None:
        try:
            await db.reader_log.insert_one(
                {
                    "url": safe_url,
                    "final_url": article.final_url,
                    "title": article.title,
                    "text_length": article.text_length,
                }
            )
        except Exception:  # noqa: BLE001
            logger.warning("Failed to log reader event", exc_info=True)

    return ReaderResponse(
        url=article.url,
        final_url=article.final_url,
        title=article.title,
        byline=article.byline,
        site_name=article.site_name,
        content_html=article.content_html,
        text_length=article.text_length,
    )


# ---------- Live Mode (proxied to worker) ----------
def _unavail_error():
    raise HTTPException(
        status_code=503,
        detail=(
            "Live Mode is temporarily unavailable. The remote browser worker is "
            "offline or not configured. Reader Mode still works."
        ),
    )


@api.post("/live/start")
async def live_start(body: StartLiveRequest, request: Request):
    if not live_limiter.allow(_client_key(request)):
        raise HTTPException(status_code=429, detail="Too many requests")
    try:
        safe_url = validate_url(body.url)
    except URLValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not worker_client.is_configured():
        _unavail_error()

    try:
        res = await worker_client.start_session(safe_url, body.viewport)
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return res


@api.get("/live/{session_id}/frame")
async def live_frame(session_id: str, q: int = 55):
    try:
        return await worker_client.get_frame(session_id, quality=max(10, min(90, q)))
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.post("/live/{session_id}/click")
async def live_click(session_id: str, body: ClickRequest):
    try:
        return await worker_client.click(session_id, body.x, body.y)
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.post("/live/{session_id}/scroll")
async def live_scroll(session_id: str, body: ScrollRequest):
    try:
        return await worker_client.scroll(session_id, body.dy)
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.post("/live/{session_id}/type")
async def live_type(session_id: str, body: TypeRequest):
    try:
        return await worker_client.type_text(session_id, body.text, submit=body.submit)
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.post("/live/{session_id}/key")
async def live_key(session_id: str, body: KeyRequest):
    try:
        return await worker_client.press_key(session_id, body.key)
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.post("/live/{session_id}/navigate")
async def live_navigate(session_id: str, body: NavigateRequest):
    if body.url:
        try:
            body.url = validate_url(body.url)
        except URLValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return await worker_client.navigate(session_id, url=body.url, action=body.action)
    except worker_client.WorkerUnavailable:
        _unavail_error()
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@api.post("/live/{session_id}/close")
async def live_close(session_id: str):
    try:
        return await worker_client.close_session(session_id)
    except worker_client.WorkerUnavailable:
        # Treat as already gone
        return {"ok": True, "closed": True, "detail": "worker unavailable"}
    except worker_client.WorkerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    if mongo_client is not None:
        mongo_client.close()
