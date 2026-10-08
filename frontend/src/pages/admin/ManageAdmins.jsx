import "./AdminWorkspace.css";
import "./ManageUsers.css";
import "./ManageAdmins.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Clock, Copy, KeyRound, Mail, Pencil, RefreshCw, ShieldCheck, ShieldPlus, Trash2, UserCheck, UserX } from "lucide-react";
import Sidebar from "../../components/common/Sidebar.jsx";
import AdminDrawer, { RemoveAccountDrawer } from "../../components/admin/AdminDrawer.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { StatusChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { adminService } from "../../services/api.js";
import {
  ADMIN_PERMISSIONS, SHIFT_PRESETS, can, describeShift, formatDateTime, minutesToTime, shiftPresetOf, timeToMinutes,
} from "../../utils/adminAccess.js";

const CAMPUS_DOMAIN = "csucc.edu.ph";
const ALL_KEYS = ADMIN_PERMISSIONS.map((item) => item.key);
const apiError = (err, fallback) => err.response?.data?.details?.map((detail) => detail.message).join(" ") || err.response?.data?.error || fallback;

const copy = async (text, label) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error("Copy isn't available here — select the text instead."); }
};

/** Shift picker: Morning 8–5, Evening 5–12, Any time, or custom times (Philippine time). */
function ShiftPicker({ start, end, onChange }) {
  const preset = shiftPresetOf(start, end);
  return (
    <fieldset className="ma-fieldset">
      <legend><Clock aria-hidden="true" /> Duty shift <small>(Philippine time)</small></legend>
      <div className="ma-shifts" role="radiogroup" aria-label="Duty shift">
        {SHIFT_PRESETS.map((item) => (
          <button key={item.key} type="button" role="radio" aria-checked={preset === item.key} className={`ma-shift ${preset === item.key ? "is-on" : ""}`}
            onClick={() => onChange(item.start, item.end)}>
            <strong>{item.label}</strong><small>{describeShift(item.start, item.end)}</small>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={preset === "custom"} className={`ma-shift ${preset === "custom" ? "is-on" : ""}`}
          onClick={() => preset !== "custom" && onChange(7 * 60, 15 * 60)}>
          <strong>Custom</strong><small>Pick the hours</small>
        </button>
      </div>
      {preset === "custom" && (
        <div className="ma-times">
          <label>Starts <input type="time" className="form-input" value={minutesToTime(start)} onChange={(e) => onChange(timeToMinutes(e.target.value), end)} /></label>
          <label>Ends <input type="time" className="form-input" value={minutesToTime(end)} onChange={(e) => onChange(start, timeToMinutes(e.target.value, { isEnd: true }))} /></label>
        </div>
      )}
      <p className="ma-help">Outside their shift an admin can't sign in, and they're signed out automatically when it ends. "Any time" has no limit.</p>
    </fieldset>
  );
}

function PrivilegePicker({ value, onChange, lockAdmins }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  return (
    <fieldset className="ma-fieldset">
      <legend><ShieldCheck aria-hidden="true" /> Privileges</legend>
      <div className="ma-perms">
        {ADMIN_PERMISSIONS.map((item) => (
          <label key={item.key} className="mu-check ma-perm">
            <input type="checkbox" checked={value.includes(item.key)} onChange={() => toggle(item.key)} disabled={lockAdmins && item.key === "admins"} />
            <span><strong>{item.label}</strong><small>{item.hint}</small></span>
          </label>
        ))}
      </div>
      <p className="ma-help">All are on by default — every admin has the full set unless you narrow it.</p>
    </fieldset>
  );
}

/** Create or edit form. `admin` is null when creating. */
function AdminForm({ admin, self, busy, onClose, onSubmit }) {
  const editing = Boolean(admin);
  const [form, setForm] = useState(() => ({
    username: admin?.username || "",
    emailUser: admin?.email?.endsWith(`@${CAMPUS_DOMAIN}`) ? admin.email.split("@")[0] : admin?.email || "",
    name: admin?.name || "",
    employee_id: admin?.campus_id || "",
    shift_start: admin ? admin.shift_start : 8 * 60,
    shift_end: admin ? admin.shift_end : 17 * 60,
    permissions: admin?.permissions ?? ALL_KEYS,
  }));
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const email = form.emailUser.includes("@") ? form.emailUser.trim().toLowerCase() : `${form.emailUser.trim().toLowerCase()}@${CAMPUS_DOMAIN}`;

  const submit = (e) => {
    e.preventDefault();
    if (form.shift_start != null && form.shift_start === form.shift_end) return toast.error("A shift can't start and end at the same time.");
    const permissions = ALL_KEYS.every((key) => form.permissions.includes(key)) ? null : form.permissions;
    const payload = {
      username: form.username.trim().toLowerCase(), email, employee_id: form.employee_id.trim() || undefined,
      shift_start: form.shift_start, shift_end: form.shift_end, permissions,
    };
    if (!editing) return onSubmit(payload);
    payload.name = form.name.trim();
    // Send only what changed, so the activity log names exactly that.
    const before = { username: admin.username, email: admin.email, name: admin.name, employee_id: admin.campus_id || undefined,
      shift_start: admin.shift_start, shift_end: admin.shift_end, permissions: admin.permissions ?? null };
    const changed = Object.fromEntries(Object.entries(payload).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key])));
    if (changed.shift_start !== undefined || changed.shift_end !== undefined) Object.assign(changed, { shift_start: payload.shift_start, shift_end: payload.shift_end });
    if (!Object.keys(changed).length) return onClose();
    onSubmit(changed);
  };

  return (
    <AdminDrawer
      eyebrow={editing ? "Edit administrator" : "New administrator"} title={editing ? admin.name : "Create an admin account"} labelId="admin-form-title"
      subtitle={editing ? admin.email : "They get a starter password by email and set up the rest at their first sign-in."}
      avatar={editing ? admin.name?.charAt(0).toUpperCase() : <ShieldPlus aria-hidden="true" />} onClose={onClose}
    >
      <form id="admin-form" className="ma-form" onSubmit={submit}>
        <div className="form-group">
          <label className="form-label" htmlFor="ma-username">Username <small className="ma-muted">(used to sign in)</small></label>
          <input id="ma-username" className="form-input" required minLength={3} maxLength={30} pattern="[A-Za-z0-9._\-]+" autoCapitalize="none" spellCheck={false}
            placeholder="e.g. admin.evening" value={form.username} onChange={set("username")} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ma-email">CSUCC email <small className="ma-muted">(sign-in details are sent here)</small></label>
          <div className="ma-email">
            <Mail aria-hidden="true" />
            <input id="ma-email" className="form-input" required autoCapitalize="none" spellCheck={false} placeholder="firstname.lastname"
              value={form.emailUser} onChange={(e) => setForm({ ...form, emailUser: e.target.value.replace(/\s/g, "").split("@")[0] })} />
            <span>@{CAMPUS_DOMAIN}</span>
          </div>
        </div>
        {editing && (
          <div className="form-group">
            <label className="form-label" htmlFor="ma-name">Full name</label>
            <input id="ma-name" className="form-input" required minLength={2} maxLength={80} value={form.name} onChange={set("name")} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label" htmlFor="ma-emp">Employee ID <small className="ma-muted">{editing ? "" : "(optional — they can enter it at setup)"}</small></label>
          <input id="ma-emp" className="form-input" minLength={3} maxLength={50} placeholder="e.g. EMP-2024-001" value={form.employee_id} onChange={set("employee_id")} />
        </div>
        <ShiftPicker start={form.shift_start} end={form.shift_end} onChange={(shift_start, shift_end) => setForm({ ...form, shift_start, shift_end })} />
        <PrivilegePicker value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} lockAdmins={self} />
      </form>
      <footer className="mu-drawer-actions">
        <button type="submit" form="admin-form" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create admin"}</button>
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
      </footer>
    </AdminDrawer>
  );
}

/** Shown once after creating or resetting: the starter password (also emailed). */
function CredentialsDrawer({ result, onClose }) {
  const { user, password, emailed } = result;
  return (
    <AdminDrawer eyebrow={result.reset ? "Password reset" : "Admin created"} title={user.username} subtitle={user.email} labelId="cred-title"
      avatar={<KeyRound aria-hidden="true" />} onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
      <p className={emailed ? "ma-sent" : "mu-prev-note"}>
        {emailed ? <><Check aria-hidden="true" /><span>Sign-in details were emailed to <strong>{user.email}</strong>.</span></>
          : <>The email couldn&apos;t be sent. Give these details to {user.username} in person.</>}
      </p>
      <dl className="mu-facts">
        <div><dt>Username</dt><dd className="ma-cred">{user.username}<button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(user.username, "Username")}><Copy aria-hidden="true" /> Copy</button></dd></div>
        <div><dt>Starter password</dt><dd className="ma-cred mu-id">{password}<button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(password, "Password")}><Copy aria-hidden="true" /> Copy</button></dd></div>
        <div><dt>Duty shift</dt><dd>{user.shift?.label}</dd></div>
      </dl>
      <p className="ma-help">This password is shown only now. At their first sign-in they choose their own password, enter their name and employee ID, and set three security questions.</p>
    </AdminDrawer>
  );
}

