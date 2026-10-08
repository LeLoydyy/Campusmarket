import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Mail, MailCheck } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import OtpInput, { DevCodeHint, ResendCode } from "../../components/auth/OtpInput.jsx";
import PasswordField, { PasswordStrength, passwordMeetsRules } from "../../components/auth/PasswordField.jsx";
import { authService } from "../../services/api";

const apiError = (err, fallback) =>
  err.response?.data?.details?.map((detail) => detail.message).join(" ") || err.response?.data?.error ||
  (!err.response ? "Unable to connect to the server. Please try again." : fallback);

/**
 * Forgot password, for buyers, sellers and administrators alike:
 * 1. the registered email gets a 6-digit code, 2. the code is checked,
 * 3. two of the three security answers (or the one older question) and a new password.
 */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState("");
  const [questions, setQuestions] = useState({ questions: [], answers_needed: 0 });
  const [answers, setAnswers] = useState(["", "", ""]);
  const [shown, setShown] = useState(false);
  const [password, setPassword] = useState({ value: "", confirm: "", show: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async (fn) => {
    setLoading(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(apiError(err, "That didn't work. Please try again."));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    run(async () => {
      const { data } = await authService.forgotStart(email.trim().toLowerCase());
      setSent({ ...data, resendAt: Date.now() + (data.resend_in || 60) * 1000 });
      setCode("");
      setStep("code");
    });
  };

  const checkCode = (value = code) => {
    if (value.length !== 6) return setError("Enter all 6 digits.");
    run(async () => {
      const { data } = await authService.forgotVerify(email.trim().toLowerCase(), value);
      setQuestions(data);
      setStep("answers");
    }).then((ok) => { if (!ok) setCode(""); });
  };

  const finish = (e) => {
    e.preventDefault();
    if (!passwordMeetsRules(password.value)) return setError("Your new password needs 8+ characters, a letter and a number.");
    if (password.value !== password.confirm) return setError("The new passwords don't match.");
    const answered = answers.slice(0, questions.questions.length).filter((answer) => answer.trim()).length;
    if (answered < questions.answers_needed) return setError(`Answer at least ${questions.answers_needed} of the questions.`);
    run(async () => {
      await authService.forgotComplete({ email: email.trim().toLowerCase(), code, answers: answers.slice(0, questions.questions.length), new_password: password.value });
      navigate("/login?reason=password_reset", { replace: true });
    });
  };

  const subtitle = {
    email: "Enter the email you registered with. We'll send a 6-digit code to it.",
    code: "Check your inbox for the code.",
    answers: questions.questions.length
      ? `Answer at least ${questions.answers_needed} of your security questions, then choose a new password.`
      : "Choose a new password.",
  }[step];

  return (
    <AuthLayout title="Forgot password" subtitle={subtitle}>
      {error && <div className="auth-error" role="alert">{error}</div>}

      {step === "email" && (
        <form onSubmit={sendCode} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="fp-email">Registered email</label>
            <div className="form-input-wrap">
              <Mail size={18} className="form-input-icon" aria-hidden="true" />
              <input id="fp-email" type="email" className="form-input" placeholder="you@csucc.edu.ph" autoComplete="email" autoFocus
                value={email} required onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
            {loading ? <span className="spinner" /> : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && sent && (
        <form className="otp-panel" onSubmit={(e) => { e.preventDefault(); checkCode(); }}>
          <p id="fp-otp-label" className="otp-title">
            <MailCheck aria-hidden="true" />
            <span>If <strong>{sent.sent_to}</strong> has an account, we sent it a 6-digit code.</span>
          </p>
          <div className="otp-entry">
            <OtpInput value={code} labelledBy="fp-otp-label" autoFocus invalid={Boolean(error)} disabled={loading}
              onChange={(value) => { setCode(value); setError(""); }} onComplete={checkCode} />
            <button type="submit" className="btn btn-primary" disabled={loading || code.length !== 6}>{loading ? "Checking…" : "Verify"}</button>
          </div>
          <div className="otp-actions">
            <ResendCode availableAt={sent.resendAt} onResend={sendCode} busy={loading} />
            <span className="otp-help">Not in your inbox? Check Spam. Expires in 10 min.</span>
          </div>
          <DevCodeHint code={sent.dev_code} onUse={(value) => { setCode(value); checkCode(value); }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep("email"); setError(""); }}>Use a different email</button>
        </form>
      )}

      {step === "answers" && (
        <form onSubmit={finish} className="auth-form">
          {questions.questions.length > 0 && (
            <fieldset className="reg-security">
              <legend><KeyRound aria-hidden="true" /> Security questions</legend>
              <p className="reg-note">Any {questions.answers_needed} correct answer{questions.answers_needed === 1 ? "" : "s"} will do. Not case-sensitive.</p>
              {questions.questions.map((question, index) => (
                <div className="form-group" key={question}>
                  <label className="form-label" htmlFor={`fp-a${index}`}>{question}</label>
                  <div className="form-input-wrap">
                    <input id={`fp-a${index}`} type={shown ? "text" : "password"} className="form-input rq-answer" autoComplete="off" spellCheck={false}
                      maxLength={100} value={answers[index]} autoFocus={index === 0}
                      onChange={(e) => setAnswers(answers.map((answer, i) => (i === index ? e.target.value : answer)))} />
                    {index === 0 && (
                      <button type="button" className="form-input-toggle" onClick={() => setShown(!shown)} aria-label={shown ? "Hide answers" : "Show answers"} aria-pressed={shown}>
                        {shown ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </fieldset>
          )}
          <PasswordField id="fp-new" label="New password" autoComplete="new-password" required value={password.value}
            onChange={(e) => setPassword({ ...password, value: e.target.value })} show={password.show}
            onToggleShow={() => setPassword({ ...password, show: !password.show })} describedBy="fp-strength" />
          <PasswordStrength id="fp-strength" value={password.value} />
          <PasswordField id="fp-confirm" label="Confirm new password" autoComplete="new-password" required value={password.confirm}
            onChange={(e) => setPassword({ ...password, confirm: e.target.value })} show={password.show} />
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={loading}>
            {loading ? <span className="spinner" /> : "Reset password"}
          </button>
        </form>
      )}

      <div className="auth-footer">
        <p><Link to="/login">Back to login</Link></p>
      </div>
    </AuthLayout>
  );
}
