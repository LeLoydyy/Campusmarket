/**
 * People's names, one standard everywhere: letters only (ñ and accents are fine), single spaces,
 * each word starting with a capital ("dela cruz" → "Dela Cruz"). The backend applies the same rule.
 */

/** While typing: drops numbers and symbols, capitalises each word, keeps one trailing space. */
export const typeName = (value) =>
  String(value || "")
    .replace(/[^\p{L} ]+/gu, "")
    .replace(/ {2,}/g, " ")
    .replace(/^ /, "")
    .toLowerCase()
    .replace(/(^| )(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase())
    .slice(0, 80);

/** Finished value (on blur / submit): the same, without the trailing space. */
export const cleanName = (value) => typeName(value).trim();

/** "Juan", "Santos", "Dela Cruz" → "Juan Santos Dela Cruz" (middle name optional). */
export const joinName = ({ first, middle, last }) => [first, middle, last].map(cleanName).filter(Boolean).join(" ");

/** Problem with one name part, or "" when it's fine. */
export const namePartError = (value, label, { required = true } = {}) => {
  const name = cleanName(value);
  if (!name) return required ? `Enter your ${label}.` : "";
  if (name.replace(/ /g, "").length < 2 && required) return `Enter your full ${label}, not just an initial.`;
  return "";
};

/** Whole name in one box (profile, admin forms): needs at least a first and a last name. */
export const fullNameError = (value) => {
  const words = cleanName(value).split(" ").filter(Boolean);
  if (words.length < 2) return "Enter your first and last name.";
  if (words[0].length < 2 || words[words.length - 1].length < 2) return "Write out your first and last name in full.";
  return "";
};
