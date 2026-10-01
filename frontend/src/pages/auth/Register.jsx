import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, IdCard, KeyRound, Mail, ShieldCheck, ShoppingBag, Store, User, X } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import OtpInput, { DevCodeHint, ResendCode } from "../../components/auth/OtpInput.jsx";
import PasswordField, { PasswordStrength, passwordMeetsRules } from "../../components/auth/PasswordField.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { authService } from "../../services/api";

const CAMPUS_DOMAIN = "csucc.edu.ph";
const ROLE_CARDS = [
  { value: "buyer", title: "I want to buy", text: "Food, merch and student-made goods", icon: ShoppingBag },
  { value: "seller", title: "I want to sell", text: "Open a stall and take orders", icon: Store },
];
// Three short steps so each one fits on a single screen.
const STEPS = ["Account", "Security", "CSUCC ID"];
const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What was the name of your elementary school?",
  "What was your childhood nickname?",
  "In what town or city was your mother born?",
  "What is the name of your favorite teacher?",
  "What was the first concert or event you attended?",
];
// Email confirmation: idle → sent (code boxes open) → verified (token in hand).
const NO_OTP = { status: "idle", code: "", error: "", busy: false, resendAt: 0, devCode: "", token: "" };
const apiError = (err, fallback) => err.response?.data?.details?.map((detail) => detail.message).join(" ") || err.response?.data?.error || fallback;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", emailUser: "", password: "", confirmPassword: "", security_question: SECURITY_QUESTIONS[0], security_answer: "",
    role: "buyer", campus_id: "", affiliation: "student", department: "", store_name: "", campus_location: "",
  });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(NO_OTP);
  const emailRef = useRef(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const email = `${form.emailUser.trim().toLowerCase()}@${CAMPUS_DOMAIN}`;
  const emailVerified = otp.status === "verified";

  // People often type or paste the full address; keep only the part before @.
  const handleEmailChange = (e) => {
    const [user, domain = ""] = e.target.value.replace(/\s/g, "").split("@");
    setForm({ ...form, emailUser: user });
    setFieldErrors({ ...fieldErrors, email: domain && !CAMPUS_DOMAIN.startsWith(domain.toLowerCase()) ? `Only @${CAMPUS_DOMAIN} addresses can join — we've added it for you.` : "" });
    // A new address needs a new code.
    if (otp.status !== "idle") setOtp(NO_OTP);
  };

  const sendCode = async () => {
    if (!/^[a-z0-9._%+-]+$/i.test(form.emailUser.trim())) {
      setFieldErrors({ ...fieldErrors, email: "Enter the part of your CSUCC email before @." });
      emailRef.current?.focus();
      return;
    }
    setFieldErrors({ ...fieldErrors, email: "" });
    setOtp((current) => ({ ...current, busy: true, error: "" }));
    try {
      const { data } = await authService.sendEmailCode(email);
      setOtp({ status: "sent", code: "", error: "", busy: false, resendAt: Date.now() + data.resend_in * 1000, devCode: data.dev_code || "", token: "" });
    } catch (err) {
      setOtp((current) => ({ ...current, busy: false }));
      setFieldErrors({ ...fieldErrors, email: apiError(err, "We couldn't send the code. Please try again.") });
    }
  };

  const verifyCode = async (code = otp.code) => {
    if (code.length !== 6) return setOtp((current) => ({ ...current, error: "Enter all 6 digits." }));
    setOtp((current) => ({ ...current, busy: true, error: "" }));
    try {
      const { data } = await authService.verifyEmailCode(email, code);
      setOtp((current) => ({ ...current, status: "verified", busy: false, token: data.email_token }));
    } catch (err) {
      setOtp((current) => ({ ...current, busy: false, code: "", error: apiError(err, "That code didn't work. Please try again.") }));
    }
  };

  const goTo = (next) => { setError(""); setStep(next); };

  const finishAccount = (e) => {
    e.preventDefault();
    const errors = {};
    if (!emailVerified) errors.email = otp.status === "sent" ? "Enter the 6-digit code we emailed you." : "Confirm your CSUCC email first — tap “Send code”.";
    setFieldErrors(errors);
    if (!e.currentTarget.reportValidity() || errors.email) return;
    goTo(1);
  };

  const finishSecurity = (e) => {
    e.preventDefault();
    const errors = {};
    if (!passwordMeetsRules(form.password)) errors.password = "Your password needs 8+ characters, a letter and a number.";
    else if (form.password !== form.confirmPassword) errors.confirmPassword = "The passwords don't match.";
    setFieldErrors(errors);
    if (!e.currentTarget.reportValidity() || Object.values(errors).some(Boolean)) return;
    goTo(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register({
        name: form.name, email, email_token: otp.token, password: form.password,
        security_question: form.security_question, security_answer: form.security_answer,
        role: form.role, campus_id: form.campus_id, affiliation: form.affiliation, department: form.department,
        store_name: form.store_name, campus_location: form.campus_location,
      });
      navigate("/account-status");
    } catch (err) {
      setError(apiError(err, "Registration failed. Please try again."));
      // The email confirmation lasts 30 minutes; after that the address must be confirmed again.
      if (err.response?.data?.code === "EMAIL_UNVERIFIED") setOtp(NO_OTP);
      // Send the person back to the step that holds the problem field.
      const message = `${err.response?.data?.error || ""} ${JSON.stringify(err.response?.data?.details || "")}`;
      if (/email|name/i.test(message)) setStep(0);
      else if (/password|security/i.test(message)) setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const confirmState = !form.confirmPassword ? null : form.confirmPassword === form.password ? "match" : "mismatch";

  return (
    <AuthLayout title="Create your account" subtitle="Join Campus Market and start buying and selling today!">
      <ol className="reg-progress" aria-label="Sign-up steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index < step ? "is-done" : index === step ? "is-current" : ""} aria-current={index === step ? "step" : undefined}>
            <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {error && <div className="auth-error" role="alert">{error}</div>}

      {step === 0 ? (
        <form onSubmit={finishAccount} className="auth-form" noValidate={false}>
          <fieldset className="reg-roles">
            <legend>What brings you here?</legend>
            {ROLE_CARDS.map(({ value, title, text, icon: Icon }) => (
              <label key={value} className={`reg-role ${form.role === value ? "is-selected" : ""}`}>
                <input type="radio" name="role" value={value} checked={form.role === value} onChange={set("role")} />
                <span className="reg-role-icon" aria-hidden="true"><Icon /></span>
                <span className="reg-role-text"><strong>{title}</strong><small>{text}</small></span>
                <span className="reg-role-check" aria-hidden="true"><Check /></span>
              </label>
            ))}
          </fieldset>

          <div className="form-group">
            <label className="form-label" htmlFor="name">Full name</label>
            <div className="form-input-wrap">
              <User size={18} className="form-input-icon" aria-hidden="true" />
              <input id="name" type="text" className="form-input" autoComplete="name" placeholder="As it appears on your CSUCC ID" value={form.name} required minLength={2} maxLength={80} onChange={set("name")} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">CSUCC email</label>
            <div className="email-row">
              <div className={`form-input-wrap email-field ${emailVerified ? "is-verified" : ""}`}>
                <Mail size={18} className="form-input-icon" aria-hidden="true" />
                <input
                  id="reg-email" ref={emailRef} type="text" className="form-input" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false}
                  placeholder="juan.delacruz" value={form.emailUser} required maxLength={64}
                  aria-invalid={Boolean(fieldErrors.email) || undefined} aria-describedby="reg-email-note"
                  onChange={handleEmailChange}
                  onKeyDown={(e) => { if (e.key === "Enter" && otp.status === "idle") { e.preventDefault(); sendCode(); } }}
                />
                <span className="email-suffix" aria-hidden="true">@{CAMPUS_DOMAIN}</span>
              </div>
              {emailVerified && <span className="email-verified"><BadgeCheck aria-hidden="true" /> Verified</span>}
              {otp.status === "idle" && (
                <button type="button" className="btn btn-outline email-send" onClick={sendCode} disabled={otp.busy || !form.emailUser.trim()}>
                  {otp.busy ? "Sending…" : "Send code"}
                </button>
              )}
            </div>
            {/* While the code panel is open it says where the code went, so the note steps aside. */}
            {(fieldErrors.email || otp.status !== "sent") && (
              <p id="reg-email-note" className={`field-note ${fieldErrors.email ? "is-error" : ""}`} role={fieldErrors.email ? "alert" : undefined}>
                {fieldErrors.email || (emailVerified ? `${email} is confirmed.` : `We'll email a 6-digit code to confirm this is your CSUCC address.`)}
              </p>
            )}

            {otp.status === "sent" && (
              <div className="otp-panel">
                <p id="reg-otp-label" className="otp-title">
                  <ShieldCheck aria-hidden="true" />
                  <span>Enter the code sent to <strong>{email}</strong></span>
                </p>
                <div className="otp-entry">
                  <OtpInput
                    value={otp.code} labelledBy="reg-otp-label" autoFocus invalid={Boolean(otp.error)} disabled={otp.busy}
                    onChange={(code) => setOtp((current) => ({ ...current, code, error: "" }))}
                    onComplete={verifyCode}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => verifyCode()} disabled={otp.busy || otp.code.length !== 6}>
                    {otp.busy ? "Checking…" : "Confirm"}
                  </button>
                </div>
                {otp.error && <p className="field-note is-error" role="alert">{otp.error}</p>}
                <div className="otp-actions">
                  <ResendCode availableAt={otp.resendAt} onResend={sendCode} busy={otp.busy} />
                  <span className="otp-help">Not in your inbox? Check Spam. Expires in 10 min.</span>
                </div>
                <DevCodeHint code={otp.devCode} onUse={(code) => { setOtp((current) => ({ ...current, code })); verifyCode(code); }} />
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-lg reg-full">Continue <ArrowRight aria-hidden="true" /></button>
        </form>
      ) : step === 1 ? (
        <form onSubmit={finishSecurity} className="auth-form">
          <div className="reg-two">
            <PasswordField
              id="reg-password" label="Password" autoComplete="new-password" placeholder="8+ characters" minLength={8} maxLength={100} required
              value={form.password} onChange={set("password")} show={showPass} onToggleShow={() => setShowPass(!showPass)}
              describedBy="reg-password-strength" invalid={Boolean(fieldErrors.password)}
            />
            <div>
              <PasswordField
                id="confirm" label="Confirm password" autoComplete="new-password" placeholder="Type it again" required
                value={form.confirmPassword} onChange={set("confirmPassword")} show={showPass}
                describedBy="confirm-note" invalid={confirmState === "mismatch" || Boolean(fieldErrors.confirmPassword)}
              />
              <p id="confirm-note" className={`field-note ${confirmState === "match" ? "is-ok" : confirmState === "mismatch" ? "is-error" : ""}`} aria-live="polite">
                {confirmState === "match" && <><Check aria-hidden="true" /> Passwords match</>}
                {confirmState === "mismatch" && <><X aria-hidden="true" /> {fieldErrors.confirmPassword || "Doesn't match yet"}</>}
              </p>
            </div>
          </div>
          <PasswordStrength id="reg-password-strength" value={form.password} />
          {fieldErrors.password && <p className="field-note is-error" role="alert">{fieldErrors.password}</p>}

          <fieldset className="reg-security">
            <legend><KeyRound aria-hidden="true" /> Account recovery</legend>
            <p className="reg-note">Can't open your email when signing in? You'll answer this instead.</p>
            <div className="form-group">
              <label className="form-label" htmlFor="sec-question">Security question</label>
              <select id="sec-question" className="form-input form-select" value={form.security_question} onChange={set("security_question")}>
                {SECURITY_QUESTIONS.map((question) => <option key={question}>{question}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sec-answer">Your answer</label>
              <input id="sec-answer" className="form-input" autoComplete="off" spellCheck={false} required minLength={2} maxLength={100}
                placeholder="Not case-sensitive" value={form.security_answer} onChange={set("security_answer")} />
            </div>
          </fieldset>

          <div className="reg-actions">
            <button type="button" className="btn btn-outline btn-lg" onClick={() => goTo(0)}><ArrowLeft aria-hidden="true" /> Back</button>
            <button type="submit" className="btn btn-primary btn-lg">Continue <ArrowRight aria-hidden="true" /></button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <p className="reg-intro"><IdCard aria-hidden="true" /> An administrator checks your ID against CSUCC records. Only you and administrators can see it. Buying{form.role === "seller" ? " and selling" : ""} opens once you're approved.</p>
          <div className="reg-two">
            <div className="form-group">
              <label className="form-label" htmlFor="affiliation">Campus affiliation</label>
              <select id="affiliation" className="form-input form-select" value={form.affiliation} onChange={set("affiliation")}>
                <option value="student">Student</option><option value="faculty">Faculty</option><option value="employee">Employee</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="campus-id">Student / employee ID</label>
              <input id="campus-id" className="form-input" required minLength={3} maxLength={50} placeholder="e.g. 2024-01234" value={form.campus_id} onChange={set("campus_id")} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="department">College, program or office</label>
            <input id="department" className="form-input" required minLength={2} maxLength={120} placeholder="e.g. BS Information Technology" value={form.department} onChange={set("department")} />
          </div>
          {form.role === "seller" && (
            <fieldset className="reg-store">
              <legend><Store aria-hidden="true" /> Your campus stall</legend>
              <div className="reg-two">
                <div className="form-group">
                  <label className="form-label" htmlFor="store-name">Stall name</label>
                  <input id="store-name" className="form-input" required minLength={2} maxLength={100} placeholder="e.g. Brew Corner" value={form.store_name} onChange={set("store_name")} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="store-location">Where buyers pick up</label>
                  <input id="store-location" className="form-input" required minLength={2} maxLength={150} placeholder="e.g. Main Canteen, Stall 4" value={form.campus_location} onChange={set("campus_location")} />
                </div>
              </div>
              <p className="reg-note">You start on the Free plan (5 listings). Your stall goes public after approval.</p>
            </fieldset>
          )}
          <div className="reg-actions">
            <button type="button" className="btn btn-outline btn-lg" onClick={() => goTo(1)} disabled={loading}><ArrowLeft aria-hidden="true" /> Back</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
          </div>
        </form>
      )}

      <div className="auth-footer">
        <p>Already have an account? <Link to="/login">Log In</Link></p>
      </div>
    </AuthLayout>
  );
}
