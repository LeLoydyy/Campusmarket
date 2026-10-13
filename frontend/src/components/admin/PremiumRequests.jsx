import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, Crown, ReceiptText, X } from "lucide-react";
import AdminDrawer from "./AdminDrawer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminService } from "../../services/api.js";
import { can, formatDateTime } from "../../utils/adminAccess.js";
import "./PremiumRequests.css";

const apiError = (err, fallback) => err.response?.data?.details?.[0]?.message || err.response?.data?.error || fallback;
/** Default end date: about one semester (5 months) from today, as YYYY-MM-DD. */
const semesterFromNow = () => { const d = new Date(); d.setMonth(d.getMonth() + 5); return d.toISOString().slice(0, 10); };

/** Approve (with an optional end date) or decline one request. */
function ReviewDrawer({ request, busy, onClose, onSubmit }) {
  const [until, setUntil] = useState(semesterFromNow);
  const [noEnd, setNoEnd] = useState(false);
  const [note, setNote] = useState("");
  return (
    <AdminDrawer eyebrow="Premium request" title={request.stall_name} subtitle={`${request.seller_name} · ${request.seller_email}`} labelId="pr-title"
      avatar={<Crown aria-hidden="true" />} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onSubmit("approved", note.trim(), noEnd ? null : until)}><Check aria-hidden="true" /> Approve</button>
        <button type="button" className="btn btn-danger" disabled={busy || note.trim().length < 5} onClick={() => onSubmit("declined", note.trim(), null)}><X aria-hidden="true" /> Decline</button>
      </>}>
      <dl className="mu-facts">
        <div><dt>Requested</dt><dd>{formatDateTime(request.created_at)}</dd></div>
        <div><dt>Listings now</dt><dd>{request.listings} (Free allows 5)</dd></div>
        <div><dt>Seller ID number</dt><dd className="mu-id">{request.seller_id_no || "—"}</dd></div>
        <div><dt><ReceiptText aria-hidden="true" /> Payment reference</dt><dd>{request.payment_reference || "None given"}</dd></div>
        {request.note && <div><dt>Seller&apos;s note</dt><dd style={{ fontWeight: 500 }}>{request.note}</dd></div>}
      </dl>
      <fieldset className="ma-fieldset">
        <legend>Premium until</legend>
        <label className="pr-until">
          <input type="date" className="form-input" value={until} min={new Date().toISOString().slice(0, 10)} disabled={noEnd} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label className="mu-check"><input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} /><span>No end date</span></label>
        <p className="ma-help">On the end date the stall goes back to Free automatically, and the seller is told.</p>
      </fieldset>
      <label className="mu-note">
        <span>Note to the seller <small>(needed to decline)</small></span>
        <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Payment received, thank you! — or why it can't be approved yet." />
      </label>
    </AdminDrawer>
  );
}

const TABS = [["pending", "Pending"], ["all", "All"], ["approved", "Approved"], ["declined", "Declined"]];
const STATUS_LABEL = { pending: "Pending", approved: "Approved", declined: "Declined", cancelled: "Cancelled by seller" };
const formatDay = (value) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/** Premium requests at the top of Stores & Plans: the pending queue plus past decisions. */
export default function PremiumRequests({ onChanged }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, pending] = await Promise.all([
        adminService.getPlanRequests(tab),
        tab === "pending" ? null : adminService.getPlanRequests("pending"),
      ]);
      setRequests(data);
      setPendingCount((pending?.data ?? data).length);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const submit = async (decision, note, premium_until) => {
    setBusy(true);
    try {
      await adminService.reviewPlanRequest(reviewing.id, { decision, note, premium_until });
      toast.success(decision === "approved" ? `${reviewing.stall_name} is now Premium` : "Request declined");
      setReviewing(null);
      load();
      onChanged?.();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save the decision"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="premium-requests" className={`pr-panel${pendingCount ? "" : " is-quiet"}`} aria-labelledby="pr-heading">
      <header>
        <Crown aria-hidden="true" />
        <h2 id="pr-heading">Premium requests {pendingCount > 0 && <span>{pendingCount}</span>}</h2>
        <div className="pr-tabs" role="tablist" aria-label="Request status">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      </header>
      {loading ? (
        <p className="pr-empty" role="status">Loading requests…</p>
      ) : !requests.length ? (
        <p className="pr-empty">{tab === "pending" ? "No sellers are waiting for Premium right now." : `No ${tab === "all" ? "" : `${tab} `}requests yet.`}</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li key={request.id}>
              <div>
                <strong>{request.stall_name}</strong>
                <small>{request.seller_name} · requested {formatDateTime(request.created_at)}{request.payment_reference ? ` · Ref: ${request.payment_reference}` : ""}</small>
                {request.note && <p>“{request.note}”</p>}
                {request.status !== "pending" && (
                  <small className="pr-decision">
                    {request.reviewed_at ? `${STATUS_LABEL[request.status]} ${formatDateTime(request.reviewed_at)}` : STATUS_LABEL[request.status]}
                    {request.reviewer_name ? ` by ${request.reviewer_name}` : ""}
                    {request.status === "approved" ? (request.premium_until ? ` · until ${formatDay(request.premium_until)}` : " · no end date") : ""}
                    {request.review_note ? ` — “${request.review_note}”` : ""}
                  </small>
                )}
              </div>
              {request.status === "pending"
                ? can(user, "marketplace") && <button type="button" className="btn btn-primary btn-sm" onClick={() => setReviewing(request)}>Review</button>
                : <span className={`pr-status is-${request.status}`}>{STATUS_LABEL[request.status]}</span>}
            </li>
          ))}
        </ul>
      )}
      {reviewing && <ReviewDrawer request={reviewing} busy={busy} onClose={() => setReviewing(null)} onSubmit={submit} />}
    </section>
  );
}
