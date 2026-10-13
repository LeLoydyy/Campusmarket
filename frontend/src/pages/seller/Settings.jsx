import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import settingsService from "../../services/settingsService.js";
import { clearTokens } from "../../services/tokens.js";
import toast from "react-hot-toast";

import {
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiImage,
  FiLock,
  FiLogOut,
  FiMail,
  FiPackage,
  FiSave,
  FiShield,
  FiShoppingBag,
  FiStar,
  FiUser,
} from "react-icons/fi";

import "./Settings.css";

// Saved on the server and checked before each of these notifications is sent.
const DEFAULT_PREFERENCES = {
  orderUpdates: true,
  reviewAlerts: true,
  stockAlerts: true,
};

const PREFERENCE_OPTIONS = [
  ["orderUpdates", "Order updates", "New orders and orders a buyer cancels", FiShoppingBag],
  ["reviewAlerts", "Review alerts", "New ratings on your products", FiStar],
  ["stockAlerts", "Low-stock alerts", "When a product or option drops to 3 left or sells out", FiPackage],
];

const fromUserPrefs = (user) => ({ ...DEFAULT_PREFERENCES, ...(user?.notification_prefs || {}) });

const extractUser = (payload) =>
  payload?.data?.user || payload?.user || payload?.data || payload || {};

