import "./AdminWorkspace.css";
import "./ManageUsers.css";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { BadgeCheck, IdCard, RefreshCw, Search, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import Sidebar from "../../components/common/Sidebar.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { FilterChip, StatusChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { adminService } from "../../services/api.js";
import { plural } from "../../utils/marketplace.js";

const ROLES = ["all", "buyer", "seller", "admin"];
const STATUSES = [
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Needs correction" },
  { value: "all", label: "Everyone" },
];
const PAGE_SIZE = 20;
const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : "");

/** Side drawer for checking a registration against CSUCC records. */
function ReviewDrawer({ user, onClose, onSubmit, busy }) {
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("button, input, textarea")?.focus();
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus?.(); };
  }, [onClose]);
  const noteOk = note.trim().length >= 5;
  return (
    <div className="mu-drawer-layer" role="presentation" onClick={onClose}>
      <aside ref={panel} className="mu-drawer" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}>
        <header className="mu-drawer-head">
          <span className="mu-avatar mu-avatar--lg" aria-hidden="true">{user.name?.charAt(0).toUpperCase()}</span>
          <div>
            <p className="cm-eyebrow">Review credentials</p>
            <h2 id="review-title">{user.name}</h2>
            <p>{user.email}</p>
          </div>
          <button type="button" className="mu-drawer-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </header>

        <dl className="mu-facts">
          <div><dt><IdCard aria-hidden="true" /> CSUCC ID number</dt><dd className={user.campus_id ? "mu-id" : "mu-missing"}>{user.campus_id || "Not provided"}</dd></div>
          <div><dt>Affiliation</dt><dd>{cap(user.affiliation) || <span className="mu-missing">Not provided</span>}</dd></div>
          <div><dt>College / program / office</dt><dd>{user.department || <span className="mu-missing">Not provided</span>}</dd></div>
          <div><dt>Wants to</dt><dd>{user.role === "seller" ? "Sell (and buy)" : "Buy"}</dd></div>
          <div><dt>Registered</dt><dd>{new Date(user.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</dd></div>
        </dl>

        {user.review_note && <p className="mu-prev-note"><strong>Previous note:</strong> {user.review_note}</p>}

        <div className="mu-verify">
          <p><ShieldCheck aria-hidden="true" /> Check the ID number and name against official CSUCC enrollment or personnel records before approving.</p>
          <label className="mu-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I verified the ID, name and current CSUCC membership.</span>
          </label>
          <label className="mu-note">
            <span>Note to the user <small>(required, 5+ characters)</small></span>
            <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How you verified, or what they need to correct." />
          </label>
        </div>

        <footer className="mu-drawer-actions">
          <button type="button" className="btn btn-primary" disabled={busy || !checked || !user.campus_id || !noteOk} onClick={() => onSubmit("approved", note, checked)}>
            <BadgeCheck aria-hidden="true" /> Approve
          </button>
          <button type="button" className="btn btn-danger" disabled={busy || !noteOk} onClick={() => onSubmit("rejected", note, checked)}>
            Request correction
          </button>
          {!user.campus_id && <p className="mu-hint">Approval needs an ID number — ask for a correction instead.</p>}
        </footer>
      </aside>
    </div>
  );
}

