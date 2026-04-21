import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Monitor, X, Sparkles } from "lucide-react";

import BrowserShell from "@/components/browser/BrowserShell";
import StatusBanner from "@/components/browser/StatusBanner";
import { MenuIcons } from "@/components/browser/TopNavBar";
import { getRecent, clearRecent } from "@/lib/recent";
import { getHealth } from "@/lib/api";

const QUICK_LAUNCH = [
  { label: "ChatGPT",    url: "https://chatgpt.com",            mode: "live",   tone: "#10a37f", hint: "Ask anything" },
  { label: "Wikipedia",  url: "https://en.wikipedia.org",       mode: "reader", tone: "#202122", hint: "Encyclopedia" },
  { label: "Hacker News",url: "https://news.ycombinator.com",   mode: "reader", tone: "#ff6600", hint: "Tech news" },
  { label: "BBC News",   url: "https://www.bbc.com/news",       mode: "reader", tone: "#bb1919", hint: "World news" },
  { label: "arXiv",      url: "https://arxiv.org",              mode: "reader", tone: "#b31b1b", hint: "Research" },
  { label: "Reddit",     url: "https://old.reddit.com",         mode: "live",   tone: "#ff4500", hint: "Classic web" },
  { label: "Google",     url: "https://www.google.com",         mode: "live",   tone: "#4285f4", hint: "Search" },
  { label: "DuckDuckGo", url: "https://duckduckgo.com",         mode: "live",   tone: "#de5833", hint: "Private search" },
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

export default function Home() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState([]);
  const [workerStatus, setWorkerStatus] = useState({ ok: false, configured: false });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setRecent(getRecent());
    getHealth()
      .then((h) => setWorkerStatus(h.worker || { ok: false, configured: false }))
      .catch(() => setWorkerStatus({ ok: false, configured: false }));
  }, []);

  const tabs = useMemo(
    () => [{ id: "home", title: "New Tab" }],
    []
  );

  const go = (mode) => {
    const v = input.trim();
    if (!v) return;
    const target = `/${mode}?url=${encodeURIComponent(v)}`;
    navigate(target);
  };

  const onAddressSubmit = (v) => {
    if (!v) return;
    setInput(v);
    navigate(`/reader?url=${encodeURIComponent(v)}`);
  };

  const menuItems = [
    {
      id: "reader",
      label: "Open in Reader Mode",
      icon: MenuIcons.Reader,
      onClick: () => go("reader"),
    },
    {
      id: "live",
      label: "Open in Live Mode",
      icon: MenuIcons.Live,
      onClick: () => go("live"),
    },
    { type: "sep" },
    {
      id: "clear-recent",
      label: "Clear recent URLs",
      icon: <X size={16} />,
      onClick: () => {
        clearRecent();
        setRecent([]);
      },
    },
  ];

  const banner =
    !bannerDismissed && !workerStatus.ok ? (
      <StatusBanner
        kind="warn"
        onDismiss={() => setBannerDismissed(true)}
      >
        Live Mode is currently unavailable{" "}
        {workerStatus.configured ? "(worker offline)." : "(worker not configured)."} Reader Mode still works.
      </StatusBanner>
    ) : null;

  return (
    <BrowserShell
      tabs={tabs}
      activeTabId="home"
      nav={{
        value: input,
        onChange: setInput,
        onSubmit: onAddressSubmit,
        onReload: null,
        onBack: null,
        onForward: null,
        canBack: false,
        canForward: false,
        autoFocus: false,
        badge: "CLOUDBROWSE",
        menuItems,
      }}
      banner={banner}
    >
      <div className="cb-startpage" data-testid="home-startpage">
        <div className="cb-wordmark">
          Cloud<span className="dot" />Browse
        </div>

        <div
          className={`cb-start-search ${focused ? "focused" : ""}`}
          data-testid="home-search"
        >
          <BookOpen size={18} style={{ color: "var(--cb-text-muted)", marginRight: 10 }} />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Enter a URL — e.g. en.wikipedia.org/wiki/Safari"
            onKeyDown={(e) => {
              if (e.key === "Enter") go("reader");
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            data-testid="home-url-input"
          />
        </div>

        <div className="cb-start-actions">
          <button
            type="button"
            className="cb-btn primary"
            onClick={() => go("reader")}
            disabled={!input.trim()}
            data-testid="home-reader-btn"
          >
            <BookOpen size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Open in Reader Mode
          </button>
          <button
            type="button"
            className="cb-btn"
            onClick={() => go("live")}
            disabled={!input.trim()}
            data-testid="home-live-btn"
          >
            <Monitor size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Open in Live Mode
          </button>
        </div>

        <p style={{ marginTop: 24, color: "var(--cb-text-muted)", fontSize: 12 }}>
          Works best for articles, blogs, news, and documentation. Highly
          interactive apps may only partially work.
        </p>

        <div className="cb-quicklaunch" data-testid="home-quicklaunch">
          <h3>
            <Sparkles size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
            Quick launch
          </h3>
          <div className="cb-ql-grid">
            {QUICK_LAUNCH.map((q) => (
              <button
                key={q.url}
                type="button"
                className="cb-ql-card"
                onClick={() =>
                  navigate(`/${q.mode}?url=${encodeURIComponent(q.url)}`)
                }
                data-testid={`quicklaunch-${q.label.toLowerCase().replace(/\s+/g, "-")}`}
                title={`${q.label} — ${q.mode === "live" ? "Live Mode" : "Reader Mode"}`}
              >
                <span
                  className="cb-ql-dot"
                  style={{ background: q.tone }}
                  aria-hidden="true"
                >
                  {q.label.charAt(0)}
                </span>
                <span className="cb-ql-name">{q.label}</span>
                <span className="cb-ql-mode">
                  {q.mode === "live" ? "Live" : "Reader"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {recent.length > 0 && (
          <div className="cb-recent" data-testid="home-recent">
            <h3>Recent</h3>
            <div className="cb-recent-grid">
              {recent.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  className="cb-recent-card"
                  onClick={() => navigate(`/reader?url=${encodeURIComponent(r.url)}`)}
                  data-testid={`recent-${hostnameOf(r.url)}`}
                  title={r.url}
                >
                  <div className="cb-recent-favicon">
                    {hostnameOf(r.url).charAt(0)}
                  </div>
                  <div className="cb-recent-label">{r.title || hostnameOf(r.url)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 40,
            fontSize: 11,
            color: "var(--cb-text-faint)",
            display: "flex",
            gap: 14,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
          data-testid="home-worker-status"
        >
          <span>
            Worker:{" "}
            <span
              style={{
                color: workerStatus.ok ? "#137333" : "var(--cb-danger)",
              }}
            >
              {workerStatus.ok
                ? "online"
                : workerStatus.configured
                ? "offline"
                : "not configured"}
            </span>
          </span>
          <span>•</span>
          <span>Designed to work in Chrome on iOS 12</span>
        </div>
      </div>

      <div className="cb-footer">
        CloudBrowse is not affiliated with Google or Chrome. A neutral,
        Chromium-inspired cloud browser for older devices.
      </div>
    </BrowserShell>
  );
}
