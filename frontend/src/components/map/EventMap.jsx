import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CAMPUS_CENTER, hasPin, nudgePin } from "../../utils/geo.js";
import { LANDMARKS, SPACE_CATEGORIES, SPACE_STATUSES, spaceStatus } from "./StallMap.jsx";
import "./StallMap.css";
import "./EventMap.css";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const round = (value) => Math.round(value * 1e6) / 1e6;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

// Free tiles, no key: Esri satellite imagery (default) and OpenStreetMap streets.
const baseLayers = () => ({
  Satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxNativeZoom: 18, maxZoom: 21, attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  }),
  Street: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19, maxZoom: 21, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
});

/** Pin HTML, screen-reader text and whether it can be clicked, for one space or landmark. */
function describe(item, mode) {
  if (item.kind === "landmark") {
    const type = LANDMARKS[item.type] || LANDMARKS.custom;
    return {
      html: `<span class="emap-landmark emap-landmark--${esc(item.type)}">${esc(item.label)}</span>`,
      label: `${item.label} (${type.label})${mode === "edit" ? ". Drag, or use arrow keys, to move" : ""}`,
      interactive: mode === "edit",
    };
  }
  const status = spaceStatus(item);
  // Picking: an open space another seller already asked for is shown (and blocked) as reserved.
  const requested = mode === "pick" && status === "available" && item.requested;
  const shown = requested ? "reserved" : status;
  const open = shown === "available";
  const seller = item.sellerStallName || item.name || item.sellerName;
  const logo = status === "occupied" && item.sellerLogo ? `<img src="${esc(item.sellerLogo)}" alt="">` : "";
  const html = `<span class="emap-space smap-cat--${esc(item.category || "mixed")} smap-status--${shown}${mode === "pick" && !open ? " is-unavailable" : ""}">${logo}<b>${esc(item.stall_number)}</b></span>`;
  const kind = SPACE_CATEGORIES[item.category] || "Mixed";
  let label = `Space ${item.stall_number}, ${kind}, ${SPACE_STATUSES[status]}${seller ? `, ${seller}` : ""}`;
  if (mode === "pick") {
    label = open ? `Space ${item.stall_number}, ${kind}${item.size ? `, ${item.size}` : ""}, open. Choose this spot`
      : `Space ${item.stall_number}, ${requested ? "already requested by another seller" : SPACE_STATUSES[status].toLowerCase()}`;
  } else if (mode === "view") {
    label += seller ? ". Show what they sell" : ". Show details";
  } else {
    label += ". Drag, or use arrow keys, to move";
  }
  return { html, label, interactive: mode !== "pick" || open };
}

/**
 * Event stall map on the real map (Leaflet + OpenStreetMap).
 * `mode="view"` buyers tap a pin to see the seller; `mode="edit"` admins drag pins
 * (arrow keys nudge 1 m, Shift + arrows 5 m); `mode="pick"` sellers tap an open space.
 * Spaces and landmarks without a pin are simply not drawn.
 * The ref exposes center() → { latitude, longitude } and flyTo(pin, zoom).
 */
