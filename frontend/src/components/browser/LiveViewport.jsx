import { useEffect, useRef } from "react";

const SPECIAL_KEYS = new Set([
  "Enter", "Backspace", "Delete", "Tab", "Escape",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

const FLUSH_DELAY_MS = 120;

/**
 * LiveViewport
 *
 * Renders the current screenshot and exposes three input channels:
 *   - onClickCoord(x, y) when the user taps the screenshot
 *   - onTypeText(text) debounced buffered printable characters
 *   - onKeyPress(key)   immediate special keys (Enter, Backspace, arrows...)
 *
 * The viewport becomes keyboard-focused on click (tabindex=0), so every
 * subsequent keystroke is forwarded to the remote page until the user
 * clicks outside it. A tiny "Keyboard active" badge is shown while focused.
 */
export default function LiveViewport({
  frame,
  onClickCoord,
  onTypeText,
  onKeyPress,
  status,
  message,
  focused,
  onFocusedChange,
}) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const bufferRef = useRef("");
  const flushTimerRef = useRef(null);

  const flushBuffer = () => {
    const text = bufferRef.current;
    bufferRef.current = "";
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (text && onTypeText) onTypeText(text);
  };

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const handleClick = (e) => {
    if (!frame || !imgRef.current) return;
    if (containerRef.current) {
      containerRef.current.focus();
      onFocusedChange && onFocusedChange(true);
    }
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scaleX = frame.width / rect.width;
    const scaleY = frame.height / rect.height;
    onClickCoord && onClickCoord(Math.round(px * scaleX), Math.round(py * scaleY));
  };

  const handleKeyDown = (e) => {
    if (!frame) return;
    // Allow browser shortcuts with Ctrl/Meta/Alt to pass through
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      flushBuffer();
      onKeyPress && onKeyPress(e.key);
      return;
    }
    // Single printable char (length 1 in modern browsers; iOS 12 supports this)
    if (e.key && e.key.length === 1) {
      e.preventDefault();
      bufferRef.current += e.key;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushBuffer, FLUSH_DELAY_MS);
      return;
    }
    // Space key (some browsers report " ", others "Spacebar")
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      bufferRef.current += " ";
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushBuffer, FLUSH_DELAY_MS);
    }
  };

  if (!frame) {
    return (
      <div className="cb-live-frame empty" data-testid="live-viewport-empty">
        {status === "starting" ? (
          <span>
            <span className="cb-spinner" style={{ marginRight: 8 }} />
            Starting remote browser session…
          </span>
        ) : (
          <span>{message || "Enter a URL to start Live Mode."}</span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`cb-live-frame ${focused ? "kbd-focus" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => onFocusedChange && onFocusedChange(true)}
      onBlur={() => {
        flushBuffer();
        onFocusedChange && onFocusedChange(false);
      }}
      tabIndex={0}
      role="application"
      aria-label="Remote browser viewport — click to enable keyboard input"
      data-testid="live-viewport"
    >
      <img
        ref={imgRef}
        src={`data:${frame.mime || "image/jpeg"};base64,${frame.image_b64}`}
        alt="Remote page"
        draggable={false}
      />
      {focused && (
        <span className="cb-kbd-badge" aria-hidden="true" data-testid="live-kbd-badge">
          <span className="cb-kbd-dot" /> Keyboard active
        </span>
      )}
    </div>
  );
}
