import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CalendarClock, Crown, Store } from "lucide-react";
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
          {isPremium ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMode("extend")}>Extend Premium</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("free")}>Move to Free</button>
            </>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setMode("premium")}><Crown aria-hidden="true" /> Make Premium</button>
          )}
        </div>
      )}
      {mode && <PlanDrawer stall={stall} mode={mode} onClose={() => setMode(null)} onSaved={onChanged} />}
    </div>
  );
}
