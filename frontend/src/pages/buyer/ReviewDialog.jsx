import { useEffect, useRef, useState } from "react";
import { Star, X } from "lucide-react";
import "./CancelOrderDialog.css";
import "./ReviewDialog.css";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const MAX_COMMENT = 1000;

/** Rate one product from a received order (1–5 stars plus an optional comment). Saving again edits it. */
export default function ReviewDialog({ productName, imageUrl, initial, submitting, onSubmit, onClose }) {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initial?.comment || "");
  const [touched, setTouched] = useState(false);
  const panel = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("input")?.focus();
    const onKey = (event) => { if (event.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose, submitting]);

  const shown = hover || rating;
  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (rating && !submitting) onSubmit({ rating, comment: comment.trim() });
  };

  return (
    <div className="cancel-dialog-layer" role="presentation" onClick={() => !submitting && onClose()}>
      <form ref={panel} className="cancel-dialog review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title"
        onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="cancel-dialog-head">
          <span className="review-dialog-thumb" aria-hidden="true">{imageUrl ? <img src={imageUrl} alt="" /> : <Star size={20} />}</span>
          <div>
            <h2 id="review-dialog-title">{initial ? "Edit your review" : "Rate this product"}</h2>
            <p>{productName}</p>
          </div>
          <button type="button" className="cancel-dialog-close" onClick={onClose} disabled={submitting} aria-label="Close"><X size={18} /></button>
        </header>

        <fieldset className="review-stars" onMouseLeave={() => setHover(0)}>
          <legend>Your rating</legend>
          <div>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className={value <= shown ? "is-on" : ""} onMouseEnter={() => setHover(value)}>
                <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} disabled={submitting} />
                <Star aria-hidden="true" />
                <span className="sr-only">{value} star{value === 1 ? "" : "s"} — {LABELS[value]}</span>
              </label>
            ))}
            <span className="review-stars-label" aria-hidden="true">{LABELS[shown] || "Tap a star"}</span>
          </div>
        </fieldset>

        <label className="cancel-dialog-other review-comment">
          <span>What did you think? <small>(optional)</small></span>
          <textarea rows={4} maxLength={MAX_COMMENT} value={comment} onChange={(event) => setComment(event.target.value)}
            placeholder="Taste, quality, how it was packed, how quick the seller was…" disabled={submitting} />
          <small>{comment.length}/{MAX_COMMENT}</small>
        </label>

        {touched && !rating && <p className="cancel-dialog-error" role="alert">Choose from 1 to 5 stars.</p>}
        <p className="review-dialog-note">Your name, rating and comment are shown on the product page.</p>

        <footer className="cancel-dialog-actions">
          <button type="button" className="cancel-dialog-keep" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || (touched && !rating)}>
            {submitting ? "Saving…" : initial ? "Save changes" : "Post review"}
          </button>
        </footer>
      </form>
    </div>
  );
}
