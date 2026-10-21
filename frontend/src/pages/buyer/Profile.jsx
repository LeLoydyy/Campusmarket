import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiBell, FiChevronRight, FiHeart, FiImage, FiKey, FiMail, FiMapPin, FiMessageSquare, FiPackage, FiPhone, FiSave, FiTruck, FiUser } from "react-icons/fi";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { settingsService } from "../../services/api.js";
import "./Profile.css";

const isValidImageUrl = (value) => {
  if (!value.trim()) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

const fromUser = (user) => ({
  name: user?.name || "",
  avatar_url: user?.avatar_url || "",
  phone: user?.phone || "",
  address: user?.address || "",
});

// Common meeting spots on campus, as one-tap starting points for the delivery location.
const CAMPUS_SPOTS = ["Library", "Main Canteen", "CSUCC Covered Court", "Activity Center"];

const SHORTCUTS = [
  { to: "/orders", label: "My orders", icon: FiPackage },
  { to: "/favorites", label: "Favorites", icon: FiHeart },
  { to: "/messages", label: "Messages", icon: FiMessageSquare },
  { to: "/notifications", label: "Notifications", icon: FiBell },
];

/** Buyer profile: name, photo, phone, and the optional campus spot used for delivery orders. */
export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState(() => fromUser(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => { setForm(fromUser(user)); }, [user?.name, user?.avatar_url, user?.phone, user?.address]);

  const saved = fromUser(user);
  const changed = Object.keys(saved).some((key) => form[key].trim() !== saved[key]);
  const nameChanged = form.name.trim() !== saved.name;
  const initials = (form.name || user?.email || "B").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const showAvatar = form.avatar_url && !avatarFailed;

  const change = ({ target: { name, value } }) => {
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
    if (name === "avatar_url") setAvatarFailed(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    if (payload.name.length < 2) return setError("Enter your full name (at least 2 characters).");
    if (!isValidImageUrl(payload.avatar_url)) return setError("Enter a valid http or https image link.");
    if (!/^[0-9+\-\s()]*$/.test(payload.phone)) return setError("Use digits, spaces, + or - for your phone number.");
    if (nameChanged && !window.confirm("Changing your name sends your account back for an administrator to recheck your campus records. You can't place orders until it's approved again. Continue?")) return;
    setSaving(true);
    try {
      const { data } = await settingsService.updateProfile(payload);
      updateUser(data?.user || data);
      toast.success("Profile saved");
    } catch (requestError) {
      setError(requestError.response?.data?.details?.[0]?.message || requestError.response?.data?.error || "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const avatar = showAvatar ? <img src={form.avatar_url} alt="" onError={() => setAvatarFailed(true)} /> : initials;

  return (
    <div className="pf-shell">
      <Navbar />
      <main className="pf-page">
        <section className="pf-hero" aria-label="Your account">
          <span className="pf-avatar" aria-hidden="true">{avatar}</span>
          <div className="pf-identity">
            <p className="cm-eyebrow">Buyer account</p>
            <h1>{form.name || "Campus buyer"}</h1>
            <p><FiMail aria-hidden="true" /> {user?.email}</p>
          </div>
        </section>

        <div className="pf-layout">
          <form className="pf-form" onSubmit={save} noValidate>
            <section className="pf-card" aria-labelledby="pf-about">
              <header className="pf-card-head">
                <span><FiUser aria-hidden="true" /></span>
                <div>
                  <h2 id="pf-about">Your details</h2>
                  <p>Sellers see your name on every order.</p>
                </div>
              </header>

              <div className="pf-grid">
                <label className="pf-field">
                  <span>Full name on campus records</span>
                  <input name="name" value={form.name} onChange={change} autoComplete="name" />
                  {nameChanged
                    ? <small className="pf-warn"><FiAlertTriangle aria-hidden="true" /> An administrator will recheck your account after this change.</small>
                    : <small>Changing your name needs a new administrator review.</small>}
                </label>
                <label className="pf-field">
                  <span>Phone number <em>optional</em></span>
                  <span className="pf-input-icon">
                    <FiPhone aria-hidden="true" />
                    <input name="phone" value={form.phone} onChange={change} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" maxLength={20} />
                  </span>
                  <small>So a seller can reach you if something comes up with your order.</small>
                </label>
                <div className="pf-photo">
                  <span className="pf-photo-preview" aria-hidden="true">{avatar}</span>
                  <label className="pf-field">
                    <span>Profile photo link <em>optional</em></span>
                    <span className="pf-input-icon">
                      <FiImage aria-hidden="true" />
                      <input name="avatar_url" value={form.avatar_url} onChange={change} inputMode="url" placeholder="https://example.com/photo.jpg" />
                    </span>
                    <small className={avatarFailed ? "pf-warn" : ""}>{avatarFailed ? "This image couldn't be loaded. Check the link." : "Leave empty to show your initials."}</small>
                  </label>
                </div>
              </div>
            </section>

            <section className="pf-card pf-card--delivery" aria-labelledby="pf-delivery">
              <header className="pf-card-head">
                <span><FiTruck aria-hidden="true" /></span>
                <div>
                  <h2 id="pf-delivery">Campus delivery <em>optional</em></h2>
                  <p>Some sellers can bring your order to you on campus. Pickup orders never use this.</p>
                </div>
              </header>
              <label className="pf-field">
                <span>Where should sellers bring your order?</span>
                <span className="pf-input-icon">
                  <FiMapPin aria-hidden="true" />
                  <input name="address" value={form.address} onChange={change} placeholder="e.g. Library 2nd floor, near the reading area" maxLength={200} />
                </span>
              </label>
              <div className="pf-spots" role="group" aria-label="Common campus spots">
                {CAMPUS_SPOTS.map((spot) => (
                  <button key={spot} type="button" className={form.address.trim() === spot ? "is-selected" : ""} onClick={() => change({ target: { name: "address", value: spot } })}>
                    {spot}
                  </button>
                ))}
              </div>
              <ul className="pf-how">
                <li>Filled in for you when you choose <strong>Campus delivery</strong> at checkout.</li>
                <li>You can change it for any single order.</li>
                <li>Only the seller of a delivery order sees it, along with your phone number.</li>
              </ul>
            </section>

            {error && <p className="pf-error" role="alert">{error}</p>}

            <div className={`pf-savebar${changed ? " is-visible" : ""}`}>
              <span>{changed ? "You have unsaved changes" : "All changes saved"}</span>
              {changed && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForm(saved); setError(""); }} disabled={saving}>Discard</button>}
              <button className="btn btn-primary" type="submit" disabled={saving || !changed}>
                {saving ? <span className="pf-spinner" /> : <FiSave aria-hidden="true" />}
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>

          <aside className="pf-aside">
            <nav className="pf-card pf-shortcuts" aria-label="Account shortcuts">
              {SHORTCUTS.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to}><Icon aria-hidden="true" /> <span>{label}</span> <FiChevronRight aria-hidden="true" /></Link>
              ))}
            </nav>
            <section className="pf-card" aria-labelledby="pf-security">
              <header className="pf-card-head">
                <span><FiKey aria-hidden="true" /></span>
                <div><h2 id="pf-security">Password & security</h2></div>
              </header>
              <p className="pf-muted">Change your password and recovery questions, or see where you're signed in.</p>
              <div className="pf-security-links">
                <Link to="/account/password" className="btn btn-outline btn-sm">Change password</Link>
                <Link to="/account/logins" className="cm-link">Login history</Link>
              </div>
            </section>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
