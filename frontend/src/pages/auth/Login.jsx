import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Mail, MailCheck, UserRound } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import OtpInput, { DevCodeHint, ResendCode } from "../../components/auth/OtpInput.jsx";
import PasswordField from "../../components/auth/PasswordField.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { authService } from "../../services/api";
import { getRememberPreference, setRememberPreference } from "../../services/tokens";

// Mirrors the server: two free wrong passwords, then 5s, 10s, 20s … (max 15 min).
// The page applies it too, so unknown emails behave exactly like real ones.
const FREE_FAILURES = 2;
const cooldownFor = (failures) => (failures <= FREE_FAILURES ? 0 : Math.min(900, 5 * 2 ** (failures - FREE_FAILURES - 1)));
const GUARD_KEY = "loginGuard";
const readGuard = () => {
  try { return { failures: 0, until: 0, ...JSON.parse(sessionStorage.getItem(GUARD_KEY) || "{}") }; } catch { return { failures: 0, until: 0 }; }
};
const writeGuard = (guard) => { try { sessionStorage.setItem(GUARD_KEY, JSON.stringify(guard)); } catch { /* storage blocked */ } };
const describeWait = (seconds) => {
  const [n, unit] = seconds < 60 ? [seconds, "second"] : [Math.ceil(seconds / 60), "minute"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
};
const formatWait = (seconds) => (seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : `${seconds}s`);

const apiError = (err, fallback) =>
  err.response?.data?.error ||
  (!err.response ? "Unable to connect to the server. Please make sure the backend is running and try again." : fallback);

// Why the person landed here (set by automatic sign-outs and the password reset page).
const NOTICES = {
  shift_ended: "Your shift has ended, so you were signed out. You can sign in again during your next shift.",
  password_reset: "Your password was changed. Sign in with your new password.",
};

export default function Login() {
  const { login, verifyLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const notice = NOTICES[searchParams.get("reason")];
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(getRememberPreference);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Second step, shown in place once the password is right.
  const [challenge, setChallenge] = useState(null);
  const [method, setMethod] = useState("code");
  const [code, setCode] = useState("");
  const [answer, setAnswer] = useState("");
  const [stepError, setStepError] = useState("");
  // Wrong-password tracking for this tab (kept across a refresh).
  const [guard, setGuard] = useState(readGuard);
  const [now, setNow] = useState(() => Date.now());
  const waitSeconds = Math.max(0, Math.ceil((guard.until - now) / 1000));
  const coolingDown = waitSeconds > 0;

  useEffect(() => {
    if (!coolingDown) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [coolingDown]);

  // When the wait ends, drop the "please wait" wording but keep the reason.
  useEffect(() => {
    if (!coolingDown && guard.until) setError((current) => (current ? "Wrong email or password." : current));
  }, [coolingDown, guard.until]);

  const updateGuard = (next) => { setGuard(next); writeGuard(next); setNow(Date.now()); };

  const goHome = (user) => {
    if (user?.must_setup) navigate("/admin/setup");
    else if (user?.status !== "approved") navigate("/account-status");
    else if (user?.role === "admin") navigate("/admin");
    else if (user?.role === "seller") navigate("/seller");
    else navigate("/");
  };

  const startOver = (message = "") => {
    setChallenge(null);
    setCode("");
    setAnswer("");
    setStepError("");
    setMethod("code");
    setForm((current) => ({ ...current, password: "" }));
    setError(message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (coolingDown) return;
    setLoading(true);
    setError("");
    try {
      const data = await login(form.email.trim(), form.password, remember);
      updateGuard({ failures: 0, until: 0 });
      if (data.user) {
        setRememberPreference(remember);
        return goHome(data.user);
      }
      setChallenge({ ...data, resendAt: Date.now() + data.resend_in * 1000 });
      setMethod("code");
      setCode("");
      setStepError("");
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 423) {
        const failures = guard.failures + 1;
        const wait = Math.max(cooldownFor(failures), err.response.data?.retry_after || 0);
        updateGuard({ failures, until: wait ? Date.now() + wait * 1000 : 0 });
        setForm((current) => ({ ...current, password: "" }));
        setError(wait
          ? `Wrong email or password. For your safety, please wait ${describeWait(wait)} before trying again.`
          : "Wrong email or password.");
      } else {
        setError(apiError(err, "Unable to sign in. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  const finish = async (payload) => {
    setLoading(true);
    setStepError("");
    try {
      setRememberPreference(remember);
      goHome(await verifyLogin({ challenge: challenge.challenge, ...payload }, remember));
    } catch (err) {
      if (err.response?.data?.code === "CHALLENGE_EXPIRED") return startOver(err.response.data.error);
      setStepError(apiError(err, "That didn't work. Please try again."));
      if (payload.code) setCode("");
    } finally {
      setLoading(false);
    }
  };

  const submitCode = (value = code) => {
    if (value.length !== 6) return setStepError("Enter all 6 digits.");
    finish({ code: value });
  };

  const resend = async () => {
    setLoading(true);
    setStepError("");
    try {
      const { data } = await authService.resendLoginCode(challenge.challenge);
      setChallenge((current) => ({ ...current, ...data, resendAt: Date.now() + data.resend_in * 1000 }));
      setCode("");
    } catch (err) {
      if (err.response?.data?.code === "CHALLENGE_EXPIRED") return startOver(err.response.data.error);
      setStepError(apiError(err, "We couldn't send a new code."));
    } finally {
      setLoading(false);
    }
  };

  const switchMethod = (next) => {
    setMethod(next);
    setStepError("");
  };

  return (
    <AuthLayout
      title={challenge ? "Confirm it's you" : "Welcome Back!"}
      subtitle={challenge ? "One more step keeps your account safe, even if someone learns your password." : "Log in to your Campus Market account."}
    >
      {notice && !error && !challenge && (
        <div className="auth-success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      {!challenge ? (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email or username
            </label>
            <div className="form-input-wrap">
              <Mail size={18} className="form-input-icon" aria-hidden="true" />
              <input
                id="email"
                type="text"
                name="email"
                className="form-input"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@csucc.edu.ph"
                value={form.email}
                required
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <PasswordField
            id="password"
            label="Password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            show={showPass}
            onToggleShow={() => setShowPass(!showPass)}
          />
          <div className="login-options">
            <label className="login-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember me</span>
            </label>
            {/* Offered only after two wrong tries, so it doesn't distract on a normal sign-in. */}
            {guard.failures >= FREE_FAILURES && <Link to="/forgot-password" className="login-forgot">Forgot password?</Link>}
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || coolingDown} style={{ width: "100%" }} aria-describedby={coolingDown ? "login-wait" : undefined}>
            {loading ? <span className="spinner" /> : coolingDown ? <span id="login-wait">Try again in {formatWait(waitSeconds)}</span> : "Log In"}
          </button>
        </form>
      ) : (
        <div className="auth-form">
          <div className="login-who">
            <UserRound aria-hidden="true" />
            <span>{form.email.trim()}</span>
            <button type="button" onClick={() => startOver()}>Not you?</button>
          </div>

          {method === "code" ? (
            <form className="otp-panel" onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
              <p id="login-otp-label" className="otp-title">
                <MailCheck aria-hidden="true" />
                <span>
                  {challenge.reused ? "Use the code we just sent to " : "We sent a 6-digit code to "}
                  <strong>{challenge.sent_to}</strong>
                </span>
              </p>
              <div className="otp-entry">
                <OtpInput
                  value={code} labelledBy="login-otp-label" autoFocus invalid={Boolean(stepError)} disabled={loading}
                  onChange={(value) => { setCode(value); setStepError(""); }}
                  onComplete={submitCode}
                />
                <button type="submit" className="btn btn-primary" disabled={loading || code.length !== 6}>
                  {loading ? "Checking…" : "Verify"}
                </button>
              </div>
              {stepError && <p className="field-note is-error" role="alert">{stepError}</p>}
              <div className="otp-actions">
                <ResendCode availableAt={challenge.resendAt} onResend={resend} busy={loading} />
                <span className="otp-help">Not in your inbox? Check Spam. Expires in 10 min.</span>
              </div>
              <DevCodeHint code={challenge.dev_code} onUse={(value) => { setCode(value); submitCode(value); }} />
            </form>
          ) : (
            <form className="otp-panel" onSubmit={(e) => { e.preventDefault(); finish({ security_answer: answer }); }}>
              <p className="otp-title">
                <KeyRound aria-hidden="true" />
                <span>Answer your security question</span>
              </p>
              <div className="form-group">
                <label className="form-label" htmlFor="sec-answer">{challenge.security_question}</label>
                <input
                  id="sec-answer" className="form-input" autoComplete="off" spellCheck={false} autoFocus required maxLength={100}
                  placeholder="Not case-sensitive" value={answer} aria-invalid={Boolean(stepError) || undefined}
                  onChange={(e) => { setAnswer(e.target.value); setStepError(""); }}
                />
              </div>
              {stepError && <p className="field-note is-error" role="alert">{stepError}</p>}
              <button type="submit" className="btn btn-primary" disabled={loading || !answer.trim()}>
                {loading ? "Checking…" : "Verify answer"}
              </button>
            </form>
          )}

          {challenge.security_question && (
            <div className="login-alt">
              <span>{method === "code" ? "Can't open your email?" : "Have your email nearby?"}</span>
              <button type="button" onClick={() => switchMethod(method === "code" ? "question" : "code")}>
                {method === "code" ? "Answer your security question instead" : "Use the emailed code instead"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="auth-footer">
        <p>
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
