const KEY = "cloudbrowse.recent.v1";
const MAX = 8;

export function getRecent() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch (e) {
    return [];
  }
}

export function addRecent(entry) {
  try {
    const list = getRecent().filter((it) => it.url !== entry.url);
    list.unshift({
      url: entry.url,
      title: entry.title || entry.url,
      ts: Date.now(),
    });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch (e) {
    /* ignore */
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignore */
  }
}
