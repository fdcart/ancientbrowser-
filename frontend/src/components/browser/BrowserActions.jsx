import { ArrowLeft, ArrowRight, RotateCw, Home as HomeIcon } from "lucide-react";

export default function BrowserActions({
  onBack,
  onForward,
  onReload,
  onHome,
  canBack = false,
  canForward = false,
  loading = false,
}) {
  return (
    <>
      <button
        type="button"
        className="cb-iconbtn"
        aria-label="Back"
        disabled={!canBack || !onBack}
        onClick={onBack}
        data-testid="browser-back-btn"
      >
        <ArrowLeft size={18} />
      </button>
      <button
        type="button"
        className="cb-iconbtn"
        aria-label="Forward"
        disabled={!canForward || !onForward}
        onClick={onForward}
        data-testid="browser-forward-btn"
      >
        <ArrowRight size={18} />
      </button>
      <button
        type="button"
        className="cb-iconbtn"
        aria-label={loading ? "Stop" : "Reload"}
        disabled={!onReload}
        onClick={onReload}
        data-testid="browser-reload-btn"
      >
        {loading ? <span className="cb-spinner" /> : <RotateCw size={16} />}
      </button>
      {onHome && (
        <button
          type="button"
          className="cb-iconbtn"
          aria-label="Home"
          onClick={onHome}
          data-testid="browser-home-btn"
        >
          <HomeIcon size={16} />
        </button>
      )}
    </>
  );
}
