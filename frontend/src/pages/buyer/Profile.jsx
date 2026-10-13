import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiImage, FiKey, FiMail, FiMapPin, FiPhone, FiSave, FiUser } from "react-icons/fi";
import Navbar from "../../components/common/Navbar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { settingsService } from "../../services/api.js";
import "../seller/Settings.css";
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

/** Buyer profile: name, photo, phone and the campus spot deliveries go to. */
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

  return (
    <div className="profile-shell">
      <Navbar />
      <main className="profile-page seller-settings-content">
        <section className="seller-settings-hero">
          <div className="seller-settings-avatar">
            {showAvatar ? <img src={form.avatar_url} alt="Your profile" onError={() => setAvatarFailed(true)} /> : initials}
          </div>
          <div className="seller-settings-identity">
            <span className="seller-settings-eyebrow">Buyer account</span>
            <h2>{form.name || "Campus buyer"}</h2>
            <p><FiMail aria-hidden="true" /> {user?.email}</p>
          </div>
        </section>

        <div className="seller-settings-layout">
          <form className="seller-settings-card" onSubmit={save}>
            <div className="seller-settings-card-heading">
              <span><FiUser aria-hidden="true" /></span>
              <div>
                <h2>Your profile</h2>
                <p>Sellers see your name, and your phone and location on delivery orders.</p>
              </div>
            </div>

            <div className="seller-settings-fields">
              <label>
                <span>Full name on campus records</span>
                <input name="name" value={form.name} onChange={change} autoComplete="name" />
                {nameChanged
                  ? <small className="profile-warning"><FiAlertTriangle aria-hidden="true" /> An administrator will recheck your account after this change.</small>
                  : <small>Changing your name requires a new administrator review.</small>}
              </label>
              <label>
                <span>Phone number</span>
                <div className="seller-settings-input-icon">
                  <FiPhone aria-hidden="true" />
                  <input name="phone" value={form.phone} onChange={change} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" maxLength={20} />
                </div>
                <small>So a seller can reach you about an order.</small>
              </label>
              <label className="wide">
                <span>Campus delivery location</span>
                <div className="seller-settings-input-icon">
                  <FiMapPin aria-hidden="true" />
                  <input name="address" value={form.address} onChange={change} placeholder="e.g. Library 2nd floor, near the reading area" maxLength={200} />
                </div>
                <small>Filled in for you at checkout when you choose delivery. You can change it per order.</small>
              </label>
              <div className="seller-settings-photo wide">
                <div className="seller-settings-photo-preview" aria-hidden="true">
                  {showAvatar ? <img src={form.avatar_url} alt="" onError={() => setAvatarFailed(true)} /> : initials}
                </div>
                <label>
                  <span>Profile photo link</span>
                  <div className="seller-settings-input-icon">
                    <FiImage aria-hidden="true" />
                    <input name="avatar_url" value={form.avatar_url} onChange={change} inputMode="url" placeholder="https://example.com/photo.jpg" />
                  </div>
                  <small>{avatarFailed ? "This image could not be loaded. Check the link." : "Leave empty to use your initials."}</small>
                </label>
              </div>
            </div>

            {error && <p className="seller-settings-form-error" role="alert">{error}</p>}
            <div className="seller-settings-card-actions">
              <span className={`seller-settings-dirty${changed ? " is-visible" : ""}`}>{changed ? "You have unsaved changes" : ""}</span>
              {changed && <button type="button" className="btn btn-ghost" onClick={() => { setForm(saved); setError(""); }} disabled={saving}>Discard</button>}
              <button className="btn btn-primary" type="submit" disabled={saving || !changed}>
                {saving ? <span className="seller-settings-spinner" /> : <FiSave aria-hidden="true" />}
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>

          <aside className="seller-settings-aside">
            <section>
              <div className="seller-settings-aside-head">
                <span><FiKey aria-hidden="true" /></span>
                <h3>Password & security</h3>
              </div>
              <p>Change your password and recovery questions, or see where you're signed in.</p>
              <div className="profile-links">
                <Link to="/account/password" className="btn btn-outline btn-sm">Change password</Link>
                <Link to="/account/logins" className="btn btn-ghost btn-sm">Login history</Link>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