const EventMap = forwardRef(function EventMap({ spaces = [], landmarks = [], mode = "view", selectedId, onSelect, onMove, center, label = "Stall map", className = "" }, ref) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const layer = useRef(null);
  const markers = useRef(new Map());
  const handlers = useRef({});
  const fitted = useRef(false);
  const lastSelected = useRef(null);
  handlers.current = { onSelect, onMove };

  useImperativeHandle(ref, () => ({
    center: () => {
      const point = mapRef.current.getCenter();
      return { latitude: round(point.lat), longitude: round(point.lng) };
    },
    flyTo: (pin, zoom = 19) => mapRef.current?.flyTo([pin.latitude, pin.longitude], zoom, { duration: 0.8 }),
  }), []);

  useEffect(() => {
    const map = L.map(box.current, { maxZoom: 21, scrollWheelZoom: false, zoomSnap: 0.5 });
    const layers = baseLayers();
    layers.Satellite.addTo(map);
    L.control.layers(layers, null, { position: "topright" }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    const start = hasPin(center) ? center : CAMPUS_CENTER;
    map.setView([start.latitude, start.longitude], hasPin(center) ? 19 : 17);
    // Don't hijack page scrolling: the wheel zooms only after the map is clicked or focused.
    const wake = () => map.scrollWheelZoom.enable();
    const sleep = () => map.scrollWheelZoom.disable();
    map.on("click focus", wake);
    map.on("blur mouseout", sleep);
    map.on("click", () => { if (mode === "edit") handlers.current.onSelect?.(null); });
    layer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The card can resize (sidebar collapse, rotation): let Leaflet re-measure.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(box.current);
    const pins = markers.current;
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; pins.clear(); fitted.current = false; };
    // The map is created once; mode and the starting centre never change for a mounted map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const items = [...landmarks.map((item) => ({ ...item, kind: "landmark" })), ...spaces.map((item) => ({ ...item, kind: "space" }))].filter(hasPin);
    const seen = new Set();
    for (const item of items) {
      const key = `${item.kind}:${item.id}`;
      const { id, kind } = item;
      seen.add(key);
      const { html, label: text, interactive } = describe(item, mode);
      const icon = () => L.divIcon({ className: "emap-icon", html, iconSize: [0, 0] });
      let entry = markers.current.get(key);
      if (entry && entry.interactive !== interactive) { entry.marker.remove(); entry = null; }
      if (!entry) {
        const marker = L.marker([item.latitude, item.longitude], { icon: icon(), interactive, keyboard: interactive, draggable: mode === "edit", autoPan: true });
        marker.on("click", () => handlers.current.onSelect?.(id, kind));
        marker.on("dragstart", () => handlers.current.onSelect?.(id, kind));
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          handlers.current.onMove?.(id, kind, { latitude: round(point.lat), longitude: round(point.lng) });
        });
        marker.addTo(layer.current);
        if (mode === "edit") {
          marker.getElement().addEventListener("keydown", (event) => {
            const step = ARROWS[event.key];
            if (!step) return;
            event.preventDefault();
            const point = marker.getLatLng();
            const metres = event.shiftKey ? 5 : 1;
            handlers.current.onSelect?.(id, kind);
            handlers.current.onMove?.(id, kind, nudgePin({ latitude: point.lat, longitude: point.lng }, step[0] * metres, step[1] * metres));
          });
        }
        entry = { marker, html, interactive };
        markers.current.set(key, entry);
      } else {
        // DivIcon reuses the same element, so focus and listeners survive a redraw.
        if (entry.html !== html) { entry.marker.setIcon(icon()); entry.html = html; }
        const point = entry.marker.getLatLng();
        if (point.lat !== item.latitude || point.lng !== item.longitude) entry.marker.setLatLng([item.latitude, item.longitude]);
      }
      const element = entry.marker.getElement();
      const selected = selectedId === id;
      element.classList.toggle("is-selected", selected);
      element.setAttribute("aria-label", text);
      element.title = text;
      // Clickable pins are buttons; the rest (landmarks for buyers, taken spaces when picking) are labelled images.
      element.setAttribute("role", interactive ? "button" : "img");
      if (interactive && kind === "space") element.setAttribute("aria-pressed", String(selected));
      entry.marker.setZIndexOffset(selected ? 1000 : kind === "landmark" ? -100 : 0);
    }
    for (const [key, entry] of markers.current) {
      if (!seen.has(key)) { entry.marker.remove(); markers.current.delete(key); }
    }

    if (!fitted.current) {
      fitted.current = true;
      if (items.length > 1) map.fitBounds(L.latLngBounds(items.map((item) => [item.latitude, item.longitude])), { padding: [40, 40], maxZoom: 20 });
      else if (items.length === 1) map.setView([items[0].latitude, items[0].longitude], 19);
    } else if (selectedId && selectedId !== lastSelected.current) {
      // Picked from a list outside the map (or just placed): bring that pin into view.
      const chosen = items.find((item) => item.id === selectedId);
      if (chosen && !map.getBounds().pad(-0.1).contains([chosen.latitude, chosen.longitude])) map.panTo([chosen.latitude, chosen.longitude]);
    }
    lastSelected.current = selectedId;
  }, [spaces, landmarks, mode, selectedId]);

  return <div ref={box} className={`emap emap--${mode} ${className}`} role="region" aria-label={label} />;
});

export default EventMap;
