import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import Illustration from "../../components/ui/Illustration.jsx";
import { Check, Clock3, ShoppingBag, Store } from "lucide-react";

export default function AccountStatus() {
  const { user, loading, updateUser, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  if (loading) return <p role="status">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "approved") return <Navigate to={user.role === "seller" ? "/seller" : user.role === "admin" ? "/admin" : "/"} replace />;
  const credentials = form || { campus_id: user.campus_id || "", affiliation: user.affiliation || "student", department: user.department || "" };
  const request = async (submit = false) => {
    setBusy(true); setError("");
    try {
      const { data } = submit ? await api.put("/auth/credentials", credentials) : await api.get("/auth/me");
      updateUser(data); setForm(null);
    } catch (err) { setError(err.response?.data?.error || "Unable to check your account."); }
    finally { setBusy(false); }
  };
  return <AuthLayout title={user.status === "rejected" ? "Update your campus credentials" : "Your registration is under review"} subtitle="Campus Marketplace · CSUCC">
    <section className={`acct acct--${user.status}`} aria-live="polite">
      <Illustration name={user.status === "rejected" ? "search" : "bell"} size={130} />
      <span className={`cm-chip cm-tone-${user.status === "rejected" ? "coral" : "gold"}`}>{user.status === "rejected" ? "Needs correction" : "Pending verification"}</span>
      <ol className="acct-steps">
        <li className="is-done"><span><Check aria-hidden="true" /></span>Account created</li>
        <li className={user.status === "rejected" ? "is-blocked" : "is-current"}><span><Clock3 aria-hidden="true" /></span>CSUCC ID verification</li>
        <li><span>{user.role === "seller" ? <Store aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}</span>{user.role === "seller" ? "Open your stall" : "Start buying"}</li>
      </ol>
    </section>
    <p className="acct-lead">An administrator checks your ID against CSUCC records before you can buy, sell or message sellers. You can browse the marketplace while you wait.</p>
    {user.review_note && <p role="status"><strong>Administrator feedback:</strong> {user.review_note}</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {(!user.campus_id || user.status === "rejected") && <form className="auth-form" onSubmit={(e) => { e.preventDefault(); request(true); }}>
      <label className="form-label">Campus affiliation<select className="form-input" value={credentials.affiliation} onChange={(e) => setForm({ ...credentials, affiliation: e.target.value })}><option value="student">Student</option><option value="faculty">Faculty</option><option value="employee">Employee</option></select></label>
      <label className="form-label">Student / employee ID<input className="form-input" required minLength={3} maxLength={50} value={credentials.campus_id} onChange={(e) => setForm({ ...credentials, campus_id: e.target.value })} /></label>
      <label className="form-label">College, program, or office<input className="form-input" required minLength={2} maxLength={120} value={credentials.department} onChange={(e) => setForm({ ...credentials, department: e.target.value })} /></label>
      <button className="btn btn-primary" disabled={busy}>Submit for review</button>
    </form>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: "1.5rem" }}>
      <button className="btn btn-primary" disabled={busy} onClick={() => request()}>{busy ? "Checking…" : "Check approval status"}</button>
      <Link className="btn btn-outline" to="/browse">Browse products</Link>
      <button className="btn btn-ghost" onClick={logout}>Log out</button>
    </div>
  </AuthLayout>;
}
