import "./AdminWorkspace.css";
import "./AdminApplications.css";
import { useState, useEffect } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import eventService from "../../services/eventService.js";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { FiCalendar, FiCheck, FiClock, FiMail, FiMap, FiPhone, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];
const CATEGORY_LABELS = { food: "Food stall", merchandise: "Merchandise", "mixed-use": "Mixed-use" };
const MIN_NOTE = 5;
// One-tap starting points for the note the seller receives.
const NOTE_IDEAS = {
  approved: ["Your space is assigned on the stall map.", "Please set up 1 hour before the event starts."],
  rejected: ["All stall spaces for this event are taken.", "Your products don't match this event's theme."],
};

const statusOf = (application) => String(application.status || "pending").toLowerCase();
const eventDate = (application) => (application.event?.date ? format(new Date(`${application.event.date}T00:00:00`), "EEE, MMM d, yyyy") : null);

function ContactLink({ value }) {
  const text = String(value || "").trim();
  if (!text) return <span>—</span>;
  if (text.includes("@")) return <a href={`mailto:${text}`}><FiMail aria-hidden="true" /> {text}</a>;
  if (/^[\d\s+()-]{7,}$/.test(text)) return <a href={`tel:${text.replace(/[^\d+]/g, "")}`}><FiPhone aria-hidden="true" /> {text}</a>;
  return <span>{text}</span>;
}

function ApplicationCard({ application, busy, onReview }) {
  const status = statusOf(application);
  const [decision, setDecision] = useState(null); // "approved" | "rejected" while the note box is open
  const [note, setNote] = useState("");
  const date = eventDate(application);

  const open = (next) => { setDecision(next); setNote(""); };
  const submit = async (event) => {
    event.preventDefault();
    if (note.trim().length < MIN_NOTE) return toast.error(`Write a note of at least ${MIN_NOTE} characters.`);
    if (await onReview(application, decision, note.trim())) setDecision(null);
  };

  return (
    <article className={`aa-card is-${status}`}>
      <header className="aa-card-head">
        <span className="aa-avatar" aria-hidden="true">{(application.stall_name || "S").charAt(0).toUpperCase()}</span>
        <div className="aa-card-title">
          <h2>{application.stall_name}</h2>
          <p>{application.business_name !== application.stall_name ? `${application.business_name} · ` : ""}by {application.seller_name || "Campus seller"}</p>
        </div>
        <span className={`aa-status aa-status--${status}`}>{status}</span>
      </header>

      <div className="aa-event">
        <FiCalendar aria-hidden="true" />
        <div>
          <strong>{application.event?.name || "Event removed"}</strong>
          {date && <small>{date}</small>}
        </div>
      </div>

      <dl className="aa-facts">
        <div><dt>Category</dt><dd>{CATEGORY_LABELS[application.product_category] || application.product_category}</dd></div>
        <div><dt>Spot</dt><dd>{application.preferred_space_number
          ? `Space ${application.preferred_space_number}${application.preferred_space_size ? ` · ${application.preferred_space_size}` : ""}`
          : application.preferred_stall_size ? `${application.preferred_stall_size} m² requested` : "Not chosen (no map yet)"}</dd></div>
        {Number(application.duration) > 0 && <div><dt>Duration</dt><dd>{application.duration} {Number(application.duration) === 1 ? "day" : "days"}</dd></div>}
      </dl>

      <div className="aa-section">
        <span>Products</span>
        <p className="aa-products">{application.product_list}</p>
      </div>

      <div className="aa-meta">
        <ContactLink value={application.contact_info} />
        <span className="aa-applied"><FiClock aria-hidden="true" /> Applied {format(new Date(application.created_at), "MMM d, yyyy")}</span>
      </div>

      {application.review_note && (
        <p className={`aa-review-note is-${status}`}><strong>{status === "rejected" ? "Reason" : "Note to seller"}</strong>{application.review_note}</p>
      )}

      {status === "approved" && application.event_id && (
        <Link to={`/admin/events/${application.event_id}/map`} className="btn btn-outline btn-sm aa-map-link"><FiMap aria-hidden="true" /> Place on stall map</Link>
      )}

      {status === "pending" && (decision ? (
        <form className={`aa-decide is-${decision}`} onSubmit={submit}>
          <label htmlFor={`aa-note-${application.id}`}>
            {decision === "approved" ? "Note for the seller (assigned space, setup time…)" : "Reason for rejecting (the seller sees this)"}
          </label>
          <textarea id={`aa-note-${application.id}`} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <div className="aa-ideas">
            {NOTE_IDEAS[decision].map((idea) => (
              <button key={idea} type="button" onClick={() => setNote(idea)}>{idea}</button>
            ))}
          </div>
          <div className="aa-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDecision(null)} disabled={busy}>Back</button>
            <button type="submit" className={`btn btn-sm ${decision === "approved" ? "btn-primary" : "btn-danger"}`} disabled={busy || note.trim().length < MIN_NOTE}>
              {busy ? "Saving…" : decision === "approved" ? <><FiCheck aria-hidden="true" /> Confirm approval</> : <><FiX aria-hidden="true" /> Confirm rejection</>}
            </button>
          </div>
        </form>
      ) : (
        <div className="aa-actions">
          <button type="button" className="btn btn-outline btn-sm aa-reject" onClick={() => open("rejected")} disabled={busy}><FiX aria-hidden="true" /> Reject</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => open("approved")} disabled={busy}><FiCheck aria-hidden="true" /> Approve</button>
        </div>
      ))}
    </article>
  );
}

