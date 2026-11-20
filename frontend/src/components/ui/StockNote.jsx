import { AlertCircle, Info } from "lucide-react";
import "./StockNote.css";

/**
 * Tells a buyer how many are left and why they can't pick more.
 *   stock   how many the seller has (of the chosen size, if any)
 *   qty     the quantity shown in the picker
 *   inCart  product page only: how many of the same item are already in their cart
 *   nudge   bump it when they press + at the limit; the note gives a small shake
 */
export default function StockNote({ stock, qty, inCart = 0, nudge = 0, className = "" }) {
  const left = Math.max(0, Number(stock) || 0);
  const canAdd = Math.max(0, left - inCart);
  if (left < 1) return null;

  let tone = null;
  let text = "";
  if (canAdd < 1) {
    tone = "limit";
    text = `You already have all ${left} in your cart — there are no more to add.`;
  } else if (qty >= canAdd) {
    tone = "limit";
    text = inCart > 0
      ? `Only ${left} left and ${inCart} ${inCart === 1 ? "is" : "are"} already in your cart, so ${canAdd} more is the most you can add.`
      : `Only ${left} left — that's all of them, so you can't add more.`;
  } else if (left <= 5) {
    tone = "low";
    text = inCart > 0 ? `Only ${left} left · ${inCart} already in your cart.` : `Hurry — only ${left} left.`;
  } else if (inCart > 0) {
    tone = "info";
    text = `${inCart} already in your cart · you can add up to ${canAdd} more.`;
  }
  if (!tone) return null;

  const Icon = tone === "info" ? Info : AlertCircle;
  return (
    <p key={nudge} className={`stock-note is-${tone} ${nudge ? "is-nudged" : ""} ${className}`} role="status">
      <Icon aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
