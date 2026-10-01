import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import settingsService from "../../services/settingsService.js";
import { clearTokens } from "../../services/tokens.js";
import toast from "react-hot-toast";

import {
  FiBell,
  FiCheck,
  FiImage,
  FiLock,
  FiLogOut,
  FiMail,
  FiSave,
  FiShield,
  FiUser,
} from "react-icons/fi";

import "./Settings.css";

const DEFAULT_PREFERENCES = {
  orderUpdates: true,
  newMessages: true,
  eventUpdates: true,
  reviewAlerts: true,
  weeklySummary: false,
};

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

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const [profile, setProfile] = useState({
    name: user?.name || "",
    avatar_url: user?.avatar_url || "",
  });
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profileError, setProfileError] = useState("");

  const preferenceKey = useMemo(
    () => `campus-market:seller-preferences:${user?.id || "current"}`,
    [user?.id],
  );

  useEffect(() => {
    setProfile({
      name: user?.name || "",
      avatar_url: user?.avatar_url || "",
    });
  }, [user?.avatar_url, user?.name]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(preferenceKey) || "null");
      if (stored) setPreferences({ ...DEFAULT_PREFERENCES, ...stored });
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    }
  }, [preferenceKey]);

  const initials = String(profile.name || user?.email || "S")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

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

  const savePreferences = () => {
    setSavingPreferences(true);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
      toast.success("Notification preferences saved");
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
              {profile.avatar_url && !avatarFailed ? (
                <img
                  src={profile.avatar_url}
                  alt="Seller profile"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                initials
              )}
            </div>
            <div>
              <span>Seller account</span>
              <h2>{profile.name || "Campus seller"}</h2>
              <p>
                <FiMail /> {user?.email || "Email unavailable"}
              </p>
            </div>
            <div className="seller-settings-account-status">
              <FiShield />
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
                    <FiUser />
                  </span>
                  <div>
                    <h2>Public profile</h2>
                    <p>Information shown with your seller account.</p>
                  </div>
                </div>

                <div className="seller-settings-fields">
                  <label>
                    <span>Full name on campus records</span>
                    <small>Changing your name requires a new administrator review.</small>
                    <input
                      name="name"
                      value={profile.name}
                      onChange={handleProfileChange}
                      placeholder="Your name"
                    />
                  </label>
                  <label>
                    <span>Email address</span>
                    <input value={user?.email || ""} disabled />
                    <small>Email changes require account verification.</small>
                  </label>
                  <label className="wide">
                    <span>Profile image URL</span>
                    <div className="seller-settings-image-field">
                      <FiImage />
                      <input
                        name="avatar_url"
                        value={profile.avatar_url}
                        onChange={handleProfileChange}
                        placeholder="https://example.com/profile.jpg"
                      />
                    </div>
                  </label>
                </div>

                {profileError && (
                  <p className="seller-settings-form-error">{profileError}</p>
                )}
                <div className="seller-settings-card-actions">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <span className="seller-settings-spinner" />
                    ) : (
                      <FiSave />
                    )}
                    {savingProfile ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </form>

              <section className="seller-settings-card">
                <div className="seller-settings-card-heading">
                  <span className="gold">
                    <FiBell />
                  </span>
                  <div>
                    <h2>Notifications</h2>
                    <p>Choose which seller activities you want to follow.</p>
                  </div>
                </div>
                <div className="seller-settings-toggles">
                  {[
                    [
                      "orderUpdates",
                      "Order updates",
                      "Status changes and new buyer orders",
                    ],
                    [
                      "newMessages",
                      "New messages",
                      "Buyer questions and conversation activity",
                    ],
                    [
                      "eventUpdates",
                      "Event updates",
                      "Application and reservation announcements",
                    ],
                    [
                      "reviewAlerts",
                      "Review alerts",
                      "New ratings on your products",
                    ],
                    [
                      "weeklySummary",
                      "Weekly summary",
                      "A weekly overview of seller performance",
                    ],
                  ].map(([key, title, description]) => (
                    <label className="seller-settings-toggle" key={key}>
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={preferences[key]}
                        onChange={() =>
                          setPreferences((previous) => ({
                            ...previous,
                            [key]: !previous[key],
                          }))
                        }
                      />
                      <i>
                        <b />
                      </i>
                    </label>
                  ))}
                </div>
                <div className="seller-settings-card-actions">
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={savePreferences}
                    disabled={savingPreferences}
                  >
                    <FiCheck /> Save preferences
                  </button>
                </div>
              </section>
            </div>

            <aside className="seller-settings-aside">
              <section>
                <span>
                  <FiLock />
                </span>
                <h3>Account security</h3>
                <p>
                  Your login is protected by the access token issued by Campus
                  Market.
                </p>
                <dl>
                  <div>
                    <dt>Role</dt>
                    <dd>{user?.role || "seller"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{user?.status || "Active"}</dd>
                  </div>
                </dl>
              </section>
              <section className="danger">
                <span>
                  <FiLogOut />
                </span>
                <h3>Sign out</h3>
                <p>End your current session on this device.</p>
                <button type="button" onClick={handleLogout}>
                  <FiLogOut /> Sign out
                </button>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
