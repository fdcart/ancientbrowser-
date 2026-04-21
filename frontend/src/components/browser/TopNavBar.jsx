import { useEffect, useRef, useState } from "react";
import { MoreVertical, BookOpen, Monitor, ExternalLink, RefreshCcw, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BrowserActions from "./BrowserActions";
import AddressBar from "./AddressBar";

/**
 * TopNavBar — browser chrome row:
 *   [back] [forward] [reload] [home] [omnibox] [menu]
 */
export default function TopNavBar({
  value,
  onChange,
  onSubmit,
  onBack,
  onForward,
  onReload,
  canBack,
  canForward,
  loading,
  badge,
  menuItems = [],
  autoFocus = false,
  secure = false,
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="cb-toolbar" data-testid="top-nav-bar">
      <BrowserActions
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onHome={() => navigate("/")}
        canBack={canBack}
        canForward={canForward}
        loading={loading}
      />

      <AddressBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        badge={badge}
        autoFocus={autoFocus}
        secure={secure}
      />

      <div className="cb-menu" ref={menuRef}>
        <button
          type="button"
          className="cb-iconbtn"
          aria-label="Menu"
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="browser-menu-btn"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="cb-menu-panel" role="menu" data-testid="browser-menu-panel">
            {menuItems.map((item, i) =>
              item.type === "sep" ? (
                <div className="cb-menu-sep" key={`sep-${i}`} />
              ) : (
                <button
                  key={item.id || i}
                  type="button"
                  role="menuitem"
                  className="cb-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick && item.onClick();
                  }}
                  data-testid={`menu-item-${item.id || i}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const MenuIcons = {
  Reader: <BookOpen size={16} />,
  Live: <Monitor size={16} />,
  OpenOriginal: <ExternalLink size={16} />,
  Reload: <RefreshCcw size={16} />,
  Health: <Activity size={16} />,
};
