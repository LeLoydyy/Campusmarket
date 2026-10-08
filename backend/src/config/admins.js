/**
 * Administrator rules shared by the API: privileges, duty shifts and starter passwords.
 *
 * Every admin has the full ("super admin") feature set unless another admin narrows it
 * with `permissions`. NULL permissions means every privilege, which is how existing
 * administrators keep working after an upgrade.
 */
import { randomInt } from "crypto";

export const ADMIN_PERMISSIONS = {
  approve: "Approve or reject registrations",
  block: "Block and unblock accounts",
  edit: "Edit account information",
  delete: "Remove accounts",
  admins: "Create and manage administrators",
  logs: "View login logs and admin activity",
  marketplace: "Manage stores, events and applications",
};
export const PERMISSION_KEYS = Object.keys(ADMIN_PERMISSIONS);

export const hasPermission = (user, permission) =>
  user?.role === "admin" && (user.permissions == null || user.permissions.includes(permission));

// ── Shifts ────────────────────────────────────────────────────────────────────
// Stored as minutes after midnight in Philippine time; 1440 means midnight at the end of the day.
export const SHIFT_TIME_ZONE = "Asia/Manila";
export const SHIFT_PRESETS = {
  morning: { label: "Morning shift", start: 8 * 60, end: 17 * 60 },
  evening: { label: "Evening shift", start: 17 * 60, end: 24 * 60 },
  anytime: { label: "Any time", start: null, end: null },
};

const minutesNow = (date = new Date()) => {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", { timeZone: SHIFT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(date).split(":").map(Number);
  return hours * 60 + minutes;
};

const hasShift = (user) => user?.role === "admin" && user.shift_start != null && user.shift_end != null;

/** True when the user may be signed in right now (non-admins and "any time" admins always may). */
export const isOnShift = (user, date = new Date()) => {
  if (!hasShift(user)) return true;
  const now = minutesNow(date);
  const { shift_start: start, shift_end: end } = user;
  // Overnight shifts (e.g. 22:00–06:00) wrap past midnight.
  return start < end ? now >= start && now < end : now >= start || now < end;
};

export const formatShiftTime = (minutes) => {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours24 % 12 || 12}:${mins} ${hours24 < 12 ? "AM" : "PM"}`;
};

export const describeShift = (user) => (hasShift(user) ? `${formatShiftTime(user.shift_start)} – ${formatShiftTime(user.shift_end)}` : "Any time");

/** ISO time the current shift ends, or null for "any time" / off-shift admins. */
export const shiftEndsAt = (user, date = new Date()) => {
  if (!hasShift(user) || !isOnShift(user, date)) return null;
  const now = minutesNow(date);
  const minutesLeft = (user.shift_end - now + 1440) % 1440 || 1440;
  const at = new Date(date.getTime() + minutesLeft * 60000);
  at.setSeconds(0, 0);
  return at.toISOString();
};

/** Adds `shift` details for the client; strips nothing. */
export const withShift = (user) => user && (user.role === "admin"
  ? { ...user, shift: { label: describeShift(user), start: user.shift_start, end: user.shift_end, on_duty: isOnShift(user), ends_at: shiftEndsAt(user) } }
  : user);

// ── Starter passwords ─────────────────────────────────────────────────────────
// "@kamot482-": symbol + pronounceable 5 letters + 3 digits + symbol. Easy to read out and type,
// still about 30 bits of entropy, and it's replaced at the first-login setup anyway.
const CONSONANTS = "bdfghjklmnprstvz";
const VOWELS = "aeiou";
const SYMBOLS = "@#$!?";
const pick = (chars) => chars[randomInt(chars.length)];

export const generateStarterPassword = () => {
  const word = [CONSONANTS, VOWELS, CONSONANTS, VOWELS, CONSONANTS].map(pick).join("");
  const digits = String(randomInt(0, 1000)).padStart(3, "0");
  return `${pick(SYMBOLS)}${word}${digits}-`;
};
