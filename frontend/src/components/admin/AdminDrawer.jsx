import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { plural } from "../../utils/marketplace.js";
import "../../pages/admin/ManageUsers.css";
import "../../pages/admin/ManageAdmins.css";

/** Right-hand panel used across the admin pages. Escape or the backdrop closes it; focus returns afterwards. */
export default function AdminDrawer({ title, eyebrow, subtitle, avatar, onClose, children, footer, labelId = "admin-drawer-title" }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("input, select, textarea, button:not(.mu-drawer-close)")?.focus();
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus?.(); };
  }, [onClose]);

  return (
    <div className="mu-drawer-layer" role="presentation" onClick={onClose}>
      <aside ref={panel} className="mu-drawer" role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={(e) => e.stopPropagation()}>
        <header className="mu-drawer-head">
          {avatar && <span className="mu-avatar mu-avatar--lg" aria-hidden="true">{avatar}</span>}
          <div>
            {eyebrow && <p className="cm-eyebrow">{eyebrow}</p>}
            <h2 id={labelId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="mu-drawer-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </header>
        {children}
        {footer && <footer className="mu-drawer-actions">{footer}</footer>}
      </aside>
    </div>
  );
}

/** Removing an account always needs a reason; it's stored with the record and shown in the activity log. */
export function RemoveAccountDrawer({ account, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 10;
  return (
    <AdminDrawer
      eyebrow="Remove account" title={account.name} subtitle={account.email} labelId="remove-title"
      avatar={account.name?.charAt(0).toUpperCase()} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-danger" disabled={busy || !ok} onClick={() => onConfirm(reason.trim())}>{busy ? "Removing…" : "Remove account"}</button>
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
      </>}
    >
      <dl className="mu-facts">
        <div><dt>Role</dt><dd>{account.role}</dd></div>
        <div><dt>ID number</dt><dd className="mu-id">{account.campus_id || "—"}</dd></div>
        {account.username && <div><dt>Username</dt><dd>{account.username}</dd></div>}
        {account.department && <div><dt>College / program / office</dt><dd>{account.department}</dd></div>}
        <div><dt>Registered</dt><dd>{new Date(account.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</dd></div>
      </dl>
      <p className="mu-prev-note"><AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: "-3px" }} /> They're signed out at once and can't sign in. Their orders and history stay, and an admin with the remove privilege can restore the account from the "Removed" list.</p>
      <label className="mu-note">
        <span>Reason for removal <small>(required, 10+ characters)</small></span>
        <textarea rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate account; student no longer enrolled; violated marketplace rules." />
      </label>
    </AdminDrawer>
  );
}

/** "12 users · page 1 of 3" with previous / next. */
export function Pager({ total, page, pageSize, onPage, noun = "record" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="mu-footer">
      <p>{plural(total, noun)} · page {page} of {pages}</p>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden="true" /> Previous</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight aria-hidden="true" /></button>
      </div>
    </footer>
  );
}

/** Month + date filters shared by both tabs. Picking a date clears the month and vice versa. */
export function DateFilters({ month, date, onChange }) {
  return (
    <div className="ll-dates">
      <label><CalendarDays aria-hidden="true" /><span>Month</span>
        <input type="month" className="form-input" value={month} onChange={(e) => onChange({ month: e.target.value, date: "" })} />
      </label>
      <label><span>Day</span>
        <input type="date" className="form-input" value={date} onChange={(e) => onChange({ month: "", date: e.target.value })} />
      </label>
      {(month || date) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ month: "", date: "" })}><X aria-hidden="true" /> Clear dates</button>}
    </div>
  );
}
