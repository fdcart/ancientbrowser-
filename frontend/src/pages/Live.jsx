import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronUp, ChevronDown, Power, Send, BookOpen } from "lucide-react";
import { toast } from "sonner";

import BrowserShell from "@/components/browser/BrowserShell";
import StatusBanner from "@/components/browser/StatusBanner";
import LiveViewport from "@/components/browser/LiveViewport";
import { MenuIcons } from "@/components/browser/TopNavBar";
import {
  liveStart,
  liveFrame,
  liveClick,
  liveScroll,
  liveType,
  liveNavigate,
  liveClose,
} from "@/lib/api";
import { addRecent } from "@/lib/recent";

const POLL_MS = 1500;
const IDLE_WARN_MS = 120_000; // 2 min
const IDLE_CLOSE_MS = 300_000; // 5 min

const QUALITIES = [
  { label: "Low", value: 35 },
  { label: "Medium", value: 55 },
  { label: "High", value: 75 },
];

export default function Live() {
  const [params] = useSearchParams();
  const urlParam = params.get("url") || "";
  const navigate = useNavigate();

  const [addr, setAddr] = useState(urlParam);
  const [status, setStatus] = useState("idle"); // idle|starting|ready|error|unavailable
  const [error, setError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [frame, setFrame] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState(55);
  const [typeValue, setTypeValue] = useState("");
  const [idleWarned, setIdleWarned] = useState(false);
  const lastActionRef = useRef(Date.now());
  const pollRef = useRef(null);
  const sessionRef = useRef(null);

  const markAction = () => {
    lastActionRef.current = Date.now();
    setIdleWarned(false);
  };

  const startSession = useCallback(
    async (target) => {
      setStatus("starting");
      setError(null);
      setFrame(null);
      try {
        const res = await liveStart(target);
        setSessionId(res.session_id);
        sessionRef.current = res.session_id;
        setStatus("ready");
        addRecent({ url: target, title: res.title || target });
        markAction();
      } catch (e) {
        if (e?.response?.status === 503) {
          setStatus("unavailable");
          setError(e.response.data?.detail || "Remote browser worker unavailable");
        } else if (e?.response?.status === 400) {
          setStatus("error");
          setError(e.response.data?.detail || "Invalid URL");
        } else {
          setStatus("error");
          setError(e?.response?.data?.detail || e?.message || "Failed to start Live Mode");
        }
      }
    },
    []
  );

  // start session on url change
  useEffect(() => {
    // Close any existing session first
    const prev = sessionRef.current;
    if (prev) {
      liveClose(prev).catch(() => {});
      sessionRef.current = null;
      setSessionId(null);
    }
    setAddr(urlParam);
    if (!urlParam) {
      setStatus("idle");
      return undefined;
    }
    startSession(urlParam);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam]);

  // close on unmount
  useEffect(() => {
    return () => {
      const sid = sessionRef.current;
      if (sid) {
        liveClose(sid).catch(() => {});
      }
    };
  }, []);

  // poll for frames
  useEffect(() => {
    if (!sessionId || status !== "ready") return undefined;
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const f = await liveFrame(sessionId, quality);
        if (!active) return;
        setFrame(f);
        if (f.nav_url) setAddr(f.nav_url);
      } catch (e) {
        // Session likely expired
        if (e?.response?.status === 404) {
          setStatus("error");
          setError("Session expired. Reload to start a new one.");
          return;
        }
        if (e?.response?.status === 503) {
          setStatus("unavailable");
          setError(e.response.data?.detail || "Remote browser worker is unavailable");
          return;
        }
        /* transient network hiccup — keep trying */
      }
      if (active) pollRef.current = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      active = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [sessionId, status, quality]);

  // idle timeout warn/close
  useEffect(() => {
    if (!sessionId) return undefined;
    const interval = setInterval(() => {
      const idle = Date.now() - lastActionRef.current;
      if (idle > IDLE_CLOSE_MS) {
        if (sessionRef.current) liveClose(sessionRef.current).catch(() => {});
        sessionRef.current = null;
        setSessionId(null);
        setStatus("error");
        setError("Session closed due to inactivity.");
      } else if (idle > IDLE_WARN_MS && !idleWarned) {
        setIdleWarned(true);
        toast.warning("Live session will close soon due to inactivity.");
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [sessionId, idleWarned]);

  const handleAction = async (fn) => {
    if (!sessionId) return;
    setLoading(true);
    markAction();
    try {
      await fn();
      const f = await liveFrame(sessionId, quality);
      setFrame(f);
      if (f.nav_url) setAddr(f.nav_url);
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Action failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const addrSubmit = (v) => {
    const val = (v || "").trim();
    if (!val) return;
    navigate(`/live?url=${encodeURIComponent(val)}`);
  };

  const onClickCoord = (x, y) => handleAction(() => liveClick(sessionId, x, y));
  const onScroll = (dy) => handleAction(() => liveScroll(sessionId, dy));
  const onType = async () => {
    if (!sessionId || !typeValue) return;
    await handleAction(() => liveType(sessionId, typeValue, true));
    setTypeValue("");
  };
  const onNav = (action) => handleAction(() => liveNavigate(sessionId, { action }));
  const onTerminate = async () => {
    if (sessionId) {
      try {
        await liveClose(sessionId);
      } catch {
        /* ignore */
      }
    }
    sessionRef.current = null;
    setSessionId(null);
    setStatus("idle");
    setFrame(null);
    toast.success("Session terminated");
  };

  const tabs = useMemo(
    () => [{ id: "live", title: addr || "Live" }],
    [addr]
  );

  const goReader = () =>
    navigate(`/reader?url=${encodeURIComponent(urlParam || addr)}`);

  const menuItems = [
    {
      id: "switch-reader",
      label: "Switch to Reader Mode",
      icon: <BookOpen size={16} />,
      onClick: goReader,
    },
    {
      id: "terminate",
      label: "Terminate session",
      icon: <Power size={16} />,
      onClick: onTerminate,
    },
  ];

  let banner = null;
  if (status === "unavailable") {
    banner = (
      <StatusBanner
        kind="error"
        action={
          <button className="cb-btn ghost" type="button" onClick={goReader} data-testid="banner-reader-btn">
            Use Reader Mode
          </button>
        }
      >
        {error || "Remote browsing is temporarily unavailable."}
      </StatusBanner>
    );
  } else if (status === "error" && error) {
    banner = (
      <StatusBanner
        kind="warn"
        action={
          <button
            className="cb-btn ghost"
            type="button"
            onClick={() => startSession(urlParam)}
            data-testid="banner-retry-btn"
          >
            Retry
          </button>
        }
      >
        {error}
      </StatusBanner>
    );
  }

  return (
    <BrowserShell
      tabs={tabs}
      activeTabId="live"
      onNewTab={() => navigate("/")}
      nav={{
        value: addr,
        onChange: setAddr,
        onSubmit: addrSubmit,
        onReload: () => onNav("reload"),
        onBack: () => onNav("back"),
        onForward: () => onNav("forward"),
        canBack: !!sessionId,
        canForward: !!sessionId,
        loading: loading || status === "starting",
        badge: "LIVE",
        secure: (addr || "").startsWith("https://"),
        menuItems,
      }}
      banner={banner}
    >
      <div className="cb-live" data-testid="live-container">
        <LiveViewport
          frame={frame}
          onClickCoord={onClickCoord}
          status={status}
          message={
            status === "unavailable"
              ? "Remote browsing is temporarily unavailable. Try Reader Mode instead."
              : status === "error"
              ? error
              : null
          }
        />

        <div className="cb-live-controls" data-testid="live-controls">
          <button
            type="button"
            className="cb-btn"
            onClick={() => onScroll(-600)}
            disabled={!sessionId}
            data-testid="live-scroll-up-btn"
          >
            <ChevronUp size={14} style={{ verticalAlign: -2 }} /> Scroll up
          </button>
          <button
            type="button"
            className="cb-btn"
            onClick={() => onScroll(600)}
            disabled={!sessionId}
            data-testid="live-scroll-down-btn"
          >
            <ChevronDown size={14} style={{ verticalAlign: -2 }} /> Scroll down
          </button>

          <span className="cb-quality" data-testid="live-quality">
            <label htmlFor="cb-q">Quality</label>
            <select
              id="cb-q"
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              data-testid="live-quality-select"
            >
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </span>

          <button
            type="button"
            className="cb-btn"
            onClick={onTerminate}
            disabled={!sessionId}
            data-testid="live-terminate-btn"
          >
            <Power size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Terminate
          </button>

          <span className="cb-live-hint">
            Tap the page to click · polling every {POLL_MS / 1000}s
          </span>
        </div>

        <div className="cb-live-typebox" data-testid="live-typebox">
          <input
            type="text"
            placeholder="Type into focused input (press Enter to submit)"
            value={typeValue}
            onChange={(e) => setTypeValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onType();
            }}
            disabled={!sessionId}
            data-testid="live-type-input"
          />
          <button
            type="button"
            className="cb-btn primary"
            onClick={onType}
            disabled={!sessionId || !typeValue}
            data-testid="live-type-submit-btn"
          >
            <Send size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Send
          </button>
        </div>
      </div>
    </BrowserShell>
  );
}
