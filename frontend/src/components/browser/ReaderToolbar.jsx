import { Minus, Plus, Sun, Moon, AlignJustify, BookOpen, Monitor, ExternalLink } from "lucide-react";

export default function ReaderToolbar({
  fontStep,
  onFontInc,
  onFontDec,
  theme,
  onThemeCycle,
  spacing,
  onSpacingCycle,
  onOpenLive,
  onOpenOriginal,
}) {
  const themeIcon = theme === "dark" ? <Moon size={16} /> : <Sun size={16} />;
  return (
    <div className="cb-reader-toolbar" data-testid="reader-toolbar">
      <span className="label">Aa</span>
      <div className="group">
        <button
          type="button"
          className="cb-iconbtn"
          aria-label="Decrease font size"
          onClick={onFontDec}
          data-testid="reader-font-dec-btn"
        >
          <Minus size={14} />
        </button>
        <span style={{ fontSize: 12, color: "var(--cb-text-muted)", minWidth: 18, textAlign: "center" }}>
          {fontStep}
        </span>
        <button
          type="button"
          className="cb-iconbtn"
          aria-label="Increase font size"
          onClick={onFontInc}
          data-testid="reader-font-inc-btn"
        >
          <Plus size={14} />
        </button>
      </div>

      <button
        type="button"
        className="cb-iconbtn"
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
        onClick={onThemeCycle}
        data-testid="reader-theme-btn"
      >
        {themeIcon}
      </button>

      <button
        type="button"
        className="cb-iconbtn"
        aria-label={`Spacing: ${spacing}`}
        title={`Spacing: ${spacing}`}
        onClick={onSpacingCycle}
        data-testid="reader-spacing-btn"
      >
        <AlignJustify size={16} />
      </button>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        className="cb-btn ghost"
        onClick={onOpenLive}
        data-testid="reader-open-live-btn"
      >
        <Monitor size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
        Live Mode
      </button>
      <button
        type="button"
        className="cb-btn ghost"
        onClick={onOpenOriginal}
        data-testid="reader-open-original-btn"
      >
        <ExternalLink size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
        Original
      </button>
      <span style={{ display: "none" }}>
        <BookOpen size={14} />
      </span>
    </div>
  );
}
