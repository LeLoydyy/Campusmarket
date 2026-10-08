import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Keyboard, Minus, Plus, Save, Trash2 } from "lucide-react";
import api from "../../services/api.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import { plural } from "../../utils/marketplace.js";
import StallMap, { isFree, LANDMARKS, MAP_COLS, MAP_ROWS, placeSpaces, SPACE_CATEGORIES, SPACE_STATUSES, StallMapLegend } from "./StallMap.jsx";

// crypto.randomUUID only exists on https:// or localhost; phones on http://192.168… need the fallback.
const tempId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

const LANDMARK_SIZES = { stage: [6, 3], entrance: [3, 1], exit: [3, 1], restroom: [2, 2], info: [2, 2], custom: [3, 2] };

/** First free top-left position for a w×h box, scanning row by row. */
const firstFree = (w, h, items) => {
  for (let y = 0; y + h <= MAP_ROWS; y += 1) {
    for (let x = 0; x + w <= MAP_COLS; x += 1) if (isFree({ x, y, w, h }, items)) return { x, y, w, h };
  }
  return null;
};

/**
 * Admin stall map editor: large grid canvas, drag / resize / keyboard nudge,
 * landmarks, zoom, and a save button that's only active with unsaved changes.
 */
export default function StallMapEditor({ event: initialEvent, stalls: initialStalls }) {
  const [event, setEvent] = useState(initialEvent);
  const [stalls, setStalls] = useState(() => placeSpaces(initialStalls, initialEvent.landmarks || []));
  const [landmarks, setLandmarks] = useState(initialEvent.landmarks || []);
  const [selected, setSelected] = useState(null); // { id, kind }
  const [zoom, setZoom] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const all = useMemo(() => [...landmarks, ...stalls], [landmarks, stalls]);
  const space = selected?.kind === "space" ? stalls.find((item) => item.id === selected.id) : null;
  const landmark = selected?.kind === "landmark" ? landmarks.find((item) => item.id === selected.id) : null;
  const counts = {
    available: stalls.filter((s) => s.status === "available" && !s.seller_id).length,
    reserved: stalls.filter((s) => s.status === "reserved").length,
    occupied: stalls.filter((s) => s.status === "occupied" || s.seller_id).length,
  };

  const change = (fn) => { fn(); setDirty(true); };
  const updateSpace = (key, value) => change(() => setStalls((items) => items.map((item) => (item.id === space.id ? { ...item, [key]: value } : item))));
  const updateLandmark = (key, value) => change(() => setLandmarks((items) => items.map((item) => (item.id === landmark.id ? { ...item, [key]: value } : item))));

  const move = (id, kind, box) => change(() => {
    const apply = (items) => items.map((item) => (item.id === id ? { ...item, ...box, autoPlaced: false } : item));
    if (kind === "landmark") setLandmarks(apply); else setStalls(apply);
  });

  const addSpace = () => {
    const box = firstFree(3, 2, all);
    if (!box) return toast.error("The map is full. Make room or shrink a space first.");
    const item = { id: `new-${tempId()}`, stall_number: Math.max(0, ...stalls.map((s) => s.stall_number)) + 1, category: "food", status: "available", size: "3m x 3m", price: 0, ...box };
    change(() => setStalls((items) => [...items, item]));
    setSelected({ id: item.id, kind: "space" });
  };

  const addLandmark = (type) => {
    const [w, h] = LANDMARK_SIZES[type];
    const box = firstFree(w, h, all);
    if (!box) return toast.error("No free room for that landmark.");
    const item = { id: `lm-${tempId()}`, type, label: LANDMARKS[type].label, ...box };
    change(() => setLandmarks((items) => [...items, item]));
    setSelected({ id: item.id, kind: "landmark" });
  };

  const removeSelected = () => {
    if (landmark) change(() => setLandmarks((items) => items.filter((item) => item.id !== landmark.id)));
    if (space) change(() => setStalls((items) => items.filter((item) => item.id !== space.id)));
    setSelected(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        version: event.layout_version || 0,
        stalls: stalls.map(({ autoPlaced, sellerName, sellerStallId, sellerStallName, sellerLogo, productsAvailable, ...item }) => ({ ...item, price: Number(item.price) || 0 })),
        landmarks: landmarks.map(({ id, type, label, x, y, w, h }) => ({ id, type, label, x, y, w, h })),
      };
      const { data } = await api.put(`/admin/events/${event.id}/layout`, payload);
      setEvent(data.event);
      setLandmarks(data.event.landmarks || []);
      // Keep display-only seller details from the loaded list.
      setStalls(placeSpaces(data.stalls.map((item) => ({ ...(stalls.find((s) => s.id === item.id || s.stall_number === item.stall_number) || {}), ...item })), data.event.landmarks || []));
      setDirty(false);
      toast.success("Layout saved");
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't save the layout");
    } finally {
      setSaving(false);
    }
  };

  const isNewSpace = space && String(space.id).startsWith("new-");

  return (
    <div className="sme">
      <div className="sme-bar">
        <Link className="btn btn-ghost btn-sm" to="/admin/events" onClick={(e) => { if (dirty && !window.confirm("Discard unsaved layout changes?")) e.preventDefault(); }}>
          <ArrowLeft aria-hidden="true" /> Events
        </Link>
        <div className="sme-title">
          <h2>{event.name}</h2>
          <p>{event.date} · {event.location} · {plural(stalls.length, "space")} · {counts.available} open</p>
        </div>
        <span className={`sme-state ${dirty ? "is-dirty" : "is-clean"}`} role="status">
          {dirty ? <><i aria-hidden="true" /> Unsaved changes</> : <><CheckCircle2 aria-hidden="true" /> Up to date</>}
        </span>
        <button type="button" className={`btn sme-save ${dirty ? "btn-gold" : "btn-outline"}`} disabled={!dirty || saving} onClick={save}>
          <Save aria-hidden="true" /> {saving ? "Saving…" : "Save layout"}
        </button>
      </div>

      <div className="sme-body">
        <section className="sme-canvas" aria-label="Map canvas">
          <div className="sme-tools">
            <button type="button" className="btn btn-primary btn-sm" onClick={addSpace} disabled={saving || stalls.length >= 200}><Plus aria-hidden="true" /> Add space</button>
            <label className="sme-landmark-add">
              <span className="sr-only">Add a landmark</span>
              <select value="" onChange={(e) => { if (e.target.value) addLandmark(e.target.value); }} disabled={saving || landmarks.length >= 20}>
                <option value="">+ Add landmark…</option>
                {Object.entries(LANDMARKS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </label>
            <div className="sme-zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.75} aria-label="Zoom out"><Minus aria-hidden="true" /></button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} disabled={zoom >= 2} aria-label="Zoom in"><Plus aria-hidden="true" /></button>
            </div>
          </div>
          <StallMap
            mode="edit"
            stalls={stalls}
            landmarks={landmarks}
            zoom={zoom}
            selectedId={selected?.id}
            onSelect={(id, kind) => setSelected(id ? { id, kind } : null)}
            onMove={move}
            label={`Stall map editor for ${event.name}`}
          />
          <p className="sme-help"><Keyboard aria-hidden="true" /> Drag to move · drag the corner to resize · arrow keys nudge the selected item, Shift + arrows resize. Spaces can't overlap.</p>
        </section>

        <aside className="sme-side">
          <section className="sme-panel">
            {space ? (
              <fieldset disabled={saving} className="sme-form">
                <legend>Space {space.stall_number}</legend>
                <label>Category
                  <select value={space.category} onChange={(e) => updateSpace("category", e.target.value)}>
                    {!SPACE_CATEGORIES[space.category] && <option value={space.category}>{space.category}</option>}
                    {Object.entries(SPACE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <label>Availability
                  <select value={space.status} disabled={!!space.seller_id} onChange={(e) => updateSpace("status", e.target.value)}>
                    {!SPACE_STATUSES[space.status] && <option value={space.status}>{space.status}</option>}
                    {Object.entries(SPACE_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                {space.seller_id && <p className="sme-note">Assigned to {space.sellerStallName || space.sellerName || "a seller"} — availability is locked.</p>}
                <div className="sme-row">
                  <label>Size label<input maxLength={40} value={space.size} onChange={(e) => updateSpace("size", e.target.value)} /></label>
                  <label>Fee (₱)<input type="number" min="0" max="1000000" step="1" value={space.price} onChange={(e) => updateSpace("price", e.target.value === "" ? "" : Number(e.target.value))} /></label>
                </div>
                <p className="sme-note">On the map: {space.w} × {space.h} cells at column {space.x + 1}, row {space.y + 1}{space.autoPlaced ? " (auto-placed — drag to set)" : ""}. Fee shown to sellers: {formatCurrency(space.price)}.</p>
                {isNewSpace && <button type="button" className="btn btn-ghost sme-delete" onClick={removeSelected}><Trash2 aria-hidden="true" /> Remove new space</button>}
              </fieldset>
            ) : landmark ? (
              <fieldset disabled={saving} className="sme-form">
                <legend>Landmark</legend>
                <label>Type
                  <select value={landmark.type} onChange={(e) => updateLandmark("type", e.target.value)}>
                    {Object.entries(LANDMARKS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                  </select>
                </label>
                <label>Label<input maxLength={40} value={landmark.label} onChange={(e) => updateLandmark("label", e.target.value)} /></label>
                <button type="button" className="btn btn-ghost sme-delete" onClick={removeSelected}><Trash2 aria-hidden="true" /> Remove landmark</button>
              </fieldset>
            ) : (
              <div className="sme-empty">
                <h3>Nothing selected</h3>
                <p>Select a space or landmark on the map to edit it, or add a new one.</p>
                <ul className="sme-counts">
                  <li><b>{counts.available}</b> open</li>
                  <li><b>{counts.reserved}</b> reserved</li>
                  <li><b>{counts.occupied}</b> occupied</li>
                </ul>
              </div>
            )}
          </section>
          <section className="sme-panel"><StallMapLegend /></section>
        </aside>
      </div>
    </div>
  );
}
