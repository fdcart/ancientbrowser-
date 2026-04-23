import axios from "axios";

const RAW_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, "");

const BASE_CANDIDATES = Array.from(
  new Set(
    [BACKEND_URL, "/_/backend", ""]
      .map((v) => (v || "").replace(/\/+$/, ""))
  )
);

async function apiRequest(method, path, data) {
  let lastErr;
  for (const base of BASE_CANDIDATES) {
    const url = `${base}/api${path}`;
    try {
      const res = await axios({
        method,
        url,
        data,
        timeout: 30000,
      });
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      // Route mismatch on one base path? Try next candidate.
      if (status === 404 || status === 405) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("API request failed");
}

export async function openReader(url) {
  return apiRequest("post", "/reader/open", { url });
}

export async function liveStart(url) {
  return apiRequest("post", "/live/start", { url });
}

export async function liveFrame(sessionId, quality = 55) {
  return apiRequest("get", `/live/${sessionId}/frame?q=${quality}`);
}

export async function liveClick(sessionId, x, y) {
  return apiRequest("post", `/live/${sessionId}/click`, { x, y });
}

export async function liveScroll(sessionId, dy) {
  return apiRequest("post", `/live/${sessionId}/scroll`, { dy });
}

export async function liveType(sessionId, text, submit = false) {
  return apiRequest("post", `/live/${sessionId}/type`, { text, submit });
}

export async function liveKey(sessionId, key) {
  return apiRequest("post", `/live/${sessionId}/key`, { key });
}

export async function liveNavigate(sessionId, { url, action } = {}) {
  return apiRequest("post", `/live/${sessionId}/navigate`, { url, action });
}

export async function liveClose(sessionId) {
  return apiRequest("post", `/live/${sessionId}/close`, {});
}

export async function getHealth() {
  return apiRequest("get", "/health");
}
