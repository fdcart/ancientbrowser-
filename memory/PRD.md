# CloudBrowse — Product Requirements Doc

## Original problem statement
Build a Vercel-deployable MVP cloud browser web app usable from Chrome on iOS 12 to read modern websites. Two modes: Reader Mode (lightweight article view, runs in the Vercel app) and Live Mode (remote headless Chromium, runs in a separate worker). Chrome-inspired but trademark-safe UI, SSRF-protected URL fetch, graceful degradation when the worker is offline.

## Architecture
- Frontend: React (CRA + craco), iOS-12-friendly CSS. Routes: `/`, `/reader`, `/live`, 404.
- API: FastAPI @ `/api/*` — the Vercel-Functions-equivalent control plane. Endpoints: `/reader/open`, `/live/start|frame|click|scroll|type|navigate|close`, `/health`.
- Worker: separate Node.js + Express + Playwright service (`/app/worker/`) with Dockerfile. Deployed to Railway/Fly/Render/VPS. Vercel backend reaches it via `REMOTE_BROWSER_WORKER_URL`.
- Storage: MongoDB (optional, best-effort reader_log).

## Users
- iPhone 6/6s/7/SE-1 owners stuck on iOS 12 who can't read modern sites in Safari/Chrome iOS.
- Low-spec-device users who want a lightweight Reader Mode.
- Privacy-leaning readers who want server-side HTML cleaning.

## Core requirements (static)
1. Chrome-inspired shell: tab strip, back/fwd/reload/home, rounded omnibox, menu, trademark-safe wordmark (`Cloud•Browse`).
2. Reader Mode — server-side Readability + bleach, absolute URLs, lazy images, safe link rels; font/theme/spacing controls; works without the worker.
3. Live Mode — Playwright worker, JPEG screenshot polling (~1.5s), click coordinate mapping, scroll, type, navigate/back/fwd/reload; gracefully 503s if worker offline.
4. SSRF guard: private IPv4/IPv6, loopback, link-local, multicast, reserved, 169.254.169.254 blocked; DNS resolved and re-checked.
5. HTML sanitization: no `<script>`, `<iframe>`, `<style>`, `<link>`, on* handlers, unsafe protocols.
6. Rate limiting (30 reader/min, 60 live/min per IP).
7. Session idle (5 min) + hard (30 min) caps on the worker.

## Implemented (2026-02)
- [x] FastAPI control plane (server.py + reader.py + url_validator.py + worker_client.py + rate_limit.py).
- [x] React frontend (Home/Reader/Live/NotFound) inside BrowserShell with 8 reusable components (TabStrip, TopNavBar, AddressBar, BrowserActions, ReaderToolbar, LiveViewport, StatusBanner, BrowserShell).
- [x] Nice-to-haves: recent URLs (localStorage), screenshot quality selector, idle timeout warning (2 min warn, 5 min close), worker health indicator on home.
- [x] Worker service: Express + Playwright, 8 endpoints, idle sweeper, optional bearer-token auth, Dockerfile.
- [x] README, .env.example, vercel.json.
- [x] E2E tested — 100% backend + frontend pass (iteration_1.json).

## P0 remaining
_None — MVP shipped._

## P1 backlog
- Swap in-memory rate limiter for Redis when multi-instance.
- Persist worker sessions in a small KV (Upstash) so session IDs survive cold starts.
- Add WebSocket frame push for modern browsers (fallback polling for iOS 12).
- Offline-able reader snapshots (save to Mongo, re-open without refetch).

## P2 backlog
- Mobile-specific Chrome-iOS skin variant (pull-to-refresh, bottom toolbar).
- Paywall/cookie-wall bypass heuristics.
- Auth-aware sessions (log in on the worker, keep cookies for reader fetch).
- Built-in search (currently omnibox is URL-only).

## Next tasks
1. Deploy worker somewhere (Railway recommended) and set `REMOTE_BROWSER_WORKER_URL` + token on the Vercel project.
2. Port handlers to `app/api/*/route.ts` for a true Next.js deployment, reusing `reader.ts` logic via a small JS rewrite.
3. Add Redis-backed rate limiting before public launch.
