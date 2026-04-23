import axios from "axios";

const RAW_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "/_/backend";
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, "");
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "";

export const http = axios.create({
  baseURL: API,
  timeout: 30000,
});

export async function openReader(url) {
  const res = await http.post("/reader/open", { url });
  return res.data;
}

export async function liveStart(url) {
  const res = await http.post("/live/start", { url });
  return res.data;
}

export async function liveFrame(sessionId, quality = 55) {
  const res = await http.get(`/live/${sessionId}/frame?q=${quality}`);
  return res.data;
}

export async function liveClick(sessionId, x, y) {
  const res = await http.post(`/live/${sessionId}/click`, { x, y });
  return res.data;
}

export async function liveScroll(sessionId, dy) {
  const res = await http.post(`/live/${sessionId}/scroll`, { dy });
  return res.data;
}

export async function liveType(sessionId, text, submit = false) {
  const res = await http.post(`/live/${sessionId}/type`, { text, submit });
  return res.data;
}

export async function liveKey(sessionId, key) {
  const res = await http.post(`/live/${sessionId}/key`, { key });
  return res.data;
}

export async function liveNavigate(sessionId, { url, action } = {}) {
  const res = await http.post(`/live/${sessionId}/navigate`, { url, action });
  return res.data;
}

export async function liveClose(sessionId) {
  const res = await http.post(`/live/${sessionId}/close`, {});
  return res.data;
}

export async function getHealth() {
  const res = await http.get("/health");
  return res.data;
}
