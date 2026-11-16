import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import "./OptionsMenu.css";

const PHONE = "(max-width: 600px)";
const GAP = 6;

/**
 * "⋯" button that opens the actions for one row or card.
 *
 * Desktop: a small menu fixed beside the button (tables and cards would clip it).
 * Phones:  a sheet that slides up from the bottom, with large tap targets.
 *
 * items: [{ key, label, hint?, icon?, onSelect, danger?, disabled? }]
 * Items that are falsy are skipped, so callers can write `can && { ... }`.
 */
export default function OptionsMenu({ label, title, items, disabled = false }) {
  const list = items.filter(Boolean);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setPosition(null);
    if (refocus) trigger.current?.focus();
  }, []);

  const toggle = () => {
    if (open) return close();
    setSheet(window.matchMedia(PHONE).matches);
    setOpen(true);
  };

  // Desktop: place the menu under the button, or above it when there's no room below.
  useLayoutEffect(() => {
    if (!open || sheet || !menu.current || !trigger.current) return;
    const button = trigger.current.getBoundingClientRect();
    const height = menu.current.offsetHeight;
    const right = Math.max(8, window.innerWidth - button.right);
    setPosition(button.bottom + GAP + height > window.innerHeight && button.top - GAP - height > 0
      ? { right, bottom: window.innerHeight - button.top + GAP }
      : { right, top: button.bottom + GAP });
  }, [open, sheet]);

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector("[role=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
    const onPointerDown = (event) => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
      else if (event.key === "Tab") close(false);
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const options = [...menu.current.querySelectorAll("[role=menuitem]:not(:disabled)")];
        const index = options.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0
          : event.key === "End" ? options.length - 1
          : event.key === "ArrowDown" ? (index + 1) % options.length
          : (index - 1 + options.length) % options.length;
        options[next]?.focus();
      }
    };
    // A fixed desktop menu would drift away from its button; the phone sheet stays put.
    const onViewportChange = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    if (!sheet) window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, sheet, close]);

  if (!list.length) return null;

  const choose = (item) => () => {
    close(false);
    item.onSelect();
  };

  const options = list.map((item) => (
    <button type="button" role="menuitem" key={item.key} className={item.danger ? "is-danger" : ""}
      disabled={item.disabled} onClick={choose(item)}>
      {item.icon}
      <span>{item.label}{item.hint && <small>{item.hint}</small>}</span>
    </button>
  ));

  return (
    <>
      <button ref={trigger} type="button" className={`om-trigger${open ? " is-open" : ""}`} onClick={toggle} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} aria-label={label} title="Options">
        <MoreHorizontal aria-hidden="true" />
      </button>
      {open && createPortal(
        sheet ? (
          <div className="om-backdrop">
            <div ref={menu} className="om-sheet" role="menu" aria-label={label}>
              {title && <p className="om-title">{title}</p>}
              {options}
              <button type="button" className="om-cancel" onClick={() => close()}>Cancel</button>
            </div>
          </div>
        ) : (
          <div ref={menu} className="om-menu" role="menu" aria-label={label}
            style={position || { visibility: "hidden", top: 0, right: 0 }}>
            {title && <p className="om-title">{title}</p>}
            {options}
          </div>
        ),
        document.body,
      )}
    </>
  );
}
