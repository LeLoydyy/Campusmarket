/**
 * Admin privileges and shifts, mirroring backend/src/config/admins.js.
 * Every admin has every privilege unless another admin narrowed `permissions`.
 * The server enforces all of this; the page only hides what would be refused.
 */
export const ADMIN_PERMISSIONS = [
  { key: "approve", label: "Approve registrations", hint: "Accept or reject new CSUCC accounts" },
  { key: "block", label: "Block accounts", hint: "Block, unblock and sign people out" },
  { key: "edit", label: "Edit account info", hint: "Change names, emails and ID numbers" },
  { key: "delete", label: "Remove accounts", hint: "Remove and restore accounts, with a reason" },
  { key: "admins", label: "Manage administrators", hint: "Create admins, set shifts and privileges" },
  { key: "logs", label: "View logs", hint: "Login logs and admin activity" },
  { key: "marketplace", label: "Marketplace", hint: "Stores, plans, events and applications" },
];

export const can = (user, permission) => user?.role === "admin" && (user.permissions == null || user.permissions.includes(permission));

export const SHIFT_PRESETS = [
  { key: "morning", label: "Morning", start: 8 * 60, end: 17 * 60 },
  { key: "evening", label: "Evening", start: 17 * 60, end: 24 * 60 },
  { key: "anytime", label: "Any time", start: null, end: null },
];

export const shiftPresetOf = (start, end) =>
  SHIFT_PRESETS.find((preset) => preset.start === (start ?? null) && preset.end === (end ?? null))?.key || "custom";

/** 480 → "08:00" for <input type="time">; 1440 (midnight at the end of the day) → "00:00". */
export const minutesToTime = (minutes) => (minutes == null ? "" : `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
/** "17:30" → 1050. An end of "00:00" means midnight at the end of the day (1440). */
export const timeToMinutes = (value, { isEnd = false } = {}) => {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes;
  return isEnd && total === 0 ? 1440 : total;
};

export const formatMinutes = (minutes) => {
  const hours = Math.floor(minutes / 60) % 24;
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};
export const describeShift = (start, end) => (start == null ? "Any time" : `${formatMinutes(start)} – ${formatMinutes(end)}`);

/** Philippine date/time for logs, e.g. "Oct 1, 2026, 8:02 AM". */
export const formatDateTime = (value) => (value
  ? new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  : "—");

export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What was the name of your elementary school?",
  "What was your childhood nickname?",
  "In what town or city was your mother born?",
  "What is the name of your favorite teacher?",
  "What was the first concert or event you attended?",
  "What is your favorite Filipino dish?",
  "What street did you grow up on?",
];
