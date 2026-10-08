import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, History, KeyRound, Lock, ShieldCheck } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import PasswordField, { PasswordStrength, passwordMeetsRules } from "../../components/auth/PasswordField.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api, { authService } from "../../services/api.js";
import { saveTokens } from "../../services/tokens.js";
import { SECURITY_QUESTIONS } from "../../utils/adminAccess.js";

const homeFor = (role) => (role === "admin" ? "/admin" : role === "seller" ? "/seller" : "/");
const homeLabel = (role) => (role === "admin" ? "Admin dashboard" : role === "seller" ? "Seller dashboard" : "Back to shop");
const apiError = (err, fallback) => err.response?.data?.details?.[0]?.message || err.response?.data?.error || fallback;

/** Password and security questions, one short view at a time so the card never scrolls. */
export default function ChangePassword() {
  const { user, loading, updateUser } = useAuth();
  // Opens on Password; a dot on the other tab flags missing security questions.
  const [tab, setTab] = useState(null);
  if (loading) return <p role="status">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace />;
  const current = tab || "password";

  return (
    <AuthLayout title="Password & security" subtitle="Keep your Campus Market account safe.">
      <div className="cp-tabs" role="tablist" aria-label="Account security">
        <button type="button" role="tab" aria-selected={current === "password"} className={current === "password" ? "is-on" : ""} onClick={() => setTab("password")}>
          <Lock aria-hidden="true" /> Password
        </button>
        <button type="button" role="tab" aria-selected={current === "questions"} className={current === "questions" ? "is-on" : ""} onClick={() => setTab("questions")}>
          <ShieldCheck aria-hidden="true" /> Questions
          {!user.has_recovery_questions && <span className="cp-dot" aria-label="Not set yet" />}
        </button>
      </div>

      {current === "password" ? <PasswordForm onChanged={updateUser} /> : <QuestionSteps user={user} onSaved={updateUser} />}

      <div className="cp-links">
        <Link className="btn btn-outline btn-sm" to={homeFor(user.role)}><ArrowLeft aria-hidden="true" /> {homeLabel(user.role)}</Link>
        <Link className="cm-link" to="/account/logins"><History aria-hidden="true" /> My login history</Link>
      </div>
    </AuthLayout>
  );
}

