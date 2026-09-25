import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, IdCard, Lock, Mail, ShoppingBag, Store, User } from "lucide-react";
import AuthLayout from "../../components/layout/AuthLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const ROLE_CARDS = [
  { value: "buyer", title: "I want to buy", text: "Order food, merch and student-made goods from campus stalls.", icon: ShoppingBag },
  { value: "seller", title: "I want to sell", text: "Open a stall, list products and take orders from classmates.", icon: Store },
];
const STEPS = ["Your account", "CSUCC verification"];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "",
    role: "buyer", campus_id: "", affiliation: "student", department: "", store_name: "", campus_location: "",
  });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const goNext = (e) => {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    if (form.password !== form.confirmPassword) return setError("The passwords don't match.");
    setError("");
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register({
        name: form.name, email: form.email, password: form.password,
        role: form.role, campus_id: form.campus_id, affiliation: form.affiliation, department: form.department,
        store_name: form.store_name, campus_location: form.campus_location,
      });
      navigate("/account-status");
    } catch (err) {
      setError(err.response?.data?.details?.map((detail) => detail.message).join(" ") || err.response?.data?.error || "Registration failed. Please try again.");
      // Account problems (e.g. email already used) are fixed on step 1.
      if (/email|password|name/i.test(err.response?.data?.error || "")) setStep(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Join Campus Market" subtitle="For students, faculty and employees of CSUCC.">
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
        <form onSubmit={goNext} className="auth-form" noValidate={false}>
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
            <label className="form-label" htmlFor="reg-email">Email</label>
            <div className="form-input-wrap">
              <Mail size={18} className="form-input-icon" aria-hidden="true" />
              <input id="reg-email" type="email" className="form-input" autoComplete="email" placeholder="you@example.com" value={form.email} required onChange={set("email")} />
            </div>
          </div>
          <div className="reg-two">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="form-input-wrap">
                <Lock size={18} className="form-input-icon" aria-hidden="true" />
                <input id="reg-password" type={showPass ? "text" : "password"} className="form-input" autoComplete="new-password" placeholder="8+ characters" minLength={8} maxLength={100} value={form.password} required onChange={set("password")} />
                <button type="button" className="form-input-toggle" onClick={() => setShowPass(!showPass)} aria-label={showPass ? "Hide password" : "Show password"}>
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm password</label>
              <div className="form-input-wrap">
                <Lock size={18} className="form-input-icon" aria-hidden="true" />
                <input id="confirm" type={showPass ? "text" : "password"} className="form-input" autoComplete="new-password" placeholder="Type it again" value={form.confirmPassword} required onChange={set("confirmPassword")} />
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg reg-full">Continue <ArrowRight aria-hidden="true" /></button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <p className="reg-intro"><IdCard aria-hidden="true" /> An administrator checks your ID against CSUCC records. Only you and administrators can see it. Buying{form.role === "seller" ? " and selling" : ""} opens once you're approved.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="affiliation">Campus affiliation</label>
            <select id="affiliation" className="form-input form-select" value={form.affiliation} onChange={set("affiliation")}>
              <option value="student">Student</option><option value="faculty">Faculty</option><option value="employee">Employee</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="campus-id">Student / employee ID number</label>
            <input id="campus-id" className="form-input" required minLength={3} maxLength={50} placeholder="e.g. 2024-01234" value={form.campus_id} onChange={set("campus_id")} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="department">College, program or office</label>
            <input id="department" className="form-input" required minLength={2} maxLength={120} placeholder="e.g. BS Information Technology" value={form.department} onChange={set("department")} />
          </div>
          {form.role === "seller" && (
            <fieldset className="reg-store">
              <legend><Store aria-hidden="true" /> Your campus stall</legend>
              <div className="form-group">
                <label className="form-label" htmlFor="store-name">Stall name</label>
                <input id="store-name" className="form-input" required minLength={2} maxLength={100} placeholder="e.g. Brew Corner" value={form.store_name} onChange={set("store_name")} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="store-location">Where buyers pick up</label>
                <input id="store-location" className="form-input" required minLength={2} maxLength={150} placeholder="e.g. Main Canteen, Stall 4" value={form.campus_location} onChange={set("campus_location")} />
              </div>
              <p className="reg-note">You start on the Free plan (15 listings). Your stall goes public after approval.</p>
            </fieldset>
          )}
          <div className="reg-actions">
            <button type="button" className="btn btn-outline btn-lg" onClick={() => { setError(""); setStep(0); }} disabled={loading}><ArrowLeft aria-hidden="true" /> Back</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
          </div>
        </form>
      )}

      <div className="auth-footer">
        <p>Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </AuthLayout>
  );
}
