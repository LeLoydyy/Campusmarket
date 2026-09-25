/**
 * "Is this stall open right now?" — the same rule the frontend shows:
 * closed when the seller switched the store off; otherwise uses operating_hours
 * like "8:00 AM – 5:00 PM" in campus time (Asia/Manila), and assumes open when
 * the hours can't be read.
 */
const CAMPUS_TIME_ZONE = process.env.CAMPUS_TIME_ZONE || "Asia/Manila";

const parseClock = (text) => {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(text).trim());
  if (!m) return null;
  let hours = Number(m[1]) % 24;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours * 60 + Number(m[2] || 0);
};

const campusMinutes = (now) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CAMPUS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
};

export const isStallOpen = (stall, now = new Date()) => {
  if (!stall || stall.is_active === false) return false;
  const [from, to] = String(stall.operating_hours || "").split(/\s*[–—-]\s*|\s+to\s+/i);
  const start = from ? parseClock(from) : null;
  const end = to ? parseClock(to) : null;
  if (start === null || end === null) return true;
  const minutes = campusMinutes(now);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
};
