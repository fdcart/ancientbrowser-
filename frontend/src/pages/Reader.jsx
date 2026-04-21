import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import BrowserShell from "@/components/browser/BrowserShell";
import ReaderToolbar from "@/components/browser/ReaderToolbar";
import StatusBanner from "@/components/browser/StatusBanner";
import { MenuIcons } from "@/components/browser/TopNavBar";
import { openReader } from "@/lib/api";
import { addRecent } from "@/lib/recent";

const THEMES = ["light", "sepia", "dark"];
const SPACINGS = ["tight", "normal", "loose"];
const FONT_STEPS = [14, 15, 16, 17, 18, 19, 20, 22, 24];

export default function Reader() {
  const [params] = useSearchParams();
  const urlParam = params.get("url") || "";
  const navigate = useNavigate();

  const [addr, setAddr] = useState(urlParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [article, setArticle] = useState(null);

  const [fontIdx, setFontIdx] = useState(3);
  const [theme, setTheme] = useState("light");
  const [spacing, setSpacing] = useState("normal");

  useEffect(() => {
    setAddr(urlParam);
    if (!urlParam) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setArticle(null);
    openReader(urlParam)
      .then((data) => {
        if (cancelled) return;
        setArticle(data);
        addRecent({ url: urlParam, title: data.title });
        document.title = `${data.title} — CloudBrowse`;
      })
      .catch((e) => {
        if (cancelled) return;
        const detail =
          e?.response?.data?.detail ||
          e?.message ||
          "Failed to open Reader Mode";
        setError(detail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlParam]);

  const tabs = useMemo(
    () => [
      {
        id: "reader",
        title: article?.title || (loading ? "Loading…" : "Reader"),
      },
    ],
    [article, loading]
  );

  const cycle = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];

  const goLive = () => navigate(`/live?url=${encodeURIComponent(urlParam)}`);
  const openOriginal = () => {
    if (!urlParam) return;
    window.open(urlParam, "_blank", "noopener,noreferrer");
  };

  const reload = () => {
    if (!urlParam) return;
    // trigger re-fetch by re-navigating to same URL param
    navigate(`/reader?url=${encodeURIComponent(urlParam)}`, { replace: true });
    // force refetch
    setLoading(true);
    openReader(urlParam)
      .then((data) => {
        setArticle(data);
        setError(null);
      })
      .catch((e) => {
        const detail = e?.response?.data?.detail || "Failed to reload";
        setError(detail);
      })
      .finally(() => setLoading(false));
  };

  const addrSubmit = (v) => {
    const val = (v || "").trim();
    if (!val) return;
    navigate(`/reader?url=${encodeURIComponent(val)}`);
  };

  const menuItems = [
    {
      id: "switch-live",
      label: "Switch to Live Mode",
      icon: MenuIcons.Live,
      onClick: goLive,
    },
    {
      id: "open-original",
      label: "Open original page",
      icon: MenuIcons.OpenOriginal,
      onClick: openOriginal,
    },
    {
      id: "reload",
      label: "Reload",
      icon: MenuIcons.Reload,
      onClick: reload,
    },
  ];

  const banner = error ? (
    <StatusBanner
      kind="warn"
      action={
        <button
          type="button"
          className="cb-btn ghost"
          onClick={goLive}
          data-testid="banner-try-live-btn"
        >
          Try Live Mode
        </button>
      }
    >
      This page works better in Live Mode. ({error})
    </StatusBanner>
  ) : null;

  return (
    <BrowserShell
      tabs={tabs}
      activeTabId="reader"
      onNewTab={() => navigate("/")}
      nav={{
        value: addr,
        onChange: setAddr,
        onSubmit: addrSubmit,
        onReload: reload,
        onBack: () => navigate(-1),
        onForward: () => navigate(1),
        canBack: true,
        canForward: true,
        loading,
        badge: "READER",
        secure: (urlParam || "").startsWith("https://"),
        menuItems,
      }}
      banner={banner}
    >
      <ReaderToolbar
        fontStep={FONT_STEPS[fontIdx]}
        onFontInc={() => setFontIdx((i) => Math.min(FONT_STEPS.length - 1, i + 1))}
        onFontDec={() => setFontIdx((i) => Math.max(0, i - 1))}
        theme={theme}
        onThemeCycle={() => setTheme((t) => cycle(THEMES, t))}
        spacing={spacing}
        onSpacingCycle={() => setSpacing((s) => cycle(SPACINGS, s))}
        onOpenLive={goLive}
        onOpenOriginal={openOriginal}
      />

      {loading && (
        <div className="cb-empty" data-testid="reader-loading">
          <span className="cb-spinner" style={{ marginRight: 8 }} />
          Extracting article…
        </div>
      )}

      {!loading && !article && error && (
        <div className="cb-empty" data-testid="reader-error">
          <h2>Unable to extract this page</h2>
          <p>{error}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button className="cb-btn primary" type="button" onClick={goLive} data-testid="reader-switch-live-btn">
              Switch to Live Mode
            </button>
            <button className="cb-btn" type="button" onClick={() => navigate("/")} data-testid="reader-home-btn">
              Back to Home
            </button>
          </div>
        </div>
      )}

      {!loading && !article && !error && (
        <div className="cb-empty" data-testid="reader-empty">
          <h2>Enter a URL to read</h2>
          <button className="cb-btn primary" type="button" onClick={() => navigate("/")}>Go Home</button>
        </div>
      )}

      {article && (
        <article
          className={`cb-reader theme-${theme} spacing-${spacing}`}
          style={{ fontSize: FONT_STEPS[fontIdx] }}
          data-testid="reader-article"
        >
          <h1 data-testid="reader-title">{article.title}</h1>
          <div className="meta" data-testid="reader-meta">
            {article.site_name && <span>{article.site_name}</span>}
            {article.byline && <span> · {article.byline}</span>}
            {article.text_length > 0 && (
              <span> · {Math.max(1, Math.round(article.text_length / 1000))} min read</span>
            )}
          </div>
          <div
            className="content"
            data-testid="reader-content"
            /* content is server-sanitized with bleach */
            dangerouslySetInnerHTML={{ __html: article.content_html }}
          />
          <div style={{ marginTop: 32, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="cb-btn" type="button" onClick={openOriginal} data-testid="reader-footer-original-btn">
              Open original
            </button>
            <button className="cb-btn" type="button" onClick={goLive} data-testid="reader-footer-live-btn">
              View in Live Mode
            </button>
            <button
              className="cb-btn ghost"
              type="button"
              onClick={() => {
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(article.final_url);
                    toast.success("Link copied");
                  }
                } catch {
                  /* noop */
                }
              }}
              data-testid="reader-copy-link-btn"
            >
              Copy link
            </button>
          </div>
        </article>
      )}
    </BrowserShell>
  );
}
