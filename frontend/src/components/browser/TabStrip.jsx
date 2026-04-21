import { X, Plus, Globe } from "lucide-react";

/**
 * Chromium-inspired tab strip. Even with a single tab, it gives the app
 * a recognizable browser feel.
 */
export default function TabStrip({ tabs = [], activeId, onSwitch, onClose, onNew }) {
  return (
    <div className="cb-tabstrip" data-testid="tab-strip" role="tablist">
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={isActive}
            className={`cb-tab ${isActive ? "active" : "inactive"}`}
            onClick={() => onSwitch && onSwitch(t.id)}
            data-testid={`tab-${t.id}`}
          >
            <Globe size={14} style={{ color: "var(--cb-text-muted)" }} />
            <span className="cb-tab-title">{t.title || "New tab"}</span>
            {tabs.length > 1 && (
              <button
                type="button"
                className="cb-tab-close"
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose && onClose(t.id);
                }}
                data-testid={`tab-close-${t.id}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      {onNew && (
        <button
          type="button"
          className="cb-newtab"
          aria-label="New tab"
          onClick={onNew}
          data-testid="tab-new-btn"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}
