import { Store } from "lucide-react";
import "./StallMap.css";

// Shared vocabulary for event stall maps. The map itself is EventMap.jsx (real map, Leaflet).

export const LANDMARKS = {
  stage: { label: "Stage" },
  entrance: { label: "Entrance" },
  exit: { label: "Exit" },
  restroom: { label: "Restroom" },
  info: { label: "Info desk" },
  custom: { label: "Landmark" },
};

export const SPACE_CATEGORIES = { food: "Food", merchandise: "Merchandise", mixed: "Mixed" };
export const SPACE_STATUSES = { available: "Open", reserved: "Reserved", occupied: "Occupied" };

/** A space with a seller placed on it counts as occupied whatever its saved status says. */
export const spaceStatus = (space) => (space.status === "occupied" || space.seller_id ? "occupied" : space.status === "reserved" ? "reserved" : "available");

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
