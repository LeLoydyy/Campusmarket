import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DoorOpen, Info, Mic2, Store, Toilet, LogOut as ExitIcon, MapPin } from "lucide-react";
import "./StallMap.css";

export const MAP_COLS = 24;
export const MAP_ROWS = 16;
const DEFAULT_SIZE = { w: 3, h: 2 };

export const LANDMARKS = {
  stage: { label: "Stage", icon: Mic2 },
  entrance: { label: "Entrance", icon: DoorOpen },
  exit: { label: "Exit", icon: ExitIcon },
  restroom: { label: "Restroom", icon: Toilet },
  info: { label: "Info desk", icon: Info },
  custom: { label: "Landmark", icon: MapPin },
};

export const SPACE_CATEGORIES = { food: "Food", merchandise: "Merchandise", mixed: "Mixed" };
export const SPACE_STATUSES = { available: "Open", reserved: "Reserved", occupied: "Occupied" };

const hasGeometry = (item) => [item.x, item.y, item.w, item.h].every(Number.isInteger);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fits = (box) => box.x >= 0 && box.y >= 0 && box.x + box.w <= MAP_COLS && box.y + box.h <= MAP_ROWS;

/**
 * Give every space a position: saved geometry where it exists, otherwise the
 * first free slot scanning left→right, top→bottom (by stall number).
 */
export function placeSpaces(stalls, landmarks = []) {
  const taken = [...landmarks.filter(hasGeometry), ...stalls.filter(hasGeometry)];
  return [...stalls].sort((a, b) => a.stall_number - b.stall_number).map((stall) => {
    if (hasGeometry(stall)) return stall;
    for (let y = 0; y + DEFAULT_SIZE.h <= MAP_ROWS; y += 1) {
      for (let x = 0; x + DEFAULT_SIZE.w <= MAP_COLS; x += 1) {
        const box = { x, y, ...DEFAULT_SIZE };
        if (!taken.some((other) => overlaps(box, other))) {
          taken.push(box);
          return { ...stall, ...box, autoPlaced: true };
        }
      }
    }
    return { ...stall, x: 0, y: 0, ...DEFAULT_SIZE, autoPlaced: true };
  });
}

/** Can `box` go here without leaving the grid or covering anything else? */
export const isFree = (box, items, ignoreId) => fits(box) && !items.some((item) => item.id !== ignoreId && overlaps(box, item));

/**
 * The stall map. `mode="view"` for buyers (spaces link to sellers),
 * `mode="edit"` for admins (drag to move, corner handle to resize, arrows to nudge).
 */
