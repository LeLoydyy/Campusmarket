import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import { saveTokens } from "../../services/tokens.js";

const homeFor = (role) => (role === "admin" ? "/admin" : role === "seller" ? "/seller" : "/");

export default function ChangePassword() {
  const { user, loading, updateUser } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  if (loading) return <p role="status">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace />;

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.new_password.length < 8) return setError("Use at least 8 characters for your new password.");
    if (form.new_password !== form.confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const { data } = await api.put("/auth/password", { current_password: form.current_password, new_password: form.new_password });
      // Older sessions are signed out; keep this one with the fresh tokens.
      saveTokens(data);
      updateUser(data.user);
      setForm({ current_password: "", new_password: "", confirm: "" });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.details?.[0]?.message || err.response?.data?.error || "Unable to change your password.");
    } finally {
      setBusy(false);
    }
  };

  return <AuthLayout title="Change your password" subtitle="Campus Marketplace · CSUCC">
    <p>Changing your password signs you out on every other device.</p>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {done && <p role="status"><strong>Password changed.</strong> Other devices have been signed out.</p>}
    <form className="auth-form" onSubmit={submit}>
      <label className="form-label">Current password
        <input className="form-input" type="password" name="current_password" autoComplete="current-password" required value={form.current_password} onChange={update} />
      </label>
      <label className="form-label">New password
        <input className="form-input" type="password" name="new_password" autoComplete="new-password" required minLength={8} maxLength={100} value={form.new_password} onChange={update} />
      </label>
      <label className="form-label">Confirm new password
        <input className="form-input" type="password" name="confirm" autoComplete="new-password" required minLength={8} maxLength={100} value={form.confirm} onChange={update} />
      </label>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
    </form>
    <div style={{ marginTop: "1.5rem" }}>
      <Link className="btn btn-outline" to={homeFor(user.role)}>Back</Link>
    </div>
  </AuthLayout>;
}
