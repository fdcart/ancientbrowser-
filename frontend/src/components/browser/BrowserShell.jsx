import TabStrip from "./TabStrip";
import TopNavBar from "./TopNavBar";

/**
 * BrowserShell wraps a page in the Chromium-style chrome:
 *   tab strip -> top nav bar -> (banner slot) -> content
 */
export default function BrowserShell({
  tabs,
  activeTabId,
  onTabSwitch,
  onTabClose,
  onNewTab,
  nav,        // props forwarded to TopNavBar
  banner,     // optional <StatusBanner /> element
  children,
}) {
  return (
    <div className="cb-shell" data-testid="browser-shell">
      <TabStrip
        tabs={tabs || []}
        activeId={activeTabId}
        onSwitch={onTabSwitch}
        onClose={onTabClose}
        onNew={onNewTab}
      />
      <TopNavBar {...(nav || {})} />
      {banner}
      <div className="cb-content" data-testid="browser-content">
        {children}
      </div>
    </div>
  );
}