const isValidImageUrl = (value) => {
  if (!value.trim()) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const samePreferences = (a, b) =>
  Object.keys(DEFAULT_PREFERENCES).every((key) => a[key] === b[key]);

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const [profile, setProfile] = useState({
    name: user?.name || "",
    avatar_url: user?.avatar_url || "",
  });
  const [preferences, setPreferences] = useState(() => fromUserPrefs(user));
  const [savedPreferences, setSavedPreferences] = useState(() => fromUserPrefs(user));
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    setProfile({
      name: user?.name || "",
      avatar_url: user?.avatar_url || "",
    });
  }, [user?.avatar_url, user?.name]);

  const prefsKey = JSON.stringify(user?.notification_prefs || {});
  useEffect(() => {
    const loaded = fromUserPrefs(user);
    setPreferences(loaded);
    setSavedPreferences(loaded);
  }, [prefsKey]);

  const initials = String(profile.name || user?.email || "S")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const profileChanged =
    profile.name.trim() !== (user?.name || "") ||
    profile.avatar_url.trim() !== (user?.avatar_url || "");
  const preferencesChanged = !samePreferences(preferences, savedPreferences);
  const enabledCount = Object.values(preferences).filter(Boolean).length;
  const status = String(user?.status || "active").toLowerCase();
  const showAvatar = profile.avatar_url && !avatarFailed;

  const handleProfileChange = ({ target: { name, value } }) => {
    setProfile((previous) => ({ ...previous, [name]: value }));
    setProfileError("");
    if (name === "avatar_url") setAvatarFailed(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const name = profile.name.trim();
    const avatarUrl = profile.avatar_url.trim();

    if (name.length < 2) {
      setProfileError("Enter a display name with at least 2 characters.");
      return;
    }
    if (!isValidImageUrl(avatarUrl)) {
      setProfileError("Enter a valid http or https image URL.");
      return;
    }

    setSavingProfile(true);
    try {
      const response = await settingsService.updateProfile({
        name,
        avatar_url: avatarUrl,
      });
      const updated = extractUser(response.data);
      updateUser(updated);
      setProfile({
        name: updated.name || name,
        avatar_url: updated.avatar_url ?? avatarUrl,
      });
      toast.success("Profile updated");
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error ||
          "Profile could not be updated. Check that PUT /api/auth/profile exists.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const resetProfile = () => {
    setProfile({ name: user?.name || "", avatar_url: user?.avatar_url || "" });
    setProfileError("");
    setAvatarFailed(false);
  };

  const savePreferences = async () => {
    setSavingPreferences(true);
    try {
      const { data } = await settingsService.updateNotificationPrefs(preferences);
      updateUser({ notification_prefs: data.notification_prefs });
      setSavedPreferences(fromUserPrefs(data));
      toast.success("Notification settings saved");
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Notification settings could not be saved.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout?.();
    } finally {
      clearTokens();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="dashboard-layout seller-settings-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Settings</h1>
              <p>
                Manage your seller profile, notifications, and account access.
              </p>
            </div>
          </div>
        </header>

        <div className="dashboard-content seller-settings-content">
          <section className="seller-settings-hero">
            <div className="seller-settings-avatar">
              {showAvatar ? (
                <img
                  src={profile.avatar_url}
                  alt="Seller profile"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                initials
              )}
            </div>
            <div className="seller-settings-identity">
              <span className="seller-settings-eyebrow">Seller account</span>
              <h2>{profile.name || "Campus seller"}</h2>
              <p>
                <FiMail aria-hidden="true" /> {user?.email || "Email unavailable"}
              </p>
            </div>
            <div className="seller-settings-account-status">
              <FiShield aria-hidden="true" />
              <span>
                <strong>Account protected</strong>
                <small>Authenticated seller access</small>
              </span>
            </div>
          </section>

          <div className="seller-settings-layout">
            <div className="seller-settings-main">
              <form className="seller-settings-card" onSubmit={saveProfile}>
                <div className="seller-settings-card-heading">
                  <span>
                    <FiUser aria-hidden="true" />
                  </span>
                  <div>
                    <h2>Public profile</h2>
                    <p>Information shown with your seller account.</p>
                  </div>
                </div>

                <div className="seller-settings-fields">
                  <label>
                    <span>Full name on campus records</span>
                    <input
                      name="name"
                      value={profile.name}
                      onChange={handleProfileChange}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                    <small>Changing your name requires a new administrator review.</small>
                  </label>
                  <label>
                    <span>Email address</span>
                    <div className="seller-settings-input-icon is-locked">
                      <FiMail aria-hidden="true" />
                      <input value={user?.email || ""} disabled />
                      <em><FiLock aria-hidden="true" /> Locked</em>
                    </div>
                    <small>Email changes require account verification.</small>
                  </label>
                  <div className="seller-settings-photo wide">
                    <div className="seller-settings-photo-preview" aria-hidden="true">
                      {showAvatar ? (
                        <img src={profile.avatar_url} alt="" onError={() => setAvatarFailed(true)} />
                      ) : (
                        initials
                      )}
                    </div>
                    <label>
                      <span>Profile image URL</span>
                      <div className="seller-settings-input-icon">
                        <FiImage aria-hidden="true" />
                        <input
                          name="avatar_url"
                          value={profile.avatar_url}
                          onChange={handleProfileChange}
                          placeholder="https://example.com/profile.jpg"
                          inputMode="url"
                        />
                      </div>
                      <small>
                        {avatarFailed
                          ? "This image could not be loaded. Check the link."
                          : "Paste a link to a square photo. Your initials are used when it's empty."}
                      </small>
                    </label>
                  </div>
                </div>

                {profileError && (
                  <p className="seller-settings-form-error" role="alert">{profileError}</p>
                )}
                <div className="seller-settings-card-actions">
                  <span className={`seller-settings-dirty${profileChanged ? " is-visible" : ""}`}>
                    {profileChanged ? "You have unsaved changes" : ""}
                  </span>
                  {profileChanged && (
                    <button className="btn btn-ghost" type="button" onClick={resetProfile} disabled={savingProfile}>
                      Discard
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingProfile || !profileChanged}
                  >
                    {savingProfile ? (
                      <span className="seller-settings-spinner" />
                    ) : (
                      <FiSave aria-hidden="true" />
                    )}
                    {savingProfile ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </form>

              <section className="seller-settings-card">
                <div className="seller-settings-card-heading">
                  <span className="gold">
                    <FiBell aria-hidden="true" />
                  </span>
                  <div>
                    <h2>Notifications</h2>
                    <p>Choose which notifications you get. Order status messages to buyers are always sent.</p>
                  </div>
                  <span className="seller-settings-count">{enabledCount} of {PREFERENCE_OPTIONS.length} on</span>
                </div>
                <div className="seller-settings-toggles">
                  {PREFERENCE_OPTIONS.map(([key, title, description, Icon]) => (
                    <label className={`seller-settings-toggle${preferences[key] ? " is-on" : ""}`} key={key}>
                      <span className="seller-settings-toggle-icon" aria-hidden="true"><Icon /></span>
                      <span className="seller-settings-toggle-text">
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={preferences[key]}
                        onChange={() =>
                          setPreferences((previous) => ({
                            ...previous,
                            [key]: !previous[key],
                          }))
                        }
                      />
                      <i aria-hidden="true">
                        <b />
                      </i>
                    </label>
                  ))}
                </div>
                <div className="seller-settings-card-actions">
                  <span className={`seller-settings-dirty${preferencesChanged ? " is-visible" : ""}`}>
                    {preferencesChanged ? "You have unsaved changes" : <><FiCheckCircle aria-hidden="true" /> Preferences saved</>}
                  </span>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={savePreferences}
                    disabled={savingPreferences || !preferencesChanged}
                  >
                    <FiCheck aria-hidden="true" /> Save preferences
                  </button>
                </div>
              </section>
            </div>

            <aside className="seller-settings-aside">
              <section>
                <div className="seller-settings-aside-head">
                  <span>
                    <FiLock aria-hidden="true" />
                  </span>
                  <h3>Account security</h3>
                </div>
                <p>
                  Your login is protected by the access token issued by Campus
                  Market.
                </p>
                <dl>
                  <div>
                    <dt>Role</dt>
                    <dd><span className="seller-settings-pill">{user?.role || "seller"}</span></dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <span className={`seller-settings-pill ${["approved", "active"].includes(status) ? "is-good" : "is-warn"}`}>
                        <i aria-hidden="true" />{user?.status || "Active"}
                      </span>
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="danger">
                <div className="seller-settings-aside-head">
                  <span>
                    <FiLogOut aria-hidden="true" />
                  </span>
                  <h3>Sign out</h3>
                </div>
                <p>End your current session on this device.</p>
                <button type="button" onClick={handleLogout}>
                  <FiLogOut aria-hidden="true" /> Sign out of this device
                </button>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