export default function AdminApplications() {
  const [applications, setApplications] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const { data } = await eventService.getApplications();
      setApplications(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  /** Returns true when the review was saved, so the card can close its note box. */
  const handleReview = async (application, status, note) => {
    try {
      setActingId(application.id);
      const { data } = await eventService.reviewApplication(application.id, { status, note });
      setApplications((prev) => prev.map((item) => (item.id === application.id ? { ...item, ...data } : item)));
      toast.success(status === "approved" ? "Application approved" : "Application rejected");
      return true;
    } catch (error) {
      toast.error(error.response?.data?.error || "Review failed");
      return false;
    } finally {
      setActingId(null);
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = applications.filter((application) => {
    const matchTab = activeTab === "all" || statusOf(application) === activeTab;
    const haystack = `${application.stall_name} ${application.business_name} ${application.seller_name || ""} ${application.event?.name || ""}`.toLowerCase();
    return matchTab && (!query || haystack.includes(query));
  });
  const tabCount = (tab) => (tab === "all" ? applications.length : applications.filter((item) => statusOf(item) === tab).length);

  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Event Applications</h1>
              <p>Review sellers who applied for a stall at a campus event.</p>
            </div>
          </div>
          <div className="topbar-right">
            <button type="button" className="btn btn-outline btn-sm" onClick={fetchApplications} disabled={loading}>
              <FiRefreshCw size={14} className={loading ? "spin" : ""} /> <span className="cm-btn-label">Refresh</span>
            </button>
          </div>
        </div>

        <div className="dashboard-content aa-content">
          <section className="aa-toolbar" aria-label="Filter applications">
            <div className="aa-tabs" role="group" aria-label="Status">
              {STATUS_TABS.map((tab) => (
                <button key={tab.key} type="button" className={activeTab === tab.key ? "is-active" : ""} aria-pressed={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
                  {tab.label} <span>{tabCount(tab.key)}</span>
                </button>
              ))}
            </div>
            <label className="aa-search">
              <FiSearch aria-hidden="true" />
              <span className="sr-only">Search applications</span>
              <input type="search" placeholder="Search stall, seller or event" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </section>

          {loading ? (
            <div className="aa-grid">{[1, 2, 3].map((i) => <SkeletonBlock key={i} height={300} />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              compact
              illustration={query ? "search" : "check"}
              title={query ? "No applications match" : activeTab === "pending" ? "You're all caught up" : `No ${activeTab === "all" ? "" : activeTab} applications`}
              description={query ? "Try another stall, seller or event name." : activeTab === "pending" ? "New stall applications for campus events will show up here." : "Applications appear here once sellers apply for an event."}
              action={query ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
            />
          ) : (
            <div className="aa-grid">
              {filtered.map((application) => (
                <ApplicationCard key={application.id} application={application} busy={actingId === application.id} onReview={handleReview} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
