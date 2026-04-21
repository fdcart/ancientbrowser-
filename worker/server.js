/**
 * CloudBrowse remote browser worker.
 *
 * A minimal Express service that wraps Playwright/Chromium. Designed to be
 * deployed separately from the Vercel frontend (Railway, Fly.io, Render,
 * a VPS, or a long-running container). The Vercel/FastAPI app calls it via
 * REMOTE_BROWSER_WORKER_URL.
 *
 * Endpoints:
 *   GET    /health
 *   POST   /sessions              { url, viewport? }          -> { session_id, title }
 *   GET    /sessions/:id/frame?q  (JPEG quality 10-90)         -> { image_b64, mime, width, height, nav_url, title }
 *   POST   /sessions/:id/click    { x, y }
 *   POST   /sessions/:id/scroll   { dy }
 *   POST   /sessions/:id/type     { text, submit }
 *   POST   /sessions/:id/navigate { url? | action: back|forward|reload }
 *   POST   /sessions/:id/close
 *
 * Security: set WORKER_SHARED_TOKEN to require `Authorization: Bearer <token>`.
 * SSRF: re-validates URL host against private IP ranges.
 */
const express = require("express");
const { chromium } = require("playwright");
const crypto = require("crypto");
const net = require("net");
const dns = require("dns").promises;

const PORT = parseInt(process.env.PORT || "8080", 10);
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "6", 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_MS || "300000", 10); // 5 min
const HARD_TIMEOUT_MS = parseInt(process.env.SESSION_HARD_MS || "1800000", 10); // 30 min
const USER_AGENT =
  process.env.WORKER_USER_AGENT ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TOKEN = process.env.WORKER_SHARED_TOKEN || null;
const DEFAULT_VIEWPORT = { width: 1024, height: 720 };

const app = express();
app.use(express.json({ limit: "512kb" }));

// ---------- auth middleware ----------
app.use((req, res, next) => {
  if (!TOKEN) return next();
  if (req.path === "/health") return next();
  const hdr = req.headers.authorization || "";
  if (hdr === `Bearer ${TOKEN}`) return next();
  return res.status(401).json({ error: "unauthorized" });
});

// ---------- SSRF guard ----------
function isPrivateIp(addr) {
  if (net.isIP(addr) === 0) return false;
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  const lower = addr.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("ff")
  );
}

async function assertSafeUrl(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) is allowed");
  const host = u.hostname.toLowerCase();
  if (["localhost", "metadata", "metadata.google.internal"].includes(host)) {
    throw new Error("Host is blocked");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("IP is in a blocked range");
    return;
  }
  try {
    const recs = await dns.lookup(host, { all: true });
    for (const r of recs) {
      if (isPrivateIp(r.address)) throw new Error("Resolved IP is in a blocked range");
    }
  } catch (e) {
    throw new Error(`DNS lookup failed: ${e.message}`);
  }
}

// ---------- session store ----------
/** @type {Map<string, {browser, context, page, createdAt, lastUsed, viewport}>} */
const sessions = new Map();

let sharedBrowser = null;
async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  sharedBrowser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
    ],
  });
  sharedBrowser.on("disconnected", () => {
    sharedBrowser = null;
  });
  return sharedBrowser;
}

function touch(s) {
  s.lastUsed = Date.now();
}

async function closeSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try {
    await s.context.close();
  } catch (_) {
    /* ignore */
  }
}

// Idle sweeper
setInterval(async () => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsed > IDLE_TIMEOUT_MS || now - s.createdAt > HARD_TIMEOUT_MS) {
      await closeSession(id);
    }
  }
}, 30_000).unref();

// ---------- helpers ----------
async function snapshot(page, quality) {
  const buf = await page.screenshot({
    type: "jpeg",
    quality: quality || 55,
    fullPage: false,
  });
  const viewport = page.viewportSize() || DEFAULT_VIEWPORT;
  let navUrl = "";
  let title = "";
  try {
    navUrl = page.url();
    title = await page.title();
  } catch (_) {
    /* ignore */
  }
  return {
    image_b64: buf.toString("base64"),
    mime: "image/jpeg",
    width: viewport.width,
    height: viewport.height,
    nav_url: navUrl,
    title,
  };
}