export default function ManageAdmins() {
  const { user: me } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // { admin } — admin null when creating
  const [removing, setRemoving] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const manage = can(me, "admins");

  const load = useCallback(() => {
    setLoading(true);
    adminService.getAdmins()
      .then(({ data }) => setAdmins(data))
      .catch((err) => toast.error(apiError(err, "Couldn't load administrators")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const onDuty = useMemo(() => admins.filter((admin) => admin.shift?.on_duty && !admin.is_banned), [admins]);

  const save = async (payload) => {
    setBusy(true);
    try {
      if (form.admin) {
        await adminService.updateAdmin(form.admin.id, payload);
        toast.success("Administrator updated");
      } else {
        const { data } = await adminService.createAdmin(payload);
        setCredentials(data);
      }
      setForm(null);
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (admin) => {
    if (!window.confirm(`Reset ${admin.name}'s password? They'll be signed out and must set up their account again.`)) return;
    try {
      const { data } = await adminService.resetAdminPassword(admin.id);
      setCredentials({ ...data, reset: true });
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't reset the password"));
    }
  };

  const toggleBlock = async (admin) => {
    if (!window.confirm(`${admin.is_banned ? "Unblock" : "Block"} ${admin.name}?`)) return;
    try {
      await adminService.banUser(admin.id, !admin.is_banned);
      toast.success(`${admin.name} ${admin.is_banned ? "unblocked" : "blocked"}`);
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't change the block"));
    }
  };

  const remove = async (reason) => {
    setBusy(true);
    try {
      await adminService.removeUser(removing.id, reason);
      toast.success(`${removing.name} removed`);
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't remove this admin"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar mu-topbar">
          <div className="topbar-titles">
            <h1>Administrators</h1>
            <p>Create admins, set their duty shifts and decide what each one can do.</p>
          </div>
          <div className="ma-top-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button>
            {manage && <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({ admin: null })}><ShieldPlus aria-hidden="true" /> New admin</button>}
          </div>
        </header>

        <div className="dashboard-content mu-content">
          <section className="ma-duty" aria-label="On duty now">
            <p className="cm-eyebrow">On duty now</p>
            {loading ? <SkeletonBlock height={32} /> : onDuty.length ? (
              <ul>{onDuty.map((admin) => <li key={admin.id}><span className="ma-dot" aria-hidden="true" />{admin.name}<small>{admin.shift.label}</small></li>)}</ul>
            ) : <p className="ma-help">Nobody is on shift right now.</p>}
          </section>

          {loading ? (
            <div className="mu-card">{[0, 1, 2].map((i) => <SkeletonBlock key={i} height={60} className="mu-skel" />)}</div>
          ) : admins.length === 0 ? (
            <EmptyState illustration="search" title="No administrators" description="Create the first admin account." />
          ) : (
            <section className="mu-card" aria-label="Administrators">
              <div className="mu-table-wrap">
                <table className="mu-table ma-table">
                  <thead>
                    <tr><th scope="col">Admin</th><th scope="col">Employee ID</th><th scope="col">Shift</th><th scope="col">Privileges</th><th scope="col">Status</th><th scope="col">Last sign-in</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => {
                      const isMe = admin.id === me?.id;
                      const status = admin.is_banned ? ["banned", "Blocked"] : admin.must_setup ? ["pending", "Setup pending"] : ["approved", "Active"];
                      return (
                        <tr key={admin.id} className={admin.is_banned ? "is-banned" : ""}>
                          <td>
                            <span className="mu-person">
                              <span className="mu-avatar" aria-hidden="true">{admin.name?.charAt(0).toUpperCase()}</span>
                              <span className="ma-who"><strong>{admin.name}{isMe && <em> (you)</em>}</strong><small>{admin.username ? `@${admin.username}` : admin.email}</small></span>
                            </span>
                          </td>
                          <td className="mu-id-cell">{admin.campus_id || "—"}</td>
                          <td>
                            <span className={`ma-shift-cell ${admin.shift?.on_duty ? "is-on" : ""}`}>
                              <span className="ma-dot" aria-hidden="true" />{admin.shift?.label}
                              <span className="sr-only">{admin.shift?.on_duty ? " — on duty" : " — off duty"}</span>
                            </span>
                          </td>
                          <td>{admin.permissions == null ? "All" : `${admin.permissions.length} of ${ALL_KEYS.length}`}</td>
                          <td><StatusChip status={status[0]} label={status[1]} /></td>
                          <td className="ma-wrap">{formatDateTime(admin.last_login_at)}</td>
                          <td>
                            {manage && (
                              <div className="mu-actions">
                                {/* Icon buttons keep the row on screen; the tooltip and label name each action. */}
                                <button type="button" className="btn btn-ghost btn-sm ma-icon" onClick={() => setForm({ admin })} title="Edit" aria-label={`Edit ${admin.name}`}><Pencil aria-hidden="true" /></button>
                                {!isMe && <button type="button" className="btn btn-ghost btn-sm ma-icon" onClick={() => resetPassword(admin)} title="Reset password" aria-label={`Reset ${admin.name}'s password`}><KeyRound aria-hidden="true" /></button>}
                                {!isMe && can(me, "block") && (
                                  <button type="button" className={`btn btn-sm ma-icon ${admin.is_banned ? "btn-outline" : "btn-ghost mu-ban"}`} onClick={() => toggleBlock(admin)}
                                    title={admin.is_banned ? "Unblock" : "Block"} aria-label={`${admin.is_banned ? "Unblock" : "Block"} ${admin.name}`}>
                                    {admin.is_banned ? <UserCheck aria-hidden="true" /> : <UserX aria-hidden="true" />}
                                  </button>
                                )}
                                {!isMe && can(me, "delete") && (
                                  <button type="button" className="btn btn-ghost btn-sm ma-icon mu-ban" onClick={() => setRemoving(admin)} title="Remove" aria-label={`Remove ${admin.name}`}><Trash2 aria-hidden="true" /></button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
      {form && <AdminForm admin={form.admin} self={form.admin?.id === me?.id} busy={busy} onClose={() => setForm(null)} onSubmit={save} />}
      {credentials && <CredentialsDrawer result={credentials} onClose={() => setCredentials(null)} />}
      {removing && <RemoveAccountDrawer account={removing} busy={busy} onClose={() => setRemoving(null)} onConfirm={remove} />}
    </div>
  );
}
