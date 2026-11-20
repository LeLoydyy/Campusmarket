import { useEffect, useRef } from "react";

/**
 * Modal basics, set up once when the dialog opens: focus its first field, close on Escape,
 * optionally lock page scroll, and give focus back to where it was on close.
 *
 * Callbacks are read through a ref. Pages often re-render while a dialog is open (Orders ticks
 * every second for the cancel countdown), and re-running this on every render would yank focus
 * out of the text box the person is typing in.
 *
 * @param {React.RefObject<HTMLElement>} panel  the dialog element
 * @param {{ onClose: () => void, canClose?: boolean, focus?: string | React.RefObject<HTMLElement>, lockScroll?: boolean }} options
 */
export default function useDialog(panel, { onClose, canClose = true, focus = "input, select, textarea, button", lockScroll = false }) {
  const latest = useRef({ onClose, canClose });
  latest.current = { onClose, canClose };

  useEffect(() => {
    const previous = document.activeElement;
    const target = typeof focus === "string" ? panel.current?.querySelector(focus) : focus?.current;
    target?.focus();
    const onKey = (event) => {
      if (event.key === "Escape" && latest.current.canClose) latest.current.onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    if (lockScroll) document.body.style.overflow = "hidden";

    // Phones: the on-screen keyboard slides over the page without resizing it, so a dialog
    // pinned to the bottom ends up under the keyboard. --keyboard-inset (its height) lets the
    // dialog sit above it, and the field being typed in is kept in view inside the dialog.
    // Touch screens only: on a laptop, pinch-zoom also shrinks visualViewport and isn't a keyboard.
    const viewport = window.matchMedia?.("(pointer: coarse)").matches ? window.visualViewport : null;
    const root = document.documentElement;
    let frame = 0;
    const keepFieldInView = () => {
      const box = panel.current;
      const field = document.activeElement;
      if (!box || !field || !box.contains(field) || !/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) return;
      const f = field.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (f.bottom > b.bottom - 12) box.scrollTop += f.bottom - b.bottom + 12;
      else if (f.top < b.top + 12) box.scrollTop -= b.top + 12 - f.top;
    };
    const onViewport = () => {
      const keyboard = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      root.style.setProperty("--keyboard-inset", `${keyboard}px`);
      cancelAnimationFrame(frame);
      if (keyboard > 0) frame = requestAnimationFrame(keepFieldInView);
    };
    viewport?.addEventListener("resize", onViewport);
    viewport?.addEventListener("scroll", onViewport);
    if (viewport) onViewport();
    const onFocus = () => requestAnimationFrame(keepFieldInView);
    panel.current?.addEventListener?.("focusin", onFocus);
    const panelElement = panel.current;

    return () => {
      document.removeEventListener("keydown", onKey);
      if (lockScroll) document.body.style.overflow = overflow;
      viewport?.removeEventListener("resize", onViewport);
      viewport?.removeEventListener("scroll", onViewport);
      panelElement?.removeEventListener?.("focusin", onFocus);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--keyboard-inset");
      previous?.focus?.();
    };
    // Once per open, on purpose (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
