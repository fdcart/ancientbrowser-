# CloudBrowse

A Chromium-inspired, Vercel-deployable cloud browser for devices left behind by the modern web — especially **Chrome on iOS 12**. Enter a URL, and CloudBrowse either renders a clean Reader Mode locally or streams a Live Mode session from a remote headless Chromium worker.

> CloudBrowse is not affiliated with Google or Chrome. It borrows the familiar browser layout (tab strip, rounded omnibox, back/forward/reload) to feel immediately recognizable, but uses a neutral wordmark, a single blue dot accent, and no protected Google branding.

---

## What this app does

* **Reader Mode** — server-side article extraction (Readability) + sanitization (bleach). Works fully from the frontend + FastAPI layer, no remote browser required.
* **Live Mode** — a full headless Chromium page runs on a separate worker. The client receives JPEG screenshots over simple polling and sends clicks, scrolls, text input back through the API.
* **Degrades gracefully** — if the worker is offline or unreachable, Reader Mode continues to work and the UI clearly marks Live Mode as unavailable.

It works best for articles, blogs, news pages, documentation, and light browsing. Highly interactive apps may only partially work — see *Known limitations* below.

---

## Architecture

```
+-----------------------------+       +-------------------------------+
|  Browser (Chrome on iOS 12) |       |  Remote browser worker        |
|  CloudBrowse React UI       |       |  Node + Express + Playwright  |
|  (Vercel-hosted static app) |       |  (Railway / Fly / Render /    |
+--------------+--------------+       |   Docker VPS — NOT Vercel)    |
               |                      +---------------+---------------+
               | HTTPS                                ^
               v                                      |
+-----------------------------+   server-to-server    |
|  CloudBrowse API            |---------------------->|
|  FastAPI (stand-in for      |   REMOTE_BROWSER_     |
|  Vercel Functions /         |   WORKER_URL          |
|  Next.js route handlers)    |                       |
|                             |                       |
|  - /api/reader/open         |  Readability +        |
|    (runs entirely here)     |  bleach +             |
|  - /api/live/*              |  SSRF guard           |
|    (proxy to worker)        |                       |
+-----------------------------+                       |
```

### Why this works on iOS 12

iOS 12's WKWebView and Chrome-on-iOS both struggle with many modern sites because they depend on:

* newer JavaScript / ES2020+ syntax,
* modern CSS features (CSS `:has()`, container queries, modern layout),
* heavy SPA hydration,
* workers / streams / WebRTC / WebGPU.

CloudBrowse sidesteps these in two ways:

1. **Reader Mode** does all parsing, HTML rewriting, and sanitization **on the server**. The iPhone receives a tiny, flat HTML document that any old browser can render.
2. **Live Mode** runs the real Chromium on a modern Linux server. The iPhone only has to display JPEG screenshots and send x/y coordinates. No WebRTC, no live streaming, no advanced APIs.

The frontend itself is CRA (React 19 transpiled to ES5 by react-scripts) with a deliberately small CSS surface — no `backdrop-filter`, no CSS nesting, no `:has()`, no `display: contents` dependencies.

### Why Live Mode is not hosted directly on Vercel

Vercel Functions are serverless. They:

* cannot keep a persistent Chromium process alive across HTTP requests,
* have strict memory / timeout / disk limits that conflict with a running browser,
* spin down between requests, which would reset every Live Mode session.

CloudBrowse therefore treats Vercel as the **control plane** (frontend + lightweight API routes that coordinate sessions) and runs the actual Playwright Chromium in a **separate long-running worker** that keeps browser state in memory. This is the same pattern used by production cloud-browser products.

---

## Project structure

