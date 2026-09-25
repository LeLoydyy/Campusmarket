/**
 * Chart colours (recharts needs literal values). Mirrors tokens.css:
 * charts use green-700, gold-500, teal-700 and coral only.
 */
export const CHART = {
  green: "#13703C",   // --green-700
  gold: "#F5B82E",    // --gold-500
  teal: "#1E6B6B",    // --teal-700
  coral: "#E8603C",   // --coral-500
  grid: "#ECE4D2",    // --line
  ink: "#4A5A50",     // --ink-600 (axis labels)
  surface: "#FFFFFF",
};

/** Series order for multi-series charts. */
export const SERIES = [CHART.green, CHART.gold, CHART.teal, CHART.coral];

export const tooltipStyle = { borderRadius: 14, border: "none", boxShadow: "0 10px 24px rgba(11,61,36,.14)", fontFamily: "Plus Jakarta Sans, sans-serif" };
