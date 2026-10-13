import { useEffect, useRef, useState } from "react";
import { FiClock, FiX } from "react-icons/fi";
import "../buyer/CancelOrderDialog.css";
import "./HandoverDialog.css";

const CHOICES = [10, 15, 20, 30, 45, 60];
const clock = (minutes) => new Date(Date.now() + minutes * 60000).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

/** Confirming an order: the seller says roughly when it will be ready, and the buyer sees that time. */
export default function ReadyTimeDialog({ orderCode, submitting, onConfirm, onClose }) {
  const [minutes, setMinutes] = useState(15);
  const panel = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector("input:checked")?.focus();
    const onKey = (event) => { if (event.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [onClose, submitting]);

  return (
    <div className="cancel-dialog-layer" role="presentation" onClick={() => !submitting && onClose()}>
      <form ref={panel} className="cancel-dialog handover-dialog" role="dialog" aria-modal="true" aria-labelledby="ready-title"
        onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (!submitting) onConfirm(minutes); }}>
        <header className="cancel-dialog-head">
          <span className="handover-icon" aria-hidden="true"><FiClock /></span>
          <div>
            <h2 id="ready-title">Confirm order #{orderCode}</h2>
            <p>When will it be ready? The buyer sees this time on their order.</p>
          </div>
          <button type="button" className="cancel-dialog-close" onClick={onClose} disabled={submitting} aria-label="Close"><FiX /></button>
        </header>
        <fieldset className="ready-choices">
          <legend className="sr-only">Ready in</legend>
          {CHOICES.map((value) => (
            <label key={value} className={minutes === value ? "is-selected" : ""}>
              <input type="radio" name="ready-in" value={value} checked={minutes === value} onChange={() => setMinutes(value)} disabled={submitting} />
              <strong>{value} min</strong>
              <small>~{clock(value)}</small>
            </label>
          ))}
        </fieldset>
        <footer className="cancel-dialog-actions">
          <button type="button" className="cancel-dialog-keep" onClick={() => onConfirm(null)} disabled={submitting}>Confirm without a time</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Confirming…" : `Confirm · ready in ${minutes} min`}</button>
        </footer>
      </form>
    </div>
  );
}
