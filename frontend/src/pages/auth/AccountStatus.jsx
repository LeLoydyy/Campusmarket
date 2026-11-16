import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import Illustration from "../../components/ui/Illustration.jsx";
import { AlertTriangle, Check, Clock3, Info, LogOut, ShoppingBag, Store } from "lucide-react";

export default function AccountStatus() {
  const { user, loading, updateUser, logout } = useAuth();
  // "submit" or "check" while a request runs, so only that button shows progress.
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  if (loading) return <p role="status">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "approved") return <Navigate to={user.role === "seller" ? "/seller" : user.role === "admin" ? "/admin" : "/"} replace />;
  const rejected = user.status === "rejected";
  const showForm = !user.campus_id || rejected;
  const credentials = form || { campus_id: user.campus_id || "", affiliation: user.affiliation || "student", department: user.department || "" };
  const request = async (submit = false) => {
    setBusy(submit ? "submit" : "check"); setError("");
    try {
      const { data } = submit ? await api.put("/auth/credentials", credentials) : await api.get("/auth/me");
      updateUser(data); setForm(null);
    } catch (err) { setError(err.response?.data?.error || "Unable to check your account."); }
    finally { setBusy(null); }
  };
  const set = (field) => (e) => setForm({ ...credentials, [field]: e.target.value });

  return <AuthLayout title={rejected ? "Update your campus credentials" : "Your registration is under review"} subtitle="Campus Marketplace · CSUCC">
    <section className={`acct acct--${user.status}`} aria-live="polite">
      <Illustration name={rejected ? "search" : "bell"} size={110} />
      <span className={`cm-chip cm-tone-${rejected ? "coral" : "gold"}`}>{rejected ? "Needs correction" : "Pending verification"}</span>
      <ol className="acct-steps">
        <li className="is-done"><span><Check aria-hidden="true" /></span>Account created</li>
        <li className={rejected ? "is-blocked" : "is-current"}><span><Clock3 aria-hidden="true" /></span>CSUCC ID verification</li>
        <li><span>{user.role === "seller" ? <Store aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}</span>{user.role === "seller" ? "Open your stall" : "Start buying"}</li>
      </ol>
    </section>

    {rejected ? (
      <div className="acct-note" role="status">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>What to fix</strong>
          <p>{user.review_note || "An administrator couldn't match your details with CSUCC records. Check them below and submit again."}</p>
        </div>
      </div>
    ) : <>
      <p className="acct-lead">An administrator checks your ID against CSUCC records before you can buy, sell or message sellers. You can browse the marketplace while you wait.</p>
      {user.review_note && (
        <div className="acct-note is-info" role="status">
          <Info aria-hidden="true" />
          <div><strong>Note from the administrator</strong><p>{user.review_note}</p></div>
        </div>
      )}
    </>}

    {error && <p role="alert" className="auth-error acct-error">{error}</p>}

    {showForm && (
      <form className="auth-form acct-form" onSubmit={(e) => { e.preventDefault(); request(true); }}>
        <div className="acct-form-head">
          <h2>{rejected ? "Correct your details" : "Add your campus details"}</h2>
          <p>{rejected ? "Update what the administrator flagged, then send it back for review." : "An administrator uses these to confirm you're part of CSUCC."}</p>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="acct-affiliation">Campus affiliation</label>
          <select id="acct-affiliation" className="form-input" value={credentials.affiliation} onChange={set("affiliation")}>
            <option value="student">Student</option><option value="faculty">Faculty</option><option value="employee">Employee</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="acct-id">{credentials.affiliation === "student" ? "Student ID" : "Employee ID"}</label>
          <input id="acct-id" className="form-input" required minLength={3} maxLength={50} autoComplete="off" value={credentials.campus_id} onChange={set("campus_id")} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="acct-department">College, program, or office</label>
          <input id="acct-department" className="form-input" required minLength={2} maxLength={120} value={credentials.department} onChange={set("department")} />
        </div>
        <button className="btn btn-primary acct-submit" disabled={Boolean(busy)}>{busy === "submit" ? "Submitting…" : "Submit for review"}</button>
      </form>
    )}

    <div className="acct-actions">
      <button type="button" className={`btn ${showForm ? "btn-outline" : "btn-primary"}`} disabled={Boolean(busy)} onClick={() => request()}>
        {busy === "check" ? "Checking…" : "Check approval status"}
      </button>
      <Link className="btn btn-outline" to="/browse">Browse products</Link>
      <button type="button" className="btn btn-ghost acct-logout" onClick={logout}><LogOut aria-hidden="true" /> Log out</button>
    </div>
  </AuthLayout>;
}
