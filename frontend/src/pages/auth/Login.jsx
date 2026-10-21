import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import PasswordField from "../../components/auth/PasswordField.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
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
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const notice = NOTICES[searchParams.get("reason")];
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(getRememberPreference);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Wrong-password tracking for this tab (kept across a refresh).
  const [guard, setGuard] = useState(readGuard);
  // Misses on this visit only, so "Forgot password?" starts hidden again after a refresh.
  const [misses, setMisses] = useState(0);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (coolingDown) return;
    setLoading(true);
    setError("");
    try {
      const data = await login(form.email.trim(), form.password, remember);
      updateGuard({ failures: 0, until: 0 });
      setRememberPreference(remember);
      goHome(data.user);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 423) {
        const failures = guard.failures + 1;
        const wait = Math.max(cooldownFor(failures), err.response.data?.retry_after || 0);
        updateGuard({ failures, until: wait ? Date.now() + wait * 1000 : 0 });
        setMisses((n) => n + 1);
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

  return (
    <AuthLayout
      title="Welcome Back!"
      subtitle="Log in to your Campus Market account."
    >
      {notice && !error && (
        <div className="auth-success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

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
          {misses >= FREE_FAILURES && <Link to="/forgot-password" className="login-forgot">Forgot password?</Link>}
        </div>
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || coolingDown} style={{ width: "100%" }} aria-describedby={coolingDown ? "login-wait" : undefined}>
          {loading ? <span className="spinner" /> : coolingDown ? <span id="login-wait">Try again in {formatWait(waitSeconds)}</span> : "Log In"}
        </button>
      </form>

      <div className="auth-footer">
        <p>
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
