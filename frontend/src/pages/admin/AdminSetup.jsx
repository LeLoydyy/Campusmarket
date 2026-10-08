import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Clock, IdCard, ShieldCheck, User } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import PasswordField, { PasswordStrength, passwordMeetsRules } from "../../components/auth/PasswordField.jsx";
import RecoveryQuestions, { emptyRecoveryQuestions, recoveryQuestionsComplete } from "../../components/auth/RecoveryQuestions.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const apiError = (err) => err.response?.data?.details?.map((detail) => detail.message).join(" ") || err.response?.data?.error || "Setup failed. Please try again.";

/**
 * First sign-in of an administrator created by another admin (or whose password was reset):
 * real name, employee ID, a password of their own and three security questions.
 * Nothing else in the admin area opens until this is done.
 */
export default function AdminSetup() {
  const { user, loading: authLoading, completeSetup, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    name: user?.name && user.name !== user.username ? user.name : "",
    employee_id: user?.campus_id || "",
    password: "", confirm: "", show: false,
    security_questions: emptyRecoveryQuestions(),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_setup) return <Navigate to={user.role === "admin" ? "/admin" : "/"} replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordMeetsRules(form.password)) return setError("Your password needs 8+ characters, a letter and a number.");
    if (form.password !== form.confirm) return setError("The passwords don't match.");
    if (!recoveryQuestionsComplete(form.security_questions)) return setError("Answer all three security questions (2+ characters each).");
    setSaving(true);
    setError("");
    try {
      await completeSetup({
        name: form.name.trim(), employee_id: form.employee_id.trim(), new_password: form.password,
        security_questions: form.security_questions.map((item) => ({ question: item.question, answer: item.answer.trim() })),
      });
      toast.success("You're all set. Welcome to the admin team!");
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout title="Set up your admin account" subtitle="One-time setup. Your starter password stops working once you choose your own.">
      <div className="setup-facts">
        <p><ShieldCheck aria-hidden="true" /> Signed in as <strong>{user.username || user.email}</strong></p>
        <p><Clock aria-hidden="true" /> Duty shift: <strong>{user.shift?.label || "Any time"}</strong></p>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <form onSubmit={submit} className="auth-form">
        <div className="reg-two">
          <div className="form-group">
            <label className="form-label" htmlFor="setup-name">Full name</label>
            <div className="form-input-wrap">
              <User size={18} className="form-input-icon" aria-hidden="true" />
              <input id="setup-name" className="form-input" required minLength={2} maxLength={80} autoComplete="name" autoFocus
                placeholder="First name, M.I., Last name" value={form.name} onChange={set("name")} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="setup-emp">Employee ID</label>
            <div className="form-input-wrap">
              <IdCard size={18} className="form-input-icon" aria-hidden="true" />
              <input id="setup-emp" className="form-input" required minLength={3} maxLength={50} placeholder="e.g. EMP-2024-001"
                value={form.employee_id} onChange={set("employee_id")} />
            </div>
          </div>
        </div>
        <PasswordField id="setup-pass" label="New password" autoComplete="new-password" required value={form.password}
          onChange={set("password")} show={form.show} onToggleShow={() => setForm({ ...form, show: !form.show })} describedBy="setup-strength" />
        <PasswordStrength id="setup-strength" value={form.password} />
        <PasswordField id="setup-confirm" label="Confirm new password" autoComplete="new-password" required value={form.confirm}
          onChange={set("confirm")} show={form.show} />
        <RecoveryQuestions idPrefix="setup" value={form.security_questions} onChange={(security_questions) => setForm({ ...form, security_questions })} />
        <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={saving}>
          {saving ? <span className="spinner" /> : "Finish setup"}
        </button>
      </form>
      <div className="auth-footer">
        <p><button type="button" className="cm-link" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}>Sign out</button></p>
      </div>
    </AuthLayout>
  );
}