// ---------- routes ----------
app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    sessions: sessions.size,
    max_sessions: MAX_SESSIONS,
    uptime_s: Math.round(process.uptime()),
  });
});

app.post("/sessions", async (req, res) => {
  try {
    const { url, viewport } = req.body || {};
    if (!url) return res.status(400).json({ error: "url is required" });
    await assertSafeUrl(url);
    if (sessions.size >= MAX_SESSIONS) {
      return res.status(429).json({ error: "Max sessions reached" });
    }
    const browser = await getBrowser();
    const vp = {
      width: Math.max(320, Math.min(1600, (viewport && viewport.width) || DEFAULT_VIEWPORT.width)),
      height: Math.max(320, Math.min(1600, (viewport && viewport.height) || DEFAULT_VIEWPORT.height)),
    };
    const context = await browser.newContext({
      viewport: vp,
      userAgent: USER_AGENT,
      javaScriptEnabled: true,
      bypassCSP: false,
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(25_000);
    page.setDefaultTimeout(15_000);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const id = crypto.randomBytes(12).toString("hex");
    const now = Date.now();
    sessions.set(id, { browser, context, page, createdAt: now, lastUsed: now, viewport: vp });
    let title = "";
    try { title = await page.title(); } catch (_) { /* ignore */ }
    res.json({ session_id: id, title, url: page.url(), viewport: vp });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

function withSession(handler) {
  return async (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: "session not found" });
    try {
      touch(s);
      await handler(s, req, res);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  };
}

app.get(
  "/sessions/:id/frame",
  withSession(async (s, req, res) => {
    const q = Math.max(10, Math.min(90, parseInt(req.query.q || "55", 10)));
    const snap = await snapshot(s.page, q);
    res.json(snap);
  })
);

app.post(
  "/sessions/:id/click",
  withSession(async (s, req, res) => {
    const { x, y } = req.body || {};
    if (typeof x !== "number" || typeof y !== "number") {
      return res.status(400).json({ error: "x,y required" });
    }
    await s.page.mouse.click(x, y);
    await s.page.waitForTimeout(250);
    res.json({ ok: true });
  })
);

app.post(
  "/sessions/:id/scroll",
  withSession(async (s, req, res) => {
    const { dy } = req.body || {};
    const amt = typeof dy === "number" ? dy : 400;
    await s.page.mouse.wheel(0, amt);
    await s.page.waitForTimeout(150);
    res.json({ ok: true });
  })
);

app.post(
  "/sessions/:id/type",
  withSession(async (s, req, res) => {
    const { text, submit } = req.body || {};
    if (typeof text !== "string") {
      return res.status(400).json({ error: "text required" });
    }
    await s.page.keyboard.type(text, { delay: 10 });
    if (submit) await s.page.keyboard.press("Enter");
    await s.page.waitForTimeout(300);
    res.json({ ok: true });
  })
);

app.post(
  "/sessions/:id/navigate",
  withSession(async (s, req, res) => {
    const { url, action } = req.body || {};
    if (url) {
      await assertSafeUrl(url);
      await s.page.goto(url, { waitUntil: "domcontentloaded" });
    } else if (action === "back") {
      await s.page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    } else if (action === "forward") {
      await s.page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
    } else if (action === "reload") {
      await s.page.reload({ waitUntil: "domcontentloaded" });
    } else {
      return res.status(400).json({ error: "url or action required" });
    }
    res.json({ ok: true, url: s.page.url() });
  })
);

app.post(
  "/sessions/:id/close",
  async (req, res) => {
    await closeSession(req.params.id);
    res.json({ ok: true, closed: true });
  }
);

// ---------- start ----------
app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[cloudbrowse-worker] listening on :${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  try {
    for (const id of sessions.keys()) await closeSession(id);
    if (sharedBrowser) await sharedBrowser.close();
  } catch (_) { /* ignore */ }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
