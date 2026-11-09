import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CalendarClock, CalendarPlus, ChevronDown, Crown, Store } from "lucide-react";
import AdminDrawer from "./AdminDrawer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminService } from "../../services/api.js";
import { can } from "../../utils/adminAccess.js";
import "./PremiumRequests.css";

const FREE_LIMIT = 5;
export const EXPIRING_SOON_DAYS = 14;
const DAY = 86400000;

const isoDay = (date) => date.toISOString().slice(0, 10);
const addMonths = (from, months) => { const date = new Date(from); date.setMonth(date.getMonth() + months); return date; };
const formatDay = (value) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const apiError = (err, fallback) => err.response?.data?.details?.[0]?.message || err.response?.data?.error || fallback;

/** Days until a Premium end date (rounded up), or null when there is no end date. */
export const daysLeft = (until) => (until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / DAY)) : null);
export const isExpiringSoon = (stall) => {
  const days = stall.tier === "premium" ? daysLeft(stall.premium_until) : null;
  return days !== null && days <= EXPIRING_SOON_DAYS;
};

/** Switch to Premium, extend Premium, or move to Free — with an optional note the seller receives. */
function PlanDrawer({ stall, mode, onClose, onSaved }) {
  const extending = mode === "extend";
  // Extending starts from the current end date (or today), one semester later.
  const base = extending && stall.premium_until && Date.parse(stall.premium_until) > Date.now() ? new Date(stall.premium_until) : new Date();
  const [until, setUntil] = useState(() => isoDay(addMonths(base, 5)));
  const [noEnd, setNoEnd] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const listings = Number(stall.product_count || 0);
  const toHide = Math.max(0, listings - FREE_LIMIT);

  const save = async () => {
    setBusy(true);
    try {
      const body = mode === "free"
        ? { tier: "free", note: note.trim() }
        : { tier: "premium", premium_until: noEnd ? null : until, note: note.trim() };
      const { data } = await adminService.setPlan(stall.id, body);
      toast.success(mode === "free" ? `${stall.name} is now on Free` : extending ? "Premium updated" : `${stall.name} is now Premium`);
      onSaved(data);
      onClose();
    } catch (err) {
      toast.error(apiError(err, "Plan update failed"));
    } finally {
      setBusy(false);
    }
  };

  const titles = { premium: "Move to Premium", extend: "Extend Premium", free: "Move to Free" };
  return (
    <AdminDrawer eyebrow={titles[mode]} title={stall.name} subtitle={`${stall.seller_name || stall.users?.name || "Campus seller"} · ${listings} listings`}
      labelId="sp-title" avatar={mode === "free" ? <Store aria-hidden="true" /> : <Crown aria-hidden="true" />} onClose={onClose}
      footer={<>
        <button type="button" className={`btn ${mode === "free" ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={save}>
          {busy ? "Saving…" : titles[mode]}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
      </>}>
      {stall.tier === "premium" && (
        <dl className="mu-facts">
          <div><dt>Premium now</dt><dd>{stall.premium_until ? `Until ${formatDay(stall.premium_until)}` : "No end date"}</dd></div>
        </dl>
      )}
      {mode === "free" ? (
        <div className={`sp-warning${toHide ? "" : " is-calm"}`}>
          <AlertTriangle aria-hidden="true" />
          <p>
            {toHide
              ? <>This stall has <strong>{listings} listings</strong>. Free shows {FREE_LIMIT}, so up to <strong>{toHide} of the oldest visible</strong> will be hidden. The seller can choose which {FREE_LIMIT} stay visible, and hidden ones return if the stall goes Premium again.</>
              : <>Featured products, analytics and the point of sale turn off. Its {listings} listings stay visible.</>}
          </p>
        </div>
      ) : (
        <fieldset className="ma-fieldset">
          <legend>{extending ? "New end date" : "Premium until"}</legend>
          <label className="pr-until">
            <input type="date" className="form-input" value={until} min={isoDay(new Date(Date.now() + DAY))} disabled={noEnd} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <label className="mu-check"><input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} /><span>No end date</span></label>
          <p className="ma-help">On the end date the stall goes back to Free automatically, and the seller is told.</p>
        </fieldset>
      )}
      <label className="mu-note">
        <span>Note to the seller <small>(optional, included in their notification)</small></span>
        <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={mode === "free" ? "e.g. Your semester subscription has ended." : "e.g. Payment received at the OSAS office, thank you!"} />
      </label>
    </AdminDrawer>
  );
}

const MENU_HEIGHT = 125;

/**
 * "Options" button on a Premium stall: opens a small menu of plan changes.
 * The menu is fixed to the viewport because the stall card would clip it.
 */
function PlanOptions({ stallName, onPick }) {
  const [position, setPosition] = useState(null);
  const open = Boolean(position);
  const root = useRef(null);
  const trigger = useRef(null);
  const close = () => setPosition(null);

  const toggle = () => {
    if (open) return close();
    const rect = trigger.current.getBoundingClientRect();
    const opensUp = rect.bottom + MENU_HEIGHT > window.innerHeight;
    setPosition({
      right: Math.max(8, window.innerWidth - rect.right),
      ...(opensUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    root.current.querySelector("[role=menuitem]")?.focus();
    const onPointerDown = (event) => { if (!root.current?.contains(event.target)) close(); };
    document.addEventListener("mousedown", onPointerDown);
    // A fixed menu would drift away from its button.
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const onKeyDown = (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      close();
      trigger.current?.focus();
    } else if (event.key === "Tab") {
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = [...root.current.querySelectorAll("[role=menuitem]")];
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(items.indexOf(document.activeElement) + step + items.length) % items.length]?.focus();
    }
  };
  const pick = (mode) => () => { close(); onPick(mode); };

  return (
    <div className="sp-menu" ref={root} onKeyDown={onKeyDown}>
      <button type="button" ref={trigger} className={`btn btn-outline btn-sm sp-menu-trigger${open ? " is-open" : ""}`} onClick={toggle}
        aria-haspopup="menu" aria-expanded={open} aria-label={`Plan options for ${stallName}`}>
        Options <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="sp-menu-list" role="menu" aria-label={`Plan options for ${stallName}`} style={position}>
          <button type="button" role="menuitem" onClick={pick("extend")}>
            <CalendarPlus aria-hidden="true" />
            <span>Extend Premium<small>Choose a new end date</small></span>
          </button>
          <button type="button" role="menuitem" className="is-danger" onClick={pick("free")}>
            <Store aria-hidden="true" />
            <span>Move to Free<small>You&apos;ll confirm this next</small></span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Plan summary and actions on a stall card in Stores & Plans. */
export default function StallPlanControl({ stall, onChanged }) {
  const { user } = useAuth();
  const [mode, setMode] = useState(null);
  const isPremium = stall.tier === "premium";
  const days = isPremium ? daysLeft(stall.premium_until) : null;
  const soon = isExpiringSoon(stall);
  const limit = stall.plan?.listing_limit ?? (isPremium ? 25 : FREE_LIMIT);
  const manage = can(user, "marketplace") && stall.status === "approved";

  return (
    <div className={`sp-plan${isPremium ? " is-premium" : ""}`}>
      <div className="sp-plan-row">
        <span className={`sp-chip${isPremium ? " is-premium" : ""}`}>{isPremium && <Crown aria-hidden="true" />}{isPremium ? "Premium" : "Free"}</span>
        <span className="sp-listings">{stall.product_count || 0} / {limit} listings</span>
      </div>
      {(isPremium || manage) && (
        <div className="sp-plan-foot">
          {isPremium && (
            <p className={`sp-until${soon ? " is-soon" : ""}`}>
              <CalendarClock aria-hidden="true" />
              {stall.premium_until
                ? <>Until {formatDay(stall.premium_until)}{soon && <b>{days === 0 ? "Ends today" : `Expiring in ${days} day${days === 1 ? "" : "s"}`}</b>}</>
                : "No end date"}
            </p>
          )}
          {manage && (
            <div className="sp-actions">
              {isPremium
                ? <PlanOptions stallName={stall.name} onPick={setMode} />
                : <button type="button" className="btn btn-outline btn-sm" onClick={() => setMode("premium")}><Crown aria-hidden="true" /> Make Premium</button>}
            </div>
          )}
        </div>
      )}
      {mode && <PlanDrawer stall={stall} mode={mode} onClose={() => setMode(null)} onSaved={onChanged} />}
    </div>
  );
}
