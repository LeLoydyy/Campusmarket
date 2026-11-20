// Real-map helpers for event stall maps (OpenStreetMap / Leaflet).

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const pair = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return inRange(latitude, longitude) ? { latitude, longitude } : null;
};

/** Has this space, landmark or event been pinned on the real map? */
export const hasPin = (item) => item?.latitude != null && item?.longitude != null && pair(item.latitude, item.longitude) !== null;

/**
 * Read a place from what an admin pastes: plain coordinates ("9.1234, 125.5678")
 * or a full Google Maps / OpenStreetMap link. Returns { latitude, longitude } or null.
 */
export function parsePin(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const number = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const plain = value.match(new RegExp(`^${number}\\s*[, ]\\s*${number}$`));
  if (plain) return pair(plain[1], plain[2]);
  let link = value;
  try { link = decodeURIComponent(value); } catch { /* keep it as typed */ }
  // Google's place marker (!3d…!4d…) is exact; @lat,lng is only where the view was centred.
  const patterns = [
    new RegExp(`!3d${number}!4d${number}`),
    new RegExp(`[?&](?:q|query|ll|destination|center|mlat)=${number}(?:,\\s*|&mlon=)${number}`),
    new RegExp(`#map=\\d+/${number}/${number}`),
    new RegExp(`@${number},${number}`),
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match) return pair(match[1], match[2]);
  }
  return null;
}

/** Where the map opens when nothing is pinned yet: the campus (override with VITE_CAMPUS_CENTER="lat,lng"). */
export const CAMPUS_CENTER = parsePin(import.meta.env.VITE_CAMPUS_CENTER) || { latitude: 9.1237, longitude: 125.5349 };

/** Move a pin by a number of metres east (dx) and north (dy). */
export const nudgePin = (pin, dx, dy) => ({
  latitude: Math.round((pin.latitude + dy / 111320) * 1e6) / 1e6,
  longitude: Math.round((pin.longitude + dx / (111320 * Math.cos((pin.latitude * Math.PI) / 180))) * 1e6) / 1e6,
});

/** Roughly how many metres apart two pins are (fine at stall distances). */
export const metresBetween = (a, b) => {
  const dy = (a.latitude - b.latitude) * 111320;
  const dx = (a.longitude - b.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

export const directionsUrl = ({ latitude, longitude }) => `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
