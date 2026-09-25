import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import { stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiEdit2,
  FiExternalLink,
  FiImage,
  FiMapPin,
  FiPauseCircle,
  FiPhone,
  FiPlayCircle,
  FiRefreshCw,
  FiSave,
  FiShoppingBag,
  FiX,
} from "react-icons/fi";
import "./Mystall.css";

const CATEGORIES = ["food", "merchandise", "mixed-use"];
const CATEGORY_LABELS = {
  food: "Food Stall",
  merchandise: "Merchandise",
  "mixed-use": "Mixed-Use",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  category: "food",
  contact_number: "",
  location: "",
  operating_hours: "",
};

const extractStall = (payload) => {
  const value =
    payload?.data?.stall ?? payload?.stall ?? payload?.data ?? payload;
  return Array.isArray(value) ? value[0] || null : value || null;
};

const toForm = (stall) => ({
  name: stall?.name || "",
  description: stall?.description || "",
  category: CATEGORIES.includes(stall?.category) ? stall.category : "food",
  contact_number: stall?.contact_number || "",
  location: stall?.location || "",
  operating_hours: stall?.operating_hours || "",
});

const formatDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export default function MyStall() {
  const [stall, setStall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const loadStall = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await stallService.getMy();
      const currentStall = extractStall(response.data);
      setStall(currentStall);
      setForm(toForm(currentStall));
      setLogoFailed(false);
    } catch (requestError) {
      setStall(null);
      setError(
        requestError.response?.data?.error ||
          "We couldn't load your stall profile. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStall();
  }, [loadStall]);

  const completion = useMemo(() => {
    if (!stall) return 0;
    const fields = [
      stall.name,
      stall.description,
      stall.category,
      stall.logo_url,
      stall.banner_url,
      stall.contact_number,
      stall.location,
      stall.operating_hours,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [stall]);

  const status = String(stall?.status || "pending").toLowerCase();
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  const handleChange = ({ target: { name, value } }) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };

  const validate = () => {
    const nextErrors = {};
    if (form.name.trim().length < 2) {
      nextErrors.name = "Enter at least 2 characters.";
    }
    if (form.description.trim().length > 500) {
      nextErrors.description = "Keep the description under 500 characters.";
    }
    if (!CATEGORIES.includes(form.category)) {
      nextErrors.category = "Choose a valid category.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!stall?.id || !validate()) return;

    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    );

    setSaving(true);
    try {
      const response = await stallService.update(stall.id, payload);
      const updated = extractStall(response.data) || { ...stall, ...payload };
      setStall(updated);
      setForm(toForm(updated));
      setEditing(false);
      setLogoFailed(false);
      toast.success("Stall profile updated");
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to update your stall",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    if (saving) return;
    setForm(toForm(stall));
    setErrors({});
    setLogoFailed(false);
    setEditing(false);
  };

  const renderLogo = (source, name, preview = false) =>
    source && !logoFailed ? (
      <img
        src={source}
        alt={preview ? "Stall logo preview" : `${name} logo`}
        onError={() => setLogoFailed(true)}
      />
    ) : (
      <FiShoppingBag aria-hidden="true" />
    );

  return (
    <div className="dashboard-layout my-stall-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar my-stall-topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>My Stall</h1>
              <p>Keep your public seller profile clear and up to date.</p>
            </div>
          </div>
          <div className="topbar-right">
            {stall?.status === "approved" && <button className="btn btn-outline btn-sm" disabled={saving} onClick={async () => {
              setSaving(true);
              try { const { data } = await stallService.update(stall.id, { is_active: !stall.is_active }); setStall(data); toast.success(data.is_active ? "Store is open on the marketplace" : "Store is temporarily closed"); }
              catch (error) { toast.error(error.response?.data?.error || "Could not update store availability"); }
              finally { setSaving(false); }
            }} aria-label={stall.is_active ? "Close store for now" : "Open store"} title={stall.is_active ? "Close store for now" : "Open store"}>
              {stall.is_active ? <FiPauseCircle /> : <FiPlayCircle />} {stall.is_active ? "Close store for now" : "Open store"}
            </button>}
            {stall && !editing && (
              <Link className="btn btn-outline btn-sm" to="/seller/stall/branding" aria-label="Logo & cover" title="Logo & cover">
                <FiImage /> Logo & cover
              </Link>
            )}
            {stall && !editing && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setEditing(true)}
                aria-label="Edit profile"
                title="Edit profile"
              >
                <FiEdit2 /> Edit profile
              </button>
            )}
          </div>
        </header>

        <div className="dashboard-content my-stall-content">
          {loading ? (
            <div
              className="my-stall-loading"
              aria-label="Loading stall profile"
            >
              <i />
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : error ? (
            <section className="my-stall-state error" role="alert">
              <span>
                <FiAlertCircle />
              </span>
              <small>Unable to load</small>
              <h2>Your stall profile is temporarily unavailable</h2>
              <p>{error}</p>
              <button className="btn btn-primary" onClick={loadStall}>
                <FiRefreshCw /> Try again
              </button>
            </section>
          ) : !stall ? (
            <section className="my-stall-state">
              <span>
                <FiShoppingBag />
              </span>
              <small>Start selling</small>
              <h2>Create your campus storefront</h2>
              <p>
                Apply for a stall first. Once approved, you can publish products
                and receive orders.
              </p>
              <Link to="/open-store" className="btn btn-primary">
                Apply for a stall
              </Link>
            </section>
          ) : (
            <>
              {!["approved", "active"].includes(status) && (
                <div
                  className={`my-stall-status status-${status}`}
                  role="status"
                >
                  <FiAlertCircle />
                  <div>
                    <strong>Application {statusLabel}</strong>
                    <p>
                      {status === "pending"
                        ? "An administrator is reviewing your stall. You can still complete your profile."
                        : "Your stall is not currently public. Contact support if you need more details."}
                    </p>
                  </div>
                  <span>{statusLabel}</span>
                </div>
              )}

              {!editing ? (
                <div className="my-stall-grid">
                  <section className="my-stall-profile">
                    <div
                      className="my-stall-cover"
                      aria-hidden="true"
                      style={stall.banner_url ? { backgroundImage: `url(${stall.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    />
                    <div className="my-stall-profile-body">
                      <div className="my-stall-identity">
                        <div className="my-stall-logo">
                          {renderLogo(stall.logo_url, stall.name)}
                        </div>
                        <div>
                          <span>
                            {CATEGORY_LABELS[stall.category] ||
                              stall.category ||
                              "Campus seller"}
                          </span>
                          <h2>{stall.name || "Untitled stall"}</h2>
                          <p>
                            {stall.description ||
                              "Add a short description so buyers know what you sell."}
                          </p>
                        </div>
                      </div>

                      <div className="my-stall-info-grid">
                        <article>
                          <FiMapPin />
                          <div>
                            <small>Location</small>
                            <strong>{stall.location || "Not set"}</strong>
                          </div>
                        </article>
                        <article>
                          <FiPhone />
                          <div>
                            <small>Contact number</small>
                            <strong>{stall.contact_number || "Not set"}</strong>
                          </div>
                        </article>
                        <article>
                          <FiClock />
                          <div>
                            <small>Operating hours</small>
                            <strong>
                              {stall.operating_hours || "Not set"}
                            </strong>
                          </div>
                        </article>
                      </div>

                      <footer>
                        <span>Created {formatDate(stall.created_at)}</span>
                        {["approved", "active"].includes(status) && (
                          <Link to={`/stalls/${stall.id}`}>
                            View public profile <FiExternalLink />
                          </Link>
                        )}
                      </footer>
                    </div>
                  </section>

                  <aside className="my-stall-sidebar-card">
                    <span>Profile health</span>
                    <div className="my-stall-completion">
                      <strong>{completion}%</strong>
                      <div>
                        <i style={{ width: `${completion}%` }} />
                      </div>
                    </div>
                    <p>
                      {completion === 100
                        ? "Your storefront contains all the essential information."
                        : "Complete the missing details to help buyers trust and find your stall."}
                    </p>
                    <ul>
                      <li className={stall.logo_url ? "done" : ""}>
                        <FiCheckCircle /> Stall logo
                      </li>
                      <li className={stall.banner_url ? "done" : ""}>
                        <FiCheckCircle /> Cover photo
                      </li>
                      <li className={stall.description ? "done" : ""}>
                        <FiCheckCircle /> Description
                      </li>
                      <li className={stall.location ? "done" : ""}>
                        <FiCheckCircle /> Location
                      </li>
                      <li className={stall.contact_number ? "done" : ""}>
                        <FiCheckCircle /> Contact number
                      </li>
                      <li className={stall.operating_hours ? "done" : ""}>
                        <FiCheckCircle /> Operating hours
                      </li>
                    </ul>
                    {(!stall.logo_url || !stall.banner_url) && (
                      <Link className="btn btn-outline" to="/seller/stall/branding">
                        Add logo & cover photo
                      </Link>
                    )}
                    {completion < 100 && (
                      <button
                        className="btn btn-outline"
                        onClick={() => setEditing(true)}
                      >
                        Complete profile
                      </button>
                    )}
                  </aside>
                </div>
              ) : (
                <form
                  className="my-stall-form"
                  onSubmit={handleSave}
                  noValidate
                >
                  <div className="my-stall-form-heading">
                    <div>
                      <small>Public information</small>
                      <h2>Edit stall profile</h2>
                      <p>
                        These details are visible to buyers on your storefront.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      aria-label="Close editor"
                    >
                      <FiX />
                    </button>
                  </div>

                  <div className="my-stall-form-layout">
                    <div className="my-stall-fields">
                      <div className="my-stall-field wide">
                        <label htmlFor="stall-name">
                          Stall name <span>*</span>
                        </label>
                        <input
                          id="stall-name"
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          className={errors.name ? "invalid" : ""}
                        />
                        {errors.name && <small>{errors.name}</small>}
                      </div>
                      <div className="my-stall-field wide">
                        <label htmlFor="stall-description">Description</label>
                        <textarea
                          id="stall-description"
                          name="description"
                          rows="4"
                          maxLength="500"
                          value={form.description}
                          onChange={handleChange}
                          className={errors.description ? "invalid" : ""}
                        />
                        <em>{form.description.length}/500</em>
                        {errors.description && (
                          <small>{errors.description}</small>
                        )}
                      </div>
                      <div className="my-stall-field">
                        <label htmlFor="stall-category">Category</label>
                        <select
                          id="stall-category"
                          name="category"
                          value={form.category}
                          onChange={handleChange}
                        >
                          {CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {CATEGORY_LABELS[category]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="my-stall-field">
                        <label htmlFor="stall-phone">Contact number</label>
                        <input
                          id="stall-phone"
                          name="contact_number"
                          inputMode="tel"
                          value={form.contact_number}
                          onChange={handleChange}
                          placeholder="09XX XXX XXXX"
                        />
                      </div>
                      <div className="my-stall-field">
                        <label htmlFor="stall-location">Location</label>
                        <input
                          id="stall-location"
                          name="location"
                          value={form.location}
                          onChange={handleChange}
                          placeholder="Stall #12, CSUCC Grounds"
                        />
                      </div>
                      <div className="my-stall-field">
                        <label htmlFor="stall-hours">Operating hours</label>
                        <input
                          id="stall-hours"
                          name="operating_hours"
                          value={form.operating_hours}
                          onChange={handleChange}
                          placeholder="8:00 AM – 5:00 PM"
                        />
                      </div>
                      <div className="my-stall-field wide">
                        <label>Logo & cover photo</label>
                        <div className="my-stall-logo-input">
                          <FiImage />
                          <span>
                            Upload your stall images on the{" "}
                            <Link to="/seller/stall/branding">Stall Branding</Link> page.
                          </span>
                        </div>
                      </div>
                    </div>

                    <aside className="my-stall-preview">
                      <small>Live preview</small>
                      <div className="my-stall-preview-logo">
                        {renderLogo(stall.logo_url, form.name, true)}
                      </div>
                      <h3>{form.name.trim() || "Your stall name"}</h3>
                      <span>{CATEGORY_LABELS[form.category]}</span>
                      <p>
                        {form.description.trim() ||
                          "Your description will appear here."}
                      </p>
                    </aside>
                  </div>

                  <div className="my-stall-form-actions">
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={cancelEditing}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? (
                        <span className="my-stall-spinner" />
                      ) : (
                        <FiSave />
                      )}
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
