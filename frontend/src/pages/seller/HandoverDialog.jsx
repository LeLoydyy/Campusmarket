import { useEffect, useRef, useState } from "react";
import { FiKey, FiX } from "react-icons/fi";
import "../buyer/CancelOrderDialog.css";
import "./HandoverDialog.css";

/** Before handing over a pickup order, the seller types the 4-digit code the buyer shows them. */
export default function HandoverDialog({ orderCode, buyerName, submitting, error, onConfirm, onClose }) {
  const [code, setCode] = useState("");
  const input = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus();
    const onKey = (event) => { if (event.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [onClose, submitting]);

  const submit = (event) => {
    event.preventDefault();
    if (code.length === 4 && !submitting) onConfirm(code);
  };

  return (
    <div className="cancel-dialog-layer" role="presentation" onClick={() => !submitting && onClose()}>
      <form className="cancel-dialog handover-dialog" role="dialog" aria-modal="true" aria-labelledby="handover-title"
        onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header className="cancel-dialog-head">
          <span className="handover-icon" aria-hidden="true"><FiKey /></span>
          <div>
            <h2 id="handover-title">Hand over order #{orderCode}</h2>
            <p>Ask {buyerName || "the buyer"} for the pickup code on their Orders page, then type it here.</p>
          </div>
          <button type="button" className="cancel-dialog-close" onClick={onClose} disabled={submitting} aria-label="Close"><FiX /></button>
        </header>
        <label className="handover-code">
          <span className="sr-only">Pickup code</span>
          <input
            ref={input}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="0000"
            aria-invalid={Boolean(error)}
            disabled={submitting}
          />
        </label>
        {error && <p className="cancel-dialog-error" role="alert">{error}</p>}
        <footer className="cancel-dialog-actions">
          <button type="button" className="cancel-dialog-keep" onClick={onClose} disabled={submitting}>Not yet</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || code.length !== 4}>
            {submitting ? "Checking…" : "Confirm hand-over"}
          </button>
        </footer>
      </form>
    </div>
  );
}