export default function StallMap({ stalls, landmarks = [], mode = "view", zoom = 1, selectedId, onSelect, onMove, label = "Stall map" }) {
  const board = useRef(null);
  const [drag, setDrag] = useState(null); // { id, kind: "space"|"landmark", action: "move"|"resize", startX, startY, origin, preview, valid }
  const all = [...landmarks.map((item) => ({ ...item, kind: "landmark" })), ...stalls.map((item) => ({ ...item, kind: "space" }))];

  const cellSize = () => {
    const rect = board.current.getBoundingClientRect();
    return { w: rect.width / MAP_COLS, h: rect.height / MAP_ROWS };
  };

  const startDrag = (event, item, action) => {
    if (mode !== "edit" || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(item.id, item.kind);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: item.id, kind: item.kind, action, startX: event.clientX, startY: event.clientY, origin: { x: item.x, y: item.y, w: item.w, h: item.h }, preview: null, valid: true });
  };

  const moveDrag = (event) => {
    if (!drag) return;
    const cell = cellSize();
    const dx = Math.round((event.clientX - drag.startX) / cell.w);
    const dy = Math.round((event.clientY - drag.startY) / cell.h);
    const box = drag.action === "move"
      ? { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }
      : { ...drag.origin, w: Math.max(1, drag.origin.w + dx), h: Math.max(1, drag.origin.h + dy) };
    setDrag((current) => current && { ...current, preview: box, valid: isFree(box, all, drag.id) });
  };

  const endDrag = () => {
    if (drag?.preview && drag.valid) onMove?.(drag.id, drag.kind, drag.preview);
    setDrag(null);
  };

  // Keyboard: arrows move the selected item one cell, Shift+arrows resize it.
  const onKeyDown = useCallback((event, item) => {
    if (mode !== "edit") return;
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const box = event.shiftKey
      ? { x: item.x, y: item.y, w: Math.max(1, item.w + step[0]), h: Math.max(1, item.h + step[1]) }
      : { x: item.x + step[0], y: item.y + step[1], w: item.w, h: item.h };
    if (isFree(box, all, item.id)) onMove?.(item.id, item.kind, box);
  }, [all, mode, onMove]);

  const geometry = (item) => (drag?.id === item.id && drag.preview ? drag.preview : item);
  // 2px gutter inside the cell edges so neighbours never touch.
  const style = (box) => ({
    left: `calc(${(box.x / MAP_COLS) * 100}% + 2px)`, top: `calc(${(box.y / MAP_ROWS) * 100}% + 2px)`,
    width: `calc(${(box.w / MAP_COLS) * 100}% - 4px)`, height: `calc(${(box.h / MAP_ROWS) * 100}% - 4px)`,
  });

  return (
    <div className={`smap smap--${mode}`} style={{ "--zoom": zoom }}>
      <div className="smap-scroll">
        <div
          ref={board}
          className="smap-board"
          role="group"
          aria-label={label}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => setDrag(null)}
          onPointerDown={() => mode === "edit" && onSelect?.(null)}
          style={{ "--cols": MAP_COLS, "--rows": MAP_ROWS }}
        >
          {landmarks.map((item) => {
            const Icon = (LANDMARKS[item.type] || LANDMARKS.custom).icon;
            const box = geometry(item);
            return (
              <div
                key={item.id}
                className={`smap-landmark smap-landmark--${item.type} ${selectedId === item.id ? "is-selected" : ""} ${drag?.id === item.id && !drag.valid ? "is-blocked" : ""}`}
                style={style(box)}
                tabIndex={mode === "edit" ? 0 : undefined}
                role={mode === "edit" ? "button" : undefined}
                aria-label={`${item.label} (${(LANDMARKS[item.type] || LANDMARKS.custom).label})`}
                onPointerDown={(event) => startDrag(event, { ...item, kind: "landmark" }, "move")}
                onKeyDown={(event) => onKeyDown(event, { ...item, kind: "landmark" })}
                onFocus={() => mode === "edit" && onSelect?.(item.id, "landmark")}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {mode === "edit" && <span className="smap-handle" aria-hidden="true" onPointerDown={(event) => startDrag(event, { ...item, kind: "landmark" }, "resize")} />}
              </div>
            );
          })}

          {stalls.map((item) => {
            const box = geometry(item);
            const occupied = item.status === "occupied" || item.seller_id;
            const status = occupied ? "occupied" : item.status === "reserved" ? "reserved" : "available";
            const seller = item.sellerStallName || item.name || item.sellerName;
            const text = `Space ${item.stall_number}, ${SPACE_CATEGORIES[item.category] || "Mixed"}, ${SPACE_STATUSES[status]}${seller ? `, ${seller}` : ""}`;
            const content = (
              <>
                <b className="smap-num">{item.stall_number}</b>
                {status === "occupied" && item.sellerLogo && <img className="smap-logo" src={item.sellerLogo} alt="" />}
                {status === "occupied" && !item.sellerLogo && <Store className="smap-logo-icon" aria-hidden="true" />}
                {seller && box.w * box.h >= 4 && <span className="smap-name">{seller}</span>}
                {mode === "edit" && <span className="smap-handle" aria-hidden="true" onPointerDown={(event) => startDrag(event, { ...item, kind: "space" }, "resize")} />}
              </>
            );
            const className = `smap-space smap-cat--${item.category || "mixed"} smap-status--${status} ${selectedId === item.id ? "is-selected" : ""} ${drag?.id === item.id && !drag.valid ? "is-blocked" : ""}`;
            if (mode === "view") {
              return item.sellerStallId
                ? <Link key={item.id} to={`/stalls/${item.sellerStallId}`} className={className} style={style(box)} aria-label={`${text}. Visit stall`} title={text}>{content}</Link>
                : <button key={item.id} type="button" className={className} style={style(box)} aria-label={text} title={text} aria-pressed={selectedId === item.id} onClick={() => onSelect?.(item.id, "space")}>{content}</button>;
            }
            return (
              <div
                key={item.id}
                className={className}
                style={style(box)}
                role="button"
                tabIndex={0}
                aria-label={`${text}. Arrow keys move, Shift plus arrow keys resize.`}
                aria-pressed={selectedId === item.id}
                onPointerDown={(event) => startDrag(event, { ...item, kind: "space" }, "move")}
                onKeyDown={(event) => onKeyDown(event, { ...item, kind: "space" })}
                onFocus={() => onSelect?.(item.id, "space")}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Colour + pattern key shared by the editor and the buyer map. */
export function StallMapLegend({ compact = false }) {
  return (
    <div className={`smap-legend ${compact ? "is-compact" : ""}`}>
      <div>
        <h3>Category</h3>
        <ul>
          {Object.entries(SPACE_CATEGORIES).map(([key, label]) => <li key={key}><i className={`smap-swatch smap-cat--${key} smap-status--available`} aria-hidden="true" />{label}</li>)}
        </ul>
      </div>
      <div>
        <h3>Availability</h3>
        <ul>
          <li><i className="smap-swatch smap-cat--mixed smap-status--available" aria-hidden="true" />Open — solid</li>
          <li><i className="smap-swatch smap-cat--mixed smap-status--reserved" aria-hidden="true" />Reserved — striped</li>
          <li><i className="smap-swatch smap-cat--mixed smap-status--occupied" aria-hidden="true"><Store /></i>Occupied — seller logo</li>
        </ul>
      </div>
    </div>
  );
}