```
/app
├── backend/                     FastAPI control plane (Vercel-API equivalent)
│   ├── server.py                /api/* route handlers
│   ├── reader.py                Readability + bleach + image/link absolutizer
│   ├── url_validator.py         Normalize + SSRF guard
│   ├── worker_client.py         HTTP client to the remote browser worker
│   ├── rate_limit.py            Simple fixed-window limiter
│   └── .env                     MONGO_URL, DB_NAME, REMOTE_BROWSER_WORKER_URL, ...
│
├── frontend/                    React (CRA + craco), iOS-12-friendly CSS
│   └── src/
│       ├── App.js                Router
│       ├── pages/
│       │   ├── Home.jsx          /            — start page
│       │   ├── Reader.jsx        /reader      — article view
│       │   ├── Live.jsx          /live        — remote viewport
│       │   └── NotFound.jsx
│       ├── components/browser/
│       │   ├── BrowserShell.jsx  tabstrip + top nav + banner + content
│       │   ├── TabStrip.jsx      chrome-style tabs
│       │   ├── TopNavBar.jsx     actions + omnibox + menu
│       │   ├── AddressBar.jsx    rounded omnibox
│       │   ├── BrowserActions.jsx back / fwd / reload / home
│       │   ├── ReaderToolbar.jsx font / theme / spacing controls
│       │   ├── LiveViewport.jsx  screenshot + click mapping
│       │   └── StatusBanner.jsx
│       ├── lib/
│       │   ├── api.js            axios client
│       │   └── recent.js         localStorage "Recent" list
│       ├── index.css             Chrome-inspired neutral shell
│       └── App.css
│
├── worker/                      Separate Playwright service
│   ├── server.js                Express + Playwright
│   ├── package.json
│   ├── Dockerfile
│   └── README.md
│
├── vercel.json
├── .env.example
└── README.md                    (this file)
```

---

## Deploy

### Frontend + API on Vercel

> **Heads-up:** if you pasted a config like
> ```json
> { "experimentalServices": { ... } }
> ```
> that is an Emergent-preview-only field. Vercel does not recognize it and will error out. Use the `vercel.json` shipped in this repo instead (see below).

**Repo layout expected by Vercel:**

```
/  (root of what you push to GitHub)
├── api/
│   ├── index.py          # Vercel serverless entrypoint — re-exports FastAPI `app`
│   └── requirements.txt  # Python deps for the serverless runtime
├── backend/              # Actual FastAPI code (reader.py, url_validator.py, …)
├── frontend/             # CRA app
├── worker/               # NOT deployed to Vercel (see below)
├── vercel.json
└── .vercelignore
```

**`vercel.json` (included, do not replace with experimentalServices):**

```json
{
  "version": 2,
  "buildCommand": "cd frontend && yarn install --frozen-lockfile && yarn build",
  "outputDirectory": "frontend/build",
  "installCommand": "echo 'skip root install'",
  "framework": null,
  "functions": { "api/index.py": { "runtime": "@vercel/python@4.3.1", "maxDuration": 30 } },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!static/|assets/|favicon.ico|manifest.json|robots.txt).*)", "destination": "/index.html" }
  ]
}
```

**Steps:**

1. Push this repo to GitHub.
2. In Vercel, click **Add New… → Project** and import the repo. Do **not** pick a framework preset — `vercel.json` handles it (`"framework": null`).
3. In **Project Settings → Environment Variables**, set:

   | Variable                      | Example value                                          | Required |
   |-------------------------------|--------------------------------------------------------|----------|
   | `REACT_APP_BACKEND_URL`       | *(leave empty for same-origin)*                        | No       |
   | `REMOTE_BROWSER_WORKER_URL`   | `https://cloudbrowse-worker.fly.dev`                   | For Live Mode |
   | `REMOTE_BROWSER_WORKER_TOKEN` | same value as the worker's `WORKER_SHARED_TOKEN`       | If worker auth is on |
   | `MONGO_URL`                   | Mongo Atlas URI                                        | Optional (analytics) |
   | `DB_NAME`                     | e.g. `cloudbrowse`                                     | Optional |

4. Hit **Deploy**. The first build installs `api/requirements.txt` into a Python layer and builds the CRA app.
5. Live Mode will light up once `REMOTE_BROWSER_WORKER_URL` is pointed at your deployed worker.

### Worker (Playwright) on Railway / Fly.io / Render / VPS

