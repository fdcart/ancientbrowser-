import { Info, AlertTriangle, AlertOctagon, X } from "lucide-react";

const ICONS = {
  info: <Info size={16} />,
  warn: <AlertTriangle size={16} />,
  error: <AlertOctagon size={16} />,
};

export default function StatusBanner({ kind = "info", children, action, onDismiss }) {
  return (
    <div className={`cb-banner ${kind}`} role="status" data-testid={`status-banner-${kind}`}>
      {ICONS[kind]}
      <span>{children}</span>
      <span className="cb-banner-spacer" />
      {action}
      {onDismiss && (
        <button
          type="button"
          className="cb-iconbtn"
          style={{ width: 24, height: 24, color: "inherit" }}
          onClick={onDismiss}
          aria-label="Dismiss"
          data-testid="status-banner-dismiss-btn"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