function PasswordForm({ onChanged }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "", show: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setError(""); setDone(false); };

  const submit = async (event) => {
    event.preventDefault();
    if (!passwordMeetsRules(form.next)) return setError("Your new password needs 8+ characters, a letter and a number.");
    if (form.next !== form.confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const { data } = await api.put("/auth/password", { current_password: form.current, new_password: form.next });
      // Older sessions are signed out; keep this one with the fresh tokens.
      saveTokens(data);
      onChanged(data.user);
      setForm({ current: "", next: "", confirm: "", show: false });
      setDone(true);
    } catch (err) {
      setError(apiError(err, "Unable to change your password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form cp-panel" onSubmit={submit}>
      <p className="reg-note">Changing your password signs you out on every other device.</p>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {done && <p role="status" className="auth-success"><Check aria-hidden="true" /> Password changed. Other devices were signed out.</p>}
      <PasswordField id="cp-current" label="Current password" autoComplete="current-password" required value={form.current} onChange={set("current")} show={form.show} />
      <PasswordField id="cp-new" label="New password" autoComplete="new-password" required maxLength={100} value={form.next} onChange={set("next")}
        show={form.show} onToggleShow={() => setForm({ ...form, show: !form.show })} describedBy="cp-strength" />
      {form.next && <PasswordStrength id="cp-strength" value={form.next} />}
      <PasswordField id="cp-confirm" label="Confirm new password" autoComplete="new-password" required maxLength={100} value={form.confirm} onChange={set("confirm")} show={form.show} />
      <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}

const QUESTION_STEPS = ["Question 1", "Question 2", "Question 3", "Confirm"];
const startingQuestions = () => SECURITY_QUESTIONS.slice(0, 3).map((question) => ({ question, answer: "" }));

/** Three questions, one per step, then the current password to confirm. */
function QuestionSteps({ user, onSaved }) {
  const [editing, setEditing] = useState(!user.has_recovery_questions);
  const [step, setStep] = useState(0);
  const [items, setItems] = useState(startingQuestions);
  const [shown, setShown] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (!editing) {
    return (
      <div className="cp-panel cp-summary">
        <span className="cp-badge" aria-hidden="true"><ShieldCheck /></span>
        <h2>Your security questions are set</h2>
        <p className="reg-note">If you forget your password, an emailed code plus any two correct answers lets you choose a new one.</p>
        {saved && <p role="status" className="auth-success"><Check aria-hidden="true" /> Security questions saved.</p>}
        <button type="button" className="btn btn-outline btn-lg" style={{ width: "100%" }} onClick={() => { setEditing(true); setStep(0); setSaved(false); }}>
          <KeyRound aria-hidden="true" /> Change security questions
        </button>
      </div>
    );
  }

  const item = items[step];
  const update = (changes) => { setItems(items.map((entry, i) => (i === step ? { ...entry, ...changes } : entry))); setError(""); };
  const taken = items.filter((_, i) => i !== step).map((entry) => entry.question);

  const next = (event) => {
    event.preventDefault();
    if (step < 3) {
      if (item.answer.trim().length < 2) return setError("Your answer needs at least 2 characters.");
      setShown(false);
      return setStep(step + 1);
    }
    save();
  };

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await authService.setRecoveryQuestions({
        current_password: password, security_questions: items.map((entry) => ({ question: entry.question, answer: entry.answer.trim() })),
      });
      onSaved(data);
      setItems(startingQuestions());
      setPassword("");
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(apiError(err, "Couldn't save your questions."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form cp-panel" onSubmit={next}>
      <ol className="reg-progress" aria-label="Security question steps">
        {QUESTION_STEPS.map((label, index) => (
          <li key={label} className={index < step ? "is-done" : index === step ? "is-current" : ""} aria-current={index === step ? "step" : undefined}>
            <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
            <em className={index === step ? "" : "sr-only"}>{label}</em>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="auth-error">{error}</p>}

      {step < 3 ? (
        <>
          <p className="reg-note">{step === 0 && !user.has_recovery_questions ? "You haven't set security questions yet. " : ""}Pick a question only you can answer. Answers aren&apos;t case-sensitive.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="cp-question">Question {step + 1}</label>
            <select id="cp-question" className="form-input form-select" value={item.question} onChange={(e) => update({ question: e.target.value })}>
              {SECURITY_QUESTIONS.map((question) => <option key={question} disabled={taken.includes(question)}>{question}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cp-answer">Your answer</label>
            <div className="form-input-wrap">
              <input id="cp-answer" key={step} type={shown ? "text" : "password"} className="form-input rq-answer" autoComplete="off" spellCheck={false}
                autoFocus maxLength={100} placeholder="Hidden as you type" value={item.answer} onChange={(e) => update({ answer: e.target.value })} />
              <button type="button" className="form-input-toggle" onClick={() => setShown(!shown)} aria-label={shown ? "Hide answer" : "Show answer"} aria-pressed={shown}>
                {shown ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <ul className="cp-review" aria-label="Your questions">
            {items.map((entry, index) => (
              <li key={entry.question}>
                <span>{index + 1}</span>
                <p>{entry.question}<small>Answer: {"•".repeat(Math.min(entry.answer.trim().length, 12))}</small></p>
                <button type="button" className="cm-link" onClick={() => setStep(index)}>Edit</button>
              </li>
            ))}
          </ul>
          <PasswordField id="cp-confirm-pass" label="Current password (to confirm it's you)" autoComplete="current-password" required
            value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
        </>
      )}

      <div className={step > 0 || user.has_recovery_questions ? "reg-actions" : "cp-solo"}>
        {(step > 0 || user.has_recovery_questions) && (
          <button type="button" className="btn btn-outline btn-lg" onClick={() => (step > 0 ? setStep(step - 1) : setEditing(false))}>
            <ArrowLeft aria-hidden="true" /> {step > 0 ? "Back" : "Cancel"}
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {step < 3 ? <>Continue <ArrowRight aria-hidden="true" /></> : busy ? "Saving…" : "Save security questions"}
        </button>
      </div>
    </form>
  );
}
