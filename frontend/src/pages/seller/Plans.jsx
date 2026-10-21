import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowDown, BarChart3, Check, Clock, Crown, Megaphone, Package, ReceiptText, RefreshCw, ShoppingCart, Sparkles, X } from "lucide-react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { planService } from "../../services/api.js";
import "./Plans.css";

const FEATURE_PITCH = {
  analytics: ["Product analytics is a Premium feature", "See revenue trends, your best sellers and counter sales in one place."],
  pos: ["The point of sale is a Premium feature", "Record cash sales at your stall and print receipts for buyers."],
};
const dateLabel = (value) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
const STATUS_LABELS = { pending: "Waiting for review", approved: "Approved", declined: "Not approved", cancelled: "Cancelled" };
const apiError = (err, fallback) => err.response?.data?.details?.[0]?.message || err.response?.data?.error || fallback;

/** Free vs Premium, the seller's usage, and the Premium request form. */
export default function Plans() {
  const { updateUser } = useAuth();
  const [params] = useSearchParams();
  const feature = params.get("feature");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ note: "", payment_reference: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: overview } = await planService.getMy(feature);
      setData(overview);
      // Keep the sidebar's PRO badges in step with the real plan.
      if (overview.stall) updateUser({ stall_plan: { tier: overview.stall.tier, premium_until: overview.stall.premium_until } });
    } catch (err) {
      toast.error(apiError(err, "Couldn't load your plan"));
    } finally {
      setLoading(false);
    }
  }, [feature, updateUser]);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await planService.request({ note: form.note.trim(), payment_reference: form.payment_reference.trim() || undefined });
      toast.success("Request sent. An administrator will review it.");
      setForm({ note: "", payment_reference: "" });
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't send your request"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel your Premium request?")) return;
    try {
      await planService.cancel();
      toast.success("Request cancelled");
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't cancel"));
    }
  };

  const stall = data?.stall;
  const isPremium = stall?.tier === "premium";
  const plan = stall?.plan || data?.plans?.free;
  const limit = plan?.listing_limit || 5;
  const used = data?.listings || 0;
  const renewWindow = isPremium && stall.premium_until && Date.parse(stall.premium_until) - Date.now() < 30 * 86400000;
  const canRequest = stall && stall.status === "approved" && !data.pending && (!isPremium || renewWindow);
  const pitch = FEATURE_PITCH[feature];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar pl-topbar">
          <div className="topbar-titles">
            <h1>Plans & Premium</h1>
            <p>Grow your stall with more listings, analytics and the point of sale.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button>
        </header>

        <div className="dashboard-content pl-content">
          {loading && !data ? <SkeletonBlock height={160} /> : !stall ? (
            <section className="pl-card"><p>Open your stall first — plans apply to a stall.</p></section>
          ) : (
            <section className={`pl-current ${isPremium ? "is-premium" : ""}`} aria-label="Your plan">
              <span className="pl-current-icon" aria-hidden="true">{isPremium ? <Crown /> : <Package />}</span>
              <div>
                <p className="cm-eyebrow">Your plan</p>
                <h2>{isPremium ? "Premium" : "Free"}{stall.name ? <small> · {stall.name}</small> : null}</h2>
                <p className="pl-muted">
                  {isPremium
                    ? stall.premium_until ? `Premium until ${dateLabel(stall.premium_until)}.` : "Premium with no end date."
                    : "Upgrade any time — your products and orders stay as they are."}
                </p>
              </div>
              <div className="pl-meter" aria-label={`${used} of ${limit} listings used`}>
                <span><strong>{used}</strong> / {limit} listings used</span>
                <i><b style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} className={used >= limit ? "is-full" : ""} /></i>
              </div>
              {pitch && !isPremium && (
                <p className="pl-pitch" role="status"><Sparkles aria-hidden="true" /><span><strong>{pitch[0]}.</strong> {pitch[1]}</span></p>
              )}
            </section>
          )}

          <div className="pl-compare">
            <PlanCard
              name="Free" price="₱0" current={stall && !isPremium}
              blurb="Everything you need to start selling."
              items={[
                [`${data?.plans?.free.listing_limit || 5} product listings`, Package],
                ["Online orders, pickup and delivery"],
                ["Messages and your stall page"],
              ]}
            />
            <PlanCard
              featured name="Premium" price={data?.price || "Ask the admin office"} current={isPremium}
              blurb="Everything in Free, plus:"
              items={[
                [`${data?.plans?.premium.listing_limit || 25} product listings`, Package],
                ["Product analytics: revenue trend and best sellers", BarChart3],
                ["Point of sale with printed receipts", ShoppingCart],
                [`Feature ${data?.plans?.premium.featured_limit || 3} products on the buyer home page`, Megaphone],
              ]}
              action={canRequest ? <a href="#pl-request" className="btn btn-primary pl-plan-cta">{renewWindow ? "Renew Premium" : "Request Premium"} <ArrowDown aria-hidden="true" /></a>
                : data?.pending ? <span className="pl-plan-note"><Clock aria-hidden="true" /> Request waiting for review</span> : null}
            />
          </div>

          {data?.pending ? (
            <section className="pl-card pl-pending" aria-label="Your request">
              <Clock aria-hidden="true" />
              <div>
                <strong>Premium request waiting for review</strong>
                <p className="pl-muted">Sent {dateLabel(data.pending.created_at)}. You&apos;ll get a notification when an administrator decides.</p>
                {data.pending.note && <p>“{data.pending.note}”</p>}
                {data.pending.payment_reference && <p className="pl-muted"><ReceiptText aria-hidden="true" /> Payment reference: <strong>{data.pending.payment_reference}</strong></p>}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}><X aria-hidden="true" /> Cancel request</button>
            </section>
          ) : canRequest ? (
            <section id="pl-request" className="pl-card pl-request" aria-labelledby="pl-request-title">
              <div className="pl-steps">
                <h2 id="pl-request-title"><Crown aria-hidden="true" /> {renewWindow ? "Renew Premium" : "How upgrading works"}</h2>
                <ol>
                  <li><b>1</b><span><strong>Send a request</strong>Add a note if you like, e.g. a fair you're joining.</span></li>
                  <li><b>2</b><span><strong>Pay the admin office</strong>Add the GCash or receipt number so they can match it.</span></li>
                  <li><b>3</b><span><strong>Premium switches on</strong>You'll get a notification once it's approved.</span></li>
                </ol>
                {data.payment_info && <p className="pl-payinfo">{data.payment_info}</p>}
              </div>
              <form className="pl-form" onSubmit={submit}>
                <label className="form-group">
                  <span className="form-label">Note to the administrator <small className="pl-muted">optional</small></span>
                  <textarea className="form-input" rows={3} maxLength={500} placeholder="e.g. We're joining the food fair and need more listings."
                    value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </label>
                <label className="form-group">
                  <span className="form-label">Payment reference <small className="pl-muted">optional</small></span>
                  <input className="form-input" maxLength={100} placeholder="GCash ref. no. or official receipt no."
                    value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} />
                </label>
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy}><Sparkles aria-hidden="true" /> {busy ? "Sending…" : renewWindow ? "Request renewal" : "Request Premium"}</button>
              </form>
            </section>
          ) : stall && stall.status !== "approved" ? (
            <section className="pl-card"><p className="pl-muted">You can request Premium once your stall is approved.</p></section>
          ) : null}

          {data?.history?.some((item) => item.status !== "pending") && (
            <section className="pl-card" aria-labelledby="pl-history">
              <h2 id="pl-history" className="pl-h3">Past requests</h2>
              <ul className="pl-history">
                {data.history.filter((item) => item.status !== "pending").map((item) => (
                  <li key={item.id}>
                    <span className={`pl-status pl-status--${item.status}`}>{STATUS_LABELS[item.status]}</span>
                    <span className="pl-muted">{dateLabel(item.created_at)}</span>
                    {item.review_note && <p>{item.review_note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function PlanCard({ name, price, blurb, items, featured = false, current = false, action = null }) {
  const isAmount = /^₱/.test(String(price));
  return (
    <section className={`pl-plan ${featured ? "is-featured" : ""}`} aria-label={`${name} plan`}>
      {featured && <span className="pl-ribbon"><Crown aria-hidden="true" /> Recommended</span>}
      <div className="pl-plan-head">
        <h2>{name}</h2>
        {current && <span className="pl-current-tag">Current plan</span>}
      </div>
      <p className={`pl-price ${isAmount ? "" : "is-text"}`}>{price}</p>
      {blurb && <p className="pl-plan-blurb">{blurb}</p>}
      <ul>
        {items.map(([text, Icon]) => (
          <li key={text}>
            {Icon ? <Icon aria-hidden="true" /> : <Check aria-hidden="true" />}
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {action && !current && <div className="pl-plan-action">{action}</div>}
    </section>
  );
}
