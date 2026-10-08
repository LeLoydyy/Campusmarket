import "./AdminWorkspace.css";
import "./ManageUsers.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { BadgeCheck, IdCard, Pencil, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, UserCheck, UserX, X } from "lucide-react";
import Sidebar from "../../components/common/Sidebar.jsx";
import AdminDrawer, { DateFilters, Pager, RemoveAccountDrawer } from "../../components/admin/AdminDrawer.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { FilterChip, StatusChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminService } from "../../services/api.js";
import { can, formatDateTime } from "../../utils/adminAccess.js";

const ROLES = ["all", "buyer", "seller", "admin"];
const STATUSES = [
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Needs correction" },
  { value: "all", label: "Everyone" },
  { value: "removed", label: "Removed" },
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

/** Admin edit of a user's details (privilege: edit). */
function EditDrawer({ user, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", campus_id: user.campus_id || "", affiliation: user.affiliation || "student", department: user.department || "" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const changed = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]).filter(([key, value]) => value && value !== (user[key] || "")));
    if (!Object.keys(changed).length) return onClose();
    onSubmit(changed);
  };
  return (
    <AdminDrawer eyebrow="Edit account" title={user.name} subtitle={user.email} labelId="edit-title" avatar={user.name?.charAt(0).toUpperCase()} onClose={onClose}
      footer={<>
        <button type="submit" form="edit-user" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
      </>}>
      <form id="edit-user" className="ma-form" onSubmit={submit}>
        <div className="form-group"><label className="form-label" htmlFor="eu-name">Full name</label>
          <input id="eu-name" className="form-input" required minLength={2} maxLength={80} value={form.name} onChange={set("name")} /></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-email">Email</label>
          <input id="eu-email" type="email" className="form-input" required value={form.email} onChange={set("email")} /></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-id">CSUCC ID number</label>
          <input id="eu-id" className="form-input" minLength={3} maxLength={50} value={form.campus_id} onChange={set("campus_id")} /></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-aff">Affiliation</label>
          <select id="eu-aff" className="form-input form-select" value={form.affiliation} onChange={set("affiliation")}>
            <option value="student">Student</option><option value="faculty">Faculty</option><option value="employee">Employee</option>
          </select></div>
        <div className="form-group"><label className="form-label" htmlFor="eu-dept">College / program / office</label>
          <input id="eu-dept" className="form-input" minLength={2} maxLength={120} value={form.department} onChange={set("department")} /></div>
      </form>
      <p className="ma-help">Changes are recorded in Admin activity.</p>
    </AdminDrawer>
  );
}

/** Complete record of a removed account, with why it was removed. */
function RemovedDrawer({ user, canRestore, busy, onClose, onRestore }) {
  return (
    <AdminDrawer eyebrow="Removed account" title={user.name} subtitle={user.email} labelId="removed-title" avatar={user.name?.charAt(0).toUpperCase()} onClose={onClose}
      footer={<>
        {canRestore && <button type="button" className="btn btn-primary" disabled={busy} onClick={onRestore}><RotateCcw aria-hidden="true" /> {busy ? "Restoring…" : "Restore account"}</button>}
        <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
      </>}>
      <p className="mu-prev-note"><strong>Reason:</strong> {user.delete_reason}</p>
      <dl className="mu-facts">
        <div><dt>Removed</dt><dd>{formatDateTime(user.deleted_at)}</dd></div>
        <div><dt>Role</dt><dd>{cap(user.role)}</dd></div>
        <div><dt><IdCard aria-hidden="true" /> ID number</dt><dd className="mu-id">{user.campus_id || "—"}</dd></div>
        {user.username && <div><dt>Username</dt><dd>{user.username}</dd></div>}
        <div><dt>Affiliation</dt><dd>{cap(user.affiliation) || "—"}</dd></div>
        <div><dt>College / program / office</dt><dd>{user.department || "—"}</dd></div>
        <div><dt>Registration status</dt><dd>{cap(user.status)}</dd></div>
        <div><dt>Registered</dt><dd>{formatDateTime(user.created_at)}</dd></div>
        <div><dt>Last sign-in</dt><dd>{formatDateTime(user.last_login_at)}</dd></div>
      </dl>
    </AdminDrawer>
  );
}

export default function ManageUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("pending");
  const [dates, setDates] = useState({ month: "", date: "" });
  const [page, setPage] = useState(1);
  const [banningId, setBanningId] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [viewingRemoved, setViewingRemoved] = useState(null);
  const [busy, setBusy] = useState(false);
  const removedView = status === "removed";

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE, q: search, month: dates.month || undefined, date: dates.date || undefined };
    if (status !== "all") params.status = status;
    if (role !== "all") params.role = role;
    adminService.getUsers(params)
      .then(({ data }) => { setUsers(data.data || []); setTotal(data.total || 0); })
      .catch(() => toast.error("Couldn't load users"))
      .finally(() => setLoading(false));
  }, [page, search, role, status, dates]);
  useEffect(fetchUsers, [fetchUsers]);

  /** Runs one admin action with a toast either way; resolves true on success. */
  const act = async (fn, success, failure) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.details?.[0]?.message || error.response?.data?.error || failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleBan = async (user) => {
    const action = user.is_banned ? "unblock" : "block";
    if (!window.confirm(user.is_banned ? `Unblock ${user.name}?` : `Block ${user.name}? They'll be signed out and can't sign in until unblocked.`)) return;
    try {
      setBanningId(user.id);
      const { data } = await adminService.banUser(user.id, !user.is_banned);
      setUsers((items) => items.map((item) => (item.id === user.id ? { ...item, is_banned: data.is_banned } : item)));
      toast.success(`${user.name} ${action}ed`);
    } catch (error) {
      toast.error(error.response?.data?.error || `Couldn't ${action} this user`);
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

  const saveEdit = async (changes) => {
    if (await act(() => adminService.updateUser(editing.id, changes), `${editing.name} updated`, "Couldn't save the changes")) {
      setEditing(null);
      fetchUsers();
    }
  };
  const remove = async (reason) => {
    if (await act(() => adminService.removeUser(removing.id, reason), `${removing.name} removed`, "Couldn't remove this account")) {
      setRemoving(null);
      fetchUsers();
    }
  };
  const restore = async () => {
    if (await act(() => adminService.restoreUser(viewingRemoved.id), `${viewingRemoved.name} restored`, "Couldn't restore this account")) {
      setViewingRemoved(null);
      fetchUsers();
    }
  };

  const filtered = search || role !== "all" || dates.month || dates.date;

  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar mu-topbar">
          <div className="topbar-titles">
            <h1>Registration & users</h1>
            <p>Approve new CSUCC accounts, and edit, block or remove anyone on the platform.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={fetchUsers} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button>
        </header>

        <div className="dashboard-content mu-content">
          <div className="mu-toolbar">
            <label className="mu-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search by name, email or ID number</span>
              <input type="search" placeholder="Search name, email or ID number" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </label>
            <DateFilters month={dates.month} date={dates.date} onChange={(next) => { setDates(next); setPage(1); }} />
          </div>
          <div className="mu-toolbar">
            <div className="mu-pills" role="group" aria-label="Registration status">
              {STATUSES.map((item) => <FilterChip key={item.value} active={status === item.value} onClick={() => { setStatus(item.value); setPage(1); }}>{item.label}</FilterChip>)}
            </div>
            <div className="mu-pills" role="group" aria-label="Role">
              {ROLES.map((item) => <FilterChip key={item} active={role === item} onClick={() => { setRole(item); setPage(1); }}>{item === "all" ? "All roles" : `${cap(item)}s`}</FilterChip>)}
            </div>
          </div>
          {(dates.month || dates.date) && <p className="ma-help">Showing accounts registered {dates.date ? `on ${dates.date}` : `in ${dates.month}`} (Philippine time).</p>}

          {loading ? (
            <div className="mu-card">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={60} className="mu-skel" />)}</div>
          ) : users.length === 0 ? (
            <EmptyState
              illustration={status === "pending" && !filtered ? "check" : "search"}
              title={removedView ? "No removed accounts" : status === "pending" && !filtered ? "No registrations waiting" : "No users match"}
              description={removedView ? "Accounts you remove are kept here with the reason, and can be restored." : status === "pending" && !filtered ? "Every account has been reviewed. New sign-ups will appear here." : "Try another search, date, status or role."}
              action={!removedView && (status !== "all" || filtered) ? { label: "Show everyone", onClick: () => { setStatus("all"); setRole("all"); setSearch(""); setDates({ month: "", date: "" }); } } : undefined}
            />
          ) : (
            <section className="mu-card" aria-label="Users">
              <div className="mu-table-wrap">
                <table className="mu-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">ID No.</th>
                      <th scope="col">{removedView ? "Removed" : "Registered"}</th><th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isAdmin = user.role === "admin";
                      return (
                        <tr key={user.id} className={user.is_banned ? "is-banned" : ""}>
                          <td>
                            <span className="mu-person">
                              <span className="mu-avatar" aria-hidden="true">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.name?.charAt(0).toUpperCase()}</span>
                              <strong>{user.name}</strong>
                            </span>
                          </td>
                          <td>{user.email}</td>
                          <td><span className={`cm-chip cm-chip--sm mu-role mu-role--${user.role}`}>{cap(user.role)}</span></td>
                          <td>
                            {removedView ? <StatusChip status="banned" label="Removed" />
                              : user.is_banned ? <StatusChip status="banned" label="Blocked" />
                                : <StatusChip status={user.status} label={user.status === "rejected" ? "Needs correction" : undefined} />}
                          </td>
                          <td className="mu-id-cell">{user.campus_id || "—"}</td>
                          <td>{new Date(removedView ? user.deleted_at : user.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
                          <td>
                            <div className="mu-actions">
                              {removedView ? (
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingRemoved(user)}>Details & reason</button>
                              ) : <>
                                {user.status === "pending" && !isAdmin && can(me, "approve") && (
                                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setReview(user)}><UserCheck aria-hidden="true" /> Review</button>
                                )}
                                {isAdmin ? (
                                  can(me, "admins") && <Link to="/admin/admins" className="btn btn-ghost btn-sm">Manage admin</Link>
                                ) : <>
                                  {can(me, "edit") && <button type="button" className="btn btn-ghost btn-sm ma-icon" onClick={() => setEditing(user)} title="Edit" aria-label={`Edit ${user.name}`}><Pencil aria-hidden="true" /></button>}
                                  {can(me, "block") && (
                                    <button type="button" className={`btn btn-sm ${user.is_banned ? "btn-outline" : "btn-ghost mu-ban"}`} onClick={() => toggleBan(user)} disabled={banningId === user.id} aria-label={`${user.is_banned ? "Unblock" : "Block"} ${user.name}`}>
                                      {user.is_banned ? <><UserCheck aria-hidden="true" /> Unblock</> : <><UserX aria-hidden="true" /> Block</>}
                                    </button>
                                  )}
                                  {can(me, "delete") && <button type="button" className="btn btn-ghost btn-sm ma-icon mu-ban" onClick={() => setRemoving(user)} title="Remove" aria-label={`Remove ${user.name}`}><Trash2 aria-hidden="true" /></button>}
                                </>}
                              </>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage} noun="user" />
            </section>
          )}
        </div>
      </main>
      {review && <ReviewDrawer user={review} busy={reviewing} onClose={() => setReview(null)} onSubmit={submitReview} />}
      {editing && <EditDrawer user={editing} busy={busy} onClose={() => setEditing(null)} onSubmit={saveEdit} />}
      {removing && <RemoveAccountDrawer account={removing} busy={busy} onClose={() => setRemoving(null)} onConfirm={remove} />}
      {viewingRemoved && <RemovedDrawer user={viewingRemoved} canRestore={can(me, "delete")} busy={busy} onClose={() => setViewingRemoved(null)} onRestore={restore} />}
    </div>
  );
}
