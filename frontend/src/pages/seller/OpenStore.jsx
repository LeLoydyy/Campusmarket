import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, PackagePlus, Send } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import StallCard from "../../components/ui/StallCard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../services/api.js";
import "./OpenStore.css";

const CATEGORIES = [
  ["food", "Food & drinks"],
  ["merchandise", "Merchandise"],
  ["services", "Services"],
  ["mixed", "Mixed"],
  ["other", "Other"],
];
// Places already used around CSUCC, as one-tap starting points.
const LOCATIONS = ["Main Canteen", "CSUCC Covered Court", "Activity Center", "Library"];
const ABOUT_MAX = 1000;

const STEPS = [
  { icon: Send, title: "Submit your store", text: "Takes about a minute." },
  { icon: ClipboardCheck, title: "An admin approves it", text: "You'll get a notification." },
  { icon: PackagePlus, title: "Add your products", text: "Buyers can order right away." },
];

export default function OpenStore() {
  const { updateUser, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", location: "", description: "", category: "food" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setError(""); };

  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError("Give your store a name (at least 2 characters).");
    if (form.location.trim().length < 2) return setError("Tell buyers where to find you on campus.");
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/start-selling", { ...form, name: form.name.trim(), location: form.location.trim(), description: form.description.trim() });
      updateUser(data.user);
      navigate("/seller/stall");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to submit your store.");
    } finally {
      setBusy(false);
    }
  };

  // The card buyers will see once approved (no id, so it isn't a link).
  const preview = {
    name: form.name.trim() || "Your store name",
    category: form.category,
    location: form.location.trim() || "Your campus spot",
    description: form.description.trim(),
    seller_name: user?.name,
    status: "approved",
  };

  return (
    <div className="os-shell">
      <Navbar />
      <main className="os-page">
        <header className="os-hero">
          <p className="cm-eyebrow">Sell on Campus Market</p>
          <h1>Open your campus store</h1>
          <p className="os-lede">
            Free for CSUCC students. New stores start on the Free plan with 5 listings.
            {user?.role === "buyer" && " Your account switches to Seller, with store tools and order management."}
          </p>
          <ol className="os-steps">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title}>
                <span className="os-step-num" aria-hidden="true">{index + 1}</span>
                <Icon aria-hidden="true" />
                <span><strong>{title}</strong><small>{text}</small></span>
              </li>
            ))}
          </ol>
        </header>

        <div className="os-layout">
          <form className="os-card" onSubmit={submit} noValidate>
            <label className="os-field">
              <span>Store name <em>*</em></span>
              <input required minLength={2} maxLength={100} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sweet Finds PH" autoFocus />
            </label>

            <fieldset className="os-field os-chips-field">
              <legend>Category <em>*</em></legend>
              <div className="os-chips">
                {CATEGORIES.map(([value, label]) => (
                  <label key={value} className={form.category === value ? "is-selected" : ""}>
                    <input type="radio" name="category" value={value} checked={form.category === value} onChange={() => set("category", value)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="os-field">
              <label htmlFor="os-location">Where on campus? <em>*</em></label>
              <input id="os-location" required minLength={2} maxLength={150} placeholder="e.g. Main Canteen, Stall 4" value={form.location} onChange={(e) => set("location", e.target.value)} />
              <div className="os-spots" role="group" aria-label="Common campus spots">
                {LOCATIONS.map((spot) => (
                  <button key={spot} type="button" className={form.location.trim() === spot ? "is-selected" : ""} onClick={() => set("location", spot)}>{spot}</button>
                ))}
              </div>
              <small>Buyers pick up their orders here, so add a stall number if you have one.</small>
            </div>

            <label className="os-field os-about">
              <span>About your store <em className="os-optional">optional</em></span>
              <textarea rows={3} maxLength={ABOUT_MAX} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What you sell and what makes it special, e.g. Homemade brownies baked every morning." />
              <i>{form.description.length}/{ABOUT_MAX}</i>
            </label>

            {error && <p className="os-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg os-submit" disabled={busy}>
              {busy ? "Submitting…" : <><Send aria-hidden="true" /> Submit store for approval</>}
            </button>
          </form>

          <aside className="os-preview" aria-label="Preview">
            <p className="os-preview-label">How buyers will see your stall</p>
            <div className="os-preview-card"><StallCard stall={preview} detailed /></div>
            <ul className="os-checks">
              <li><CheckCircle2 aria-hidden="true" /> Add a logo and cover photo after approval</li>
              <li><CheckCircle2 aria-hidden="true" /> Upgrade to Premium any time for more listings</li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