The worker **cannot** run on Vercel. Deploy it wherever a persistent process is OK:

* **Docker** — `cd worker && docker build -t cloudbrowse-worker . && docker run -p 8080:8080 -e WORKER_SHARED_TOKEN=… cloudbrowse-worker`
* **Railway / Fly.io / Render** — point them at the `worker/` directory; the included `Dockerfile` is based on the official Playwright image.
* **VPS** — `yarn install && yarn playwright install chromium && node server.js`.

Set the Vercel env var `REMOTE_BROWSER_WORKER_URL` to the worker's public URL.

---

## Required environment variables

See `.env.example`. At a glance:

| Side      | Variable                       | Required | Purpose                                         |
|-----------|--------------------------------|----------|-------------------------------------------------|
| Frontend  | `REACT_APP_BACKEND_URL`        | Yes      | Where to send API calls                         |
| Backend   | `MONGO_URL`, `DB_NAME`         | Yes      | Optional analytics log (`reader_log` collection) |
| Backend   | `REMOTE_BROWSER_WORKER_URL`    | No       | Enables Live Mode when set                       |
| Backend   | `REMOTE_BROWSER_WORKER_TOKEN`  | No       | Bearer token for the worker                     |
| Worker    | `WORKER_SHARED_TOKEN`          | No       | Require `Authorization: Bearer` on all calls    |
| Worker    | `MAX_SESSIONS`                 | No       | Concurrent Playwright contexts (default 6)      |
| Worker    | `SESSION_IDLE_MS`              | No       | Idle session timeout (default 5 min)            |

---

## Security

* **SSRF guard** — `url_validator.py` normalizes, checks scheme, and resolves DNS. Private IPv4/IPv6 ranges, loopback, link-local, multicast, reserved addresses, and cloud metadata endpoints (AWS, GCP) are blocked.
* **HTML sanitization** — `bleach` strips scripts, event handlers, `<iframe>`, `<style>`, `<link>`, inline styles, and unknown protocols.
* **Request size + timeout caps** on Reader fetches (5 MB / 15 s).
* **Rate limiting** — simple in-memory fixed-window limiter per client IP (30 reader / 60 live req per minute). Swap for Redis if running multi-instance.
* **Worker auth** — optional bearer token shared between backend and worker.
* **Session cleanup** — worker enforces idle (5 min) and hard (30 min) caps; abandoned browser contexts are closed.
* **User-agent** — configurable on both sides (`WORKER_USER_AGENT`, fetch UA).

---

## Known limitations

* **Not a full browser** — logins, cookie walls, bot detection, captchas, and heavy SPAs will often fail in Reader Mode and sometimes in Live Mode. CloudBrowse focuses on reading and simple remote browsing.
* **Polling, not streaming** — Live Mode refreshes at ~1.5s intervals. It is responsive enough for reading and basic clicks, not for video playback or fast scrolling.
* **Single worker instance** — sessions live in that instance’s RAM. To scale beyond a handful of users, add sticky routing or swap to per-request "open, do one thing, close" flows.
* **iOS 12 caveats** — avoid pages that demand modern browser features you also need on the *client* (e.g. clipboard write, share APIs). These degrade silently.

---

## Local dev (inside this Emergent preview container)

Both services are managed by supervisor:

```bash
sudo supervisorctl status
# backend: running on :8001 (proxied via /api)
# frontend: running on :3000 (proxied via REACT_APP_BACKEND_URL)
```

To also run the worker locally:

```bash
cd /app/worker
yarn install
yarn playwright install chromium
node server.js &
export REMOTE_BROWSER_WORKER_URL=http://localhost:8080
sudo supervisorctl restart backend
```

---

## Product honesty

CloudBrowse **does not** claim to support every website. It is a practical bridge for reading modern content on old iPhones, not a browser replacement. Reader Mode gives you clean text. Live Mode gives you a remote pair of eyes on sites that refuse to cooperate. Anything deeply interactive (Maps, Gmail, Figma, streaming video) is explicitly out of scope for v1.
