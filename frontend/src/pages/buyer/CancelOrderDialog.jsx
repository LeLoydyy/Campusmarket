import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import "./CancelOrderDialog.css";

export const CANCEL_REASONS = [
  "I ordered by mistake",
  "I want to change the items or quantity",
  "I found it cheaper somewhere else",
  "The pickup or delivery time doesn't work for me",
  "The seller is taking too long to confirm",
  "I don't need it anymore",
];
const OTHER = "other";
const MIN_OTHER = 3;
const MAX_OTHER = 300;

/** Asks the buyer why they're cancelling before the order is cancelled. */
export default function CancelOrderDialog({ orderReference, remainingLabel, submitting, onConfirm, onClose }) {
  const [choices, setChoices] = useState(() => new Set());
  const [otherText, setOtherText] = useState("");
  const [touched, setTouched] = useState(false);
  const panel = useRef(null);
  const otherInput = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("input")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose, submitting]);

  const wantsOther = choices.has(OTHER);
  useEffect(() => {
    if (wantsOther) otherInput.current?.focus();
  }, [wantsOther]);

  const toggle = (value) =>
    setChoices((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const otherTrimmed = otherText.trim();
  // Keep the listed order so the seller always reads reasons the same way.
  const reason = [
    ...CANCEL_REASONS.filter((value) => choices.has(value)),
    ...(wantsOther && otherTrimmed ? [otherTrimmed] : []),
  ].join("; ");
  const otherOk = !wantsOther || otherTrimmed.length >= MIN_OTHER;
  const valid = choices.size > 0 && otherOk;

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (valid && !submitting) onConfirm(reason);
  };

  return (
    <div className="cancel-dialog-layer" role="presentation" onClick={() => !submitting && onClose()}>
      <form
        ref={panel}
        className="cancel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        aria-describedby="cancel-dialog-desc"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="cancel-dialog-head">
          <span className="cancel-dialog-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
          <div>
            <h2 id="cancel-dialog-title">Cancel order #{orderReference}?</h2>
            <p id="cancel-dialog-desc">
              All items in this order will be cancelled. Let the seller know why. It helps them improve.
            </p>
          </div>
          <button type="button" className="cancel-dialog-close" onClick={onClose} disabled={submitting} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <fieldset className="cancel-dialog-reasons">
          <legend>Why are you cancelling? <small>Choose all that apply</small></legend>
          {[...CANCEL_REASONS, OTHER].map((value) => (
            <label key={value} className={`cancel-reason${choices.has(value) ? " is-selected" : ""}`}>
              <input
                type="checkbox"
                name="cancel-reason"
                value={value}
                checked={choices.has(value)}
                onChange={() => toggle(value)}
                disabled={submitting}
              />
              <span className="cancel-reason-box" aria-hidden="true" />
              <span>{value === OTHER ? "Other (tell us more)" : value}</span>
            </label>
          ))}
        </fieldset>

        {wantsOther && (
          <label className="cancel-dialog-other">
            <span className="sr-only">Your reason</span>
            <textarea
              ref={otherInput}
              rows={3}
              maxLength={MAX_OTHER}
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              placeholder="Write your reason here…"
              disabled={submitting}
              aria-invalid={touched && !otherOk}
            />
            <small>{otherText.length}/{MAX_OTHER}</small>
          </label>
        )}

        {touched && !valid && (
          <p className="cancel-dialog-error" role="alert">
            {choices.size === 0 ? "Choose at least one reason to continue." : `Write at least ${MIN_OTHER} characters for your other reason.`}
          </p>
        )}

        <footer className="cancel-dialog-actions">
          {remainingLabel && <small>Cancellation closes in <strong>{remainingLabel}</strong></small>}
          <button type="button" className="cancel-dialog-keep" onClick={onClose} disabled={submitting}>
            Keep order
          </button>
          <button type="submit" className="cancel-dialog-confirm" disabled={submitting || (touched && !valid)}>
            {submitting ? "Cancelling…" : "Cancel order"}
          </button>
        </footer>
      </form>
    </div>
  );
}
