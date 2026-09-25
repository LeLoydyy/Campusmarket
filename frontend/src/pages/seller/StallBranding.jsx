import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FiAlertCircle, FiImage, FiRefreshCw, FiSave, FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
import Sidebar from "../../components/common/Sidebar.jsx";
import { stallService } from "../../services/api.js";
import { StallCard, normalizeStall } from "../buyer/Stalls.jsx";
import "../buyer/Stalls.css";
import "./Mystall.css";
import "./StallBranding.css";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

const SLOTS = {
  cover: {
    field: "banner_url",
    title: "Cover photo",
    hint: "Shown across the top of your stall card and stall page. Use a wide photo of your food, products or booth — about 1200 × 400 px.",
  },
  logo: {
    field: "logo_url",
    title: "Logo",
    hint: "Your stall's badge next to its name. A square image works best — about 400 × 400 px.",
  },
};

function BrandingSlot({ kind, stall, pending, busy, onPick, onSave, onCancel, onRemove }) {
  const { field, title, hint } = SLOTS[kind];
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const current = stall[field];
  const shown = pending?.url || current;

  const pick = (file) => file && onPick(kind, file);

  return (
    <section className="stall-branding-slot">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        {pending && <span className="stall-branding-unsaved">Not saved yet</span>}
      </header>

      <div
        className={`stall-branding-drop stall-branding-drop-${kind}${dragging ? " dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files?.[0]); }}
      >
        {shown ? (
          <img src={shown} alt={`${title} preview`} />
        ) : (
          <div className="stall-branding-empty">
            <FiImage aria-hidden="true" />
            <span>No {title.toLowerCase()} yet</span>
          </div>
        )}
        {busy && <div className="stall-branding-busy" role="status" aria-label="Saving"><span className="stall-branding-spinner" /></div>}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        hidden
        onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }}
      />

      <div className="stall-branding-actions">
        {pending ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSave(kind)}>
              <FiSave /> {busy ? "Saving…" : `Save ${title.toLowerCase()}`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onCancel(kind)}>
              <FiX /> Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => input.current?.click()}>
              <FiUploadCloud /> {current ? "Change" : "Upload"} {title.toLowerCase()}
            </button>
            {current && (
              <button type="button" className="btn btn-ghost btn-sm stall-branding-remove" disabled={busy} onClick={() => onRemove(kind)}>
                <FiTrash2 /> Remove
              </button>
            )}
          </>
        )}
      </div>
      <small className="stall-branding-note">JPG, PNG or WebP, up to 5 MB. You can also drag an image onto the box.</small>
    </section>
  );
}

export default function StallBranding() {
  const [stall, setStall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState({}); // kind -> { file, url }
  const [busy, setBusy] = useState(null); // kind being saved/removed

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await stallService.getMy();
      setStall(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "We couldn't load your stall. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Release local preview URLs when they are replaced or the page closes.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => Object.values(pendingRef.current).forEach((item) => URL.revokeObjectURL(item.url)), []);

  const clearPending = (kind) => setPending((previous) => {
    if (previous[kind]) URL.revokeObjectURL(previous[kind].url);
    const { [kind]: _, ...rest } = previous;
    return rest;
  });

  const handlePick = (kind, file) => {
    if (!ACCEPTED.includes(file.type)) return toast.error("Choose a JPG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return toast.error("Choose an image smaller than 5 MB.");
    clearPending(kind);
    setPending((previous) => ({ ...previous, [kind]: { file, url: URL.createObjectURL(file) } }));
  };

  const handleSave = async (kind) => {
    setBusy(kind);
    try {
      const { data } = await stallService.uploadBranding(kind, pending[kind].file);
      setStall(data);
      clearPending(kind);
      toast.success(`${SLOTS[kind].title} updated`);
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || `Couldn't save your ${SLOTS[kind].title.toLowerCase()}.`);
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (kind) => {
    if (!window.confirm(`Remove your ${SLOTS[kind].title.toLowerCase()}?`)) return;
    setBusy(kind);
    try {
      const { data } = await stallService.removeBranding(kind);
      setStall(data);
      toast.success(`${SLOTS[kind].title} removed`);
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Couldn't remove the image.");
    } finally {
      setBusy(null);
    }
  };

  // Preview exactly what buyers see, including images that aren't saved yet.
  const preview = stall && {
    ...normalizeStall({
      ...stall,
      logo_url: pending.logo?.url || stall.logo_url,
      banner_url: pending.cover?.url || stall.banner_url,
    }, 0),
    id: undefined, // render as a plain card, not a link
  };

  return (
    <div className="dashboard-layout my-stall-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Stall Branding</h1>
              <p>Upload a logo and cover photo so buyers recognise your stall.</p>
            </div>
          </div>
        </header>

        <div className="dashboard-content my-stall-content">
          {loading ? (
            <div className="my-stall-loading" aria-label="Loading stall"><i /><div><i /><i /><i /></div></div>
          ) : error ? (
            <section className="my-stall-state error" role="alert">
              <span><FiAlertCircle /></span>
              <small>Unable to load</small>
              <h2>Your stall is temporarily unavailable</h2>
              <p>{error}</p>
              <button className="btn btn-primary" onClick={load}><FiRefreshCw /> Try again</button>
            </section>
          ) : !stall ? (
            <section className="my-stall-state">
              <span><FiImage /></span>
              <small>No stall yet</small>
              <h2>Create your stall first</h2>
              <p>Once you have a stall you can give it a logo and cover photo.</p>
              <Link to="/open-store" className="btn btn-primary">Apply for a stall</Link>
            </section>
          ) : (
            <div className="stall-branding-layout">
              <div className="stall-branding-slots">
                {Object.keys(SLOTS).map((kind) => (
                  <BrandingSlot
                    key={kind}
                    kind={kind}
                    stall={stall}
                    pending={pending[kind]}
                    busy={busy === kind}
                    onPick={handlePick}
                    onSave={handleSave}
                    onCancel={clearPending}
                    onRemove={handleRemove}
                  />
                ))}
              </div>

              <aside className="stall-branding-preview">
                <small>How buyers see your stall</small>
                <div className="market-stalls-shell stall-branding-card">
                  <StallCard stall={preview} />
                </div>
                <p>
                  {["approved", "active"].includes(stall.status)
                    ? <>Changes appear on the marketplace as soon as you save. <Link to={`/stalls/${stall.id}`}>View your public stall</Link></>
                    : "Your stall isn't public yet — your branding will show once an administrator approves it."}
                </p>
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
