# CloudBrowse — Remote Browser Worker

The CloudBrowse worker is a tiny Node.js + Express service that wraps Playwright/Chromium. The Vercel frontend delegates Live Mode to it because Vercel serverless functions cannot host a persistent headless browser.

## Endpoints

| Method | Path                           | Body / Query                   | Purpose                              |
|--------|--------------------------------|--------------------------------|--------------------------------------|
| GET    | `/health`                      |                                | Liveness + session count             |
| POST   | `/sessions`                    | `{ url, viewport? }`           | Start a new Playwright page          |
| GET    | `/sessions/:id/frame?q=55`     |                                | Returns base64 JPEG + viewport size  |
| POST   | `/sessions/:id/click`          | `{ x, y }`                     | Mouse click at viewport coordinate   |
| POST   | `/sessions/:id/scroll`         | `{ dy }`                       | Scroll by wheel delta                |
| POST   | `/sessions/:id/type`           | `{ text, submit }`             | Type text, optional Enter            |
| POST   | `/sessions/:id/navigate`       | `{ url }` or `{ action }`      | Go back / forward / reload / goto    |
| POST   | `/sessions/:id/close`          |                                | Terminate session                    |

## Environment variables

| Name                    | Default | Description                                       |
|-------------------------|---------|---------------------------------------------------|
| `PORT`                  | `8080`  | HTTP port                                         |
| `MAX_SESSIONS`          | `6`     | Concurrent Playwright contexts                    |
| `SESSION_IDLE_MS`       | `300000`| Idle session timeout                              |
| `SESSION_HARD_MS`       | `1800000`| Hard cap per session                              |
| `WORKER_USER_AGENT`     | (modern Chrome UA) | UA string used by Chromium             |
| `WORKER_SHARED_TOKEN`   | _unset_ | If set, requires `Authorization: Bearer <token>` |

## Local run

```bash
cd worker
yarn install
yarn playwright install chromium    # only needed outside the Docker base image
node server.js
```

## Docker

```bash
docker build -t cloudbrowse-worker .
docker run --rm -p 8080:8080 -e WORKER_SHARED_TOKEN=change-me cloudbrowse-worker
```

## Security

* All URLs are revalidated against private IP ranges and cloud metadata endpoints (SSRF).
* Sessions have idle + hard timeouts.
* Optional bearer-token auth between the Vercel backend and the worker.

## Known limitations

* No WebRTC streaming — frames are JPEGs at a polling interval. iOS 12 compatibility is the trade-off.
* Sessions are pinned to one worker instance (no cross-instance session sharing). Scale horizontally by adding sticky routing or a per-request model if you need more than a handful of concurrent users.
