import { useEffect, useRef, useState } from "react";
import { Lock, Search, Globe } from "lucide-react";

/**
 * Chrome-inspired rounded omnibox. Accepts URL or search.
 */
export default function AddressBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Enter URL and press Enter",
  badge,
  autoFocus = false,
  secure = false,
  disabled = false,
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  const LeadingIcon = secure ? Lock : value ? Globe : Search;

  return (
    <form
      className={`cb-omnibox-wrap ${focused ? "focused" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit && onSubmit(value || "");
      }}
      data-testid="address-bar-form"
    >
      <LeadingIcon className="cb-omnibox-icon" size={16} />
      <input
        ref={inputRef}
        type="text"
        className="cb-omnibox"
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={disabled}
        aria-label="Address bar"
        data-testid="address-bar-input"
      />
      {badge && <span className="cb-omnibox-badge">{badge}</span>}
    </form>
  );
}