export default function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [banningId, setBanningId] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE, q: search };
    if (status !== "all") params.status = status;
    if (role !== "all") params.role = role;
    adminService.getUsers(params)
      .then(({ data }) => { setUsers(data.data || []); setTotal(data.total || 0); })
      .catch(() => toast.error("Couldn't load users"))
      .finally(() => setLoading(false));
  }, [page, search, role, status]);
  useEffect(fetchUsers, [fetchUsers]);

  const toggleBan = async (user) => {
    const action = user.is_banned ? "unban" : "ban";
    if (!window.confirm(`${cap(action)} ${user.name}?`)) return;
    try {
      setBanningId(user.id);
      const { data } = await adminService.banUser(user.id, !user.is_banned);
      setUsers((items) => items.map((item) => (item.id === user.id ? { ...item, is_banned: data.is_banned } : item)));
      toast.success(`${user.name} ${action}ned`);
    } catch {
      toast.error(`Couldn't ${action} this user`);
    } finally {
      setBanningId(null);
    }
  };

  const submitReview = async (decision, note, checked) => {
    setReviewing(true);
    try {
      await adminService.reviewUser(review.id, { status: decision, note: note.trim(), credentials_checked: checked });
      toast.success(decision === "approved" ? `${review.name} approved` : `Correction requested from ${review.name}`);
      setReview(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.error || "Review failed");
    } finally {
      setReviewing(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar mu-topbar">
          <div className="topbar-titles">
            <h1>Registration & users</h1>
            <p>Verify new CSUCC accounts and manage everyone on the platform.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={fetchUsers} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button>
        </header>

        <div className="dashboard-content mu-content">
          <div className="mu-toolbar">
            <label className="mu-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search by name or email</span>
              <input type="search" placeholder="Search name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </label>
            <div className="mu-pills" role="group" aria-label="Registration status">
              {STATUSES.map((item) => <FilterChip key={item.value} active={status === item.value} onClick={() => { setStatus(item.value); setPage(1); }}>{item.label}</FilterChip>)}
            </div>
            <div className="mu-pills" role="group" aria-label="Role">
              {ROLES.map((item) => <FilterChip key={item} active={role === item} onClick={() => { setRole(item); setPage(1); }}>{item === "all" ? "All roles" : `${cap(item)}s`}</FilterChip>)}
            </div>
          </div>

          {loading ? (
            <div className="mu-card">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={60} className="mu-skel" />)}</div>
          ) : users.length === 0 ? (
            <EmptyState
              illustration={status === "pending" ? "check" : "search"}
              title={status === "pending" && !search ? "No registrations waiting" : "No users match"}
              description={status === "pending" && !search ? "Every account has been reviewed. New sign-ups will appear here." : "Try another search, status or role."}
              action={status !== "all" || search || role !== "all" ? { label: "Show everyone", onClick: () => { setStatus("all"); setRole("all"); setSearch(""); } } : undefined}
            />
          ) : (
            <section className="mu-card" aria-label="Users">
              <div className="mu-table-wrap">
                <table className="mu-table">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">CSUCC ID</th><th scope="col">Joined</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className={user.is_banned ? "is-banned" : ""}>
                        <td>
                          <span className="mu-person">
                            <span className="mu-avatar" aria-hidden="true">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.name?.charAt(0).toUpperCase()}</span>
                            <strong>{user.name}</strong>
                          </span>
                        </td>
                        <td>{user.email}</td>
                        <td><span className={`cm-chip cm-chip--sm mu-role mu-role--${user.role}`}>{cap(user.role)}</span></td>
                        <td>{user.is_banned ? <StatusChip status="banned" label="Banned" /> : <StatusChip status={user.status} label={user.status === "rejected" ? "Needs correction" : undefined} />}</td>
                        <td className="mu-id-cell">{user.campus_id || "—"}</td>
                        <td>{new Date(user.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td>
                          <div className="mu-actions">
                            {user.status === "pending" && user.role !== "admin" && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => setReview(user)}><UserCheck aria-hidden="true" /> Review credentials</button>
                            )}
                            {user.role !== "admin" && (
                              <button type="button" className={`btn btn-sm ${user.is_banned ? "btn-outline" : "btn-ghost mu-ban"}`} onClick={() => toggleBan(user)} disabled={banningId === user.id} aria-label={`${user.is_banned ? "Unban" : "Ban"} ${user.name}`}>
                                {user.is_banned ? <><UserCheck aria-hidden="true" /> Unban</> : <><UserX aria-hidden="true" /> Ban</>}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="mu-footer">
                <p>{plural(total, "user")} · page {page} of {pages}</p>
                <div>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
                </div>
              </footer>
            </section>
          )}
        </div>
      </main>
      {review && <ReviewDrawer user={review} busy={reviewing} onClose={() => setReview(null)} onSubmit={submitReview} />}
    </div>
  );
}
