/**
 * Chips and status badges. Colours come only from the design tokens:
 * categories use --cat-* and statuses map onto green / gold / coral / teal.
 */

const CATEGORY_LABELS = {
  food: "Food",
  clothing: "Clothing",
  electronics: "Electronics",
  accessories: "Accessories",
  "student-made": "Student Made",
  merchandise: "Merchandise",
  "mixed-use": "Mixed",
  mixed: "Mixed",
  other: "Other",
};

export const categoryKey = (value) => {
  const key = String(value || "other").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (key === "student-made" || key === "studentmade") return "student-made";
  return ["food", "clothing", "electronics", "accessories"].includes(key) ? key : key === "merchandise" ? "clothing" : "other";
};

export const categoryLabel = (value) => {
  const raw = String(value || "other").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return CATEGORY_LABELS[raw] || String(value || "Other").replace(/[-_]+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

/** Category label in its category colour. "Student Made" gets the sticker style. */
export function CategoryChip({ category, size = "md", className = "" }) {
  const key = categoryKey(category);
  return (
    <span className={`cm-chip cm-chip--cat cm-chip--${key} cm-chip--${size} ${className}`}>
      {categoryLabel(category)}
    </span>
  );
}

/** Selectable pill used for filters and tabs. */
export function FilterChip({ active = false, count, children, className = "", ...props }) {
  return (
    <button type="button" className={`cm-chip cm-chip--filter ${active ? "is-active" : ""} ${className}`} aria-pressed={active} {...props}>
      {children}
      {count !== undefined && <span className="cm-chip-count">{count}</span>}
    </button>
  );
}

const STATUS_TONES = {
  pending: "gold", reserved: "gold", preparing: "gold", confirmed: "teal", ready: "green", upcoming: "teal",
  approved: "green", active: "green", completed: "green", delivered: "green", available: "green", open: "green", ongoing: "green",
  rejected: "coral", banned: "coral", suspended: "coral", cancelled: "coral", canceled: "coral", occupied: "neutral", closed: "neutral", past: "neutral",
};

/** Status pill: pending = gold, approved = green, banned/rejected = coral. */
export function StatusChip({ status, label, className = "" }) {
  const key = String(status || "").toLowerCase();
  const tone = STATUS_TONES[key] || "neutral";
  const text = label || key.replace(/[-_]+/g, " ").replace(/\b\w/, (l) => l.toUpperCase());
  return <span className={`cm-chip cm-chip--status cm-tone-${tone} ${className}`}><i aria-hidden="true" />{text}</span>;
}
