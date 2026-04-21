import { useRef } from "react";

/**
 * LiveViewport — renders the current screenshot and maps click coordinates
 * back to the worker's viewport space. Simple polling, no WebRTC.
 */
export default function LiveViewport({
  frame,            // { image_b64, mime, width, height, nav_url, ... }
  onClickCoord,
  status,           // "idle" | "starting" | "loading" | "ready" | "error" | "unavailable"
  message,
}) {
  const imgRef = useRef(null);

  const handleClick = (e) => {
    if (!frame || !onClickCoord || !imgRef.current) return;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const scaleX = frame.width / rect.width;
    const scaleY = frame.height / rect.height;
    onClickCoord(Math.round(px * scaleX), Math.round(py * scaleY));
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
      className="cb-live-frame"
      onClick={handleClick}
      data-testid="live-viewport"
      role="img"
      aria-label="Remote browser viewport"
    >
      <img
        ref={imgRef}
        src={`data:${frame.mime || "image/jpeg"};base64,${frame.image_b64}`}
        alt="Remote page"
        draggable={false}
      />
    </div>
  );
}
