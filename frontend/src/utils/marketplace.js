/**
 * Small helpers shared by cards and pages: pluralisation, "new" products,
 * stall opening hours and event scheduling.
 */

/** "1 space", "2 spaces", "1 category", "3 categories". */
export const plural = (count, singular, pluralForm) => {
  const n = Number(count) || 0;
  const word = n === 1 ? singular : pluralForm || (singular.endsWith("y") && !/[aeiou]y$/.test(singular) ? `${singular.slice(0, -1)}ies` : `${singular}s`);
  return `${n.toLocaleString("en-PH")} ${word}`;
};

const DAY = 86400000;

/** Added within the last 7 days. */
export const isNewProduct = (product, now = Date.now()) => {
  const created = Date.parse(product?.created_at);
  return Number.isFinite(created) && now - created >= 0 && now - created <= 7 * DAY;
};

/** Minutes after midnight for "8:00 AM", "5pm", "17:30". */
const parseClock = (text) => {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(text).trim());
  if (!m) return null;
  let hours = Number(m[1]) % 24;
  const minutes = Number(m[2] || 0);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

/**
 * Whether a stall is open right now.
 * Closed when the seller switched the store off; otherwise uses operating_hours
 * like "8:00 AM – 5:00 PM" when it can be read, and assumes open when it can't.
 * @returns {{ open: boolean, label: string }}
 */
export const stallOpenStatus = (stall, now = new Date()) => {
  if (!stall) return { open: false, label: "Closed" };
  if (stall.is_active === false || (stall.status && !["approved", "active"].includes(stall.status))) {
    return { open: false, label: "Closed" };
  }
  const [from, to] = String(stall.operating_hours || "").split(/\s*[–—-]\s*|\s+to\s+/i);
  const start = from ? parseClock(from) : null;
  const end = to ? parseClock(to) : null;
  if (start === null || end === null) return { open: true, label: "Open" };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return { open, label: open ? `Open · until ${to.trim()}` : `Closed · opens ${from.trim()}` };
};

// ── Events ───────────────────────────────────────────────────────────────────
export const eventStart = (event) => event?.starts_at || event?.start_date || event?.start_at || event?.date;
export const eventEnd = (event) => event?.ends_at || event?.end_date || event?.end_at || event?.date_end;

/** Parses "YYYY-MM-DD" as a local date (not UTC midnight). */
export const parseEventDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const endOfDay = (date) => { const result = new Date(date); result.setHours(23, 59, 59, 999); return result; };

/** "upcoming" | "ongoing" | "past" */
export const eventStatus = (event, now = new Date()) => {
  const start = parseEventDate(eventStart(event));
  if (!start) return "upcoming";
  const rawEnd = eventEnd(event);
  const parsedEnd = parseEventDate(rawEnd);
  const end = parsedEnd ? (/^\d{4}-\d{2}-\d{2}$/.test(String(rawEnd)) ? endOfDay(parsedEnd) : parsedEnd) : endOfDay(start);
  if (start > now) return "upcoming";
  if (end >= now) return "ongoing";
  return "past";
};

export const formatEventDate = (event) => {
  const start = parseEventDate(eventStart(event));
  if (!start) return "Date to be announced";
  const end = parseEventDate(eventEnd(event));
  const options = { weekday: "short", month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString("en-PH", options);
  if (end && start.toDateString() !== end.toDateString()) return `${startLabel} – ${end.toLocaleDateString("en-PH", options)}`;
  return startLabel;
};

/** Time left until an event starts, for countdowns. */
export const timeUntil = (date, now = Date.now()) => {
  const ms = Math.max(0, date - now);
  return {
    total: ms,
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
  };
};

/** Google Calendar link for "Add to calendar" (all-day event). */
export const calendarLink = (event) => {
  const start = parseEventDate(eventStart(event));
  if (!start) return null;
  const end = new Date(parseEventDate(eventEnd(event)) || start);
  end.setDate(end.getDate() + 1);
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${ymd(start)}/${ymd(end)}`,
    location: event.location || "CSU Cabadbaran Campus",
    details: event.description || "Campus Market event at CSUCC.",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
};
