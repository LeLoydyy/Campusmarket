import "./AdminWorkspace.css";
import "./ManageUsers.css";
import "./ManageAdmins.css";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Search } from "lucide-react";
import Sidebar from "../../components/common/Sidebar.jsx";
import Navbar from "../../components/common/Navbar.jsx";
import { DateFilters, Pager } from "../../components/admin/AdminDrawer.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { FilterChip, StatusChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminService, authService } from "../../services/api.js";
import { can, formatDateTime } from "../../utils/adminAccess.js";

const PAGE_SIZE = 15;
const ROLES = ["all", "admin", "seller", "buyer"];
const cap = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : "");

// How a sign-in ended. No time out yet = still signed in (or the browser was closed without signing out).
const ENDINGS = {
  logout: ["closed", "Signed out"],
  shift_ended: ["pending", "Shift ended"],
  shift_changed: ["pending", "Shift changed"],
  blocked: ["banned", "Blocked"],
  removed: ["banned", "Removed"],
  password_reset: ["pending", "Password reset"],
  password_changed: ["pending", "Password changed"],
  signed_out_by_admin: ["banned", "Signed out by admin"],
};

const duration = (from, to) => {
  if (!to) return "—";
  const minutes = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const ACTIONS = {
  "admin.created": "Created administrator",
  "admin.updated": "Edited administrator",
  "admin.password_reset": "Reset admin password",
  "admin.setup_completed": "Finished first-login setup",
  "account.updated": "Edited account",
  "account.blocked": "Blocked account",
  "account.unblocked": "Unblocked account",
  "account.removed": "Removed account",
  "account.restored": "Restored account",
  "registration.approved": "Approved registration",
  "registration.rejected": "Requested correction",
  "password.reset": "Reset own password (forgot password)",
  "plan.requested": "Requested Premium",
  "plan.approved": "Approved Premium",
  "plan.declined": "Declined Premium request",
  "stall.plan": "Changed stall plan",
  "stall.plan_expired": "Premium ended (end date)",
};

/**
 * Login logs. Admins (with the "View logs" privilege) see everyone's sign-ins and the admin
 * activity trail; `mine` shows a person only their own sign-ins.
 */
export default function LoginLogs({ mine = false }) {
  const { user } = useAuth();
  const showAll = !mine && can(user, "logs");
  const [tab, setTab] = useState("logins");
  const [filters, setFilters] = useState({ role: "all", month: "", date: "", q: "" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE, month: filters.month || undefined, date: filters.date || undefined };
    let request;
    if (!showAll) request = authService.myLogins(params);
    else if (tab === "activity") request = adminService.getActivity({ ...params, q: filters.q || undefined });
    else request = adminService.getLoginLogs({ ...params, q: filters.q || undefined, role: filters.role === "all" ? undefined : filters.role });
    request
      .then(({ data }) => { setRows(data.data || []); setTotal(data.total || 0); })
      .catch((err) => toast.error(err.response?.data?.error || "Couldn't load the logs"))
      .finally(() => setLoading(false));
  }, [page, filters, tab, showAll]);
  useEffect(load, [load]);

  const update = (changes) => { setFilters((current) => ({ ...current, ...changes })); setPage(1); };

  const title = showAll ? "Login logs" : "My login history";
  const intro = showAll
    ? "Every sign-in with ID number, full name, time in and time out — plus what admins changed."
    : "Each time your account signed in. Don't recognize one? Change your password right away.";

  const content = (
    <>
      <header className="topbar mu-topbar">
        <div className="topbar-titles">
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button>
      </header>

      <div className="dashboard-content mu-content">
        {showAll && (
          <div className="mu-pills" role="tablist" aria-label="Log type">
            <FilterChip role="tab" aria-selected={tab === "logins"} active={tab === "logins"} onClick={() => { setTab("logins"); setPage(1); }}>Sign-ins</FilterChip>
            <FilterChip role="tab" aria-selected={tab === "activity"} active={tab === "activity"} onClick={() => { setTab("activity"); setPage(1); }}>Admin activity</FilterChip>
          </div>
        )}

        <div className="mu-toolbar">
          {showAll && (
            <label className="mu-search">
              <Search aria-hidden="true" />
              <span className="sr-only">{tab === "activity" ? "Search activity" : "Search by name or ID number"}</span>
              <input type="search" placeholder={tab === "activity" ? "Search name, action or note" : "Search name or ID number"} value={filters.q} onChange={(e) => update({ q: e.target.value })} />
            </label>
          )}
          <DateFilters month={filters.month} date={filters.date} onChange={update} />
          {showAll && tab === "logins" && (
            <div className="mu-pills" role="group" aria-label="Role">
              {ROLES.map((role) => <FilterChip key={role} active={filters.role === role} onClick={() => update({ role })}>{role === "all" ? "Everyone" : `${cap(role)}s`}</FilterChip>)}
            </div>
          )}
        </div>

        {loading ? (
          <div className="mu-card">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={52} className="mu-skel" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState illustration="search" title="Nothing here" description={filters.month || filters.date || filters.q ? "No records match these filters." : "Records will appear here as people use the system."} />
        ) : tab === "activity" && showAll ? (
          <section className="mu-card" aria-label="Admin activity">
            <div className="mu-table-wrap">
              <table className="mu-table">
                <thead><tr><th scope="col">When</th><th scope="col">Admin</th><th scope="col">Action</th><th scope="col">Account</th><th scope="col">Note / reason</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td><strong>{row.actor_name || "—"}</strong>{row.actor_id_no && <small className="ll-sub">{row.actor_id_no}</small>}</td>
                      <td>{ACTIONS[row.action] || row.action}</td>
                      <td>{row.target_name || "—"}{row.target_email && <small className="ll-sub">{row.target_email}</small>}</td>
                      <td className="ll-note">{row.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage} noun="action" />
          </section>
        ) : (
          <section className="mu-card" aria-label="Sign-ins">
            <div className="mu-table-wrap">
              <table className="mu-table">
                <thead>
                  <tr>
                    {showAll && <><th scope="col">ID No.</th><th scope="col">Full name</th><th scope="col">Role</th></>}
                    <th scope="col">Time in</th><th scope="col">Time out</th><th scope="col">Duration</th><th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const [tone, label] = row.time_out ? ENDINGS[row.end_reason] || ["closed", "Signed out"] : ["active", "Signed in"];
                    return (
                      <tr key={row.id}>
                        {showAll && <>
                          <td className="mu-id-cell">{row.id_no || "—"}</td>
                          <td><strong>{row.full_name}</strong></td>
                          <td><span className={`cm-chip cm-chip--sm mu-role mu-role--${row.role}`}>{cap(row.role)}</span></td>
                        </>}
                        <td>{formatDateTime(row.time_in)}</td>
                        <td>{row.time_out ? formatDateTime(row.time_out) : <span className="ll-sub" title="Last activity">Last active {formatDateTime(row.last_seen_at)}</span>}</td>
                        <td>{duration(row.time_in, row.time_out)}</td>
                        <td><StatusChip status={tone} label={label} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage} noun="sign-in" />
          </section>
        )}
      </div>
    </>
  );

  // Buyers browse with the top navigation; sellers and admins have the dashboard sidebar.
  if (user?.role === "buyer") {
    return (
      <div className="ll-buyer">
        <Navbar />
        <main className="ll-buyer-main">{content}</main>
      </div>
    );
  }
  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">{content}</main>
    </div>
  );
}
