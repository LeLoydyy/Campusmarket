/** Quotes a value for CSV (commas, quotes and line breaks are safe; formula-like text is defused). */
const cell = (value) => {
  let text = value == null ? "" : String(value);
  // Text starting like a formula (=, +, -, @) is shown as text instead of being run by the spreadsheet.
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Downloads rows (arrays) as a CSV file that opens correctly in Excel and Google Sheets. */
export const downloadCsv = (filename, header, rows) => {
  const text = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** "2026-10-13" for file names. */
export const csvDate = () => new Date().toISOString().slice(0, 10);
