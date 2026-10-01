import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";

const LENGTH = 6;

/**
 * Six one-digit boxes that behave like one field: typing advances, Backspace steps back,
 * pasting or SMS/email autofill fills every box, and a full code calls onComplete.
 */
export default function OtpInput({ value, onChange, onComplete, invalid = false, disabled = false, autoFocus = false, labelledBy }) {
  const boxes = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, index) => value[index] || "");

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  // After a rejected code the boxes are cleared; put the cursor back so retyping just works.
  useEffect(() => {
    if (invalid && !value && !disabled) boxes.current[0]?.focus();
  }, [invalid, value, disabled]);

  const commit = (next) => {
    const code = next.slice(0, LENGTH);
    onChange(code);
    if (code.length === LENGTH) onComplete?.(code);
  };

  const fillFrom = (index, typed) => {
    const incoming = typed.replace(/\D/g, "");
    if (!incoming) return;
    // Overwrite from this box on, keeping any digits after the typed ones (fixing one digit mid-code).
    const next = (value.slice(0, index) + incoming + value.slice(index + incoming.length)).slice(0, LENGTH);
    commit(next);
    boxes.current[Math.min(index + incoming.length, LENGTH - 1)]?.focus();
  };

  const handleKeyDown = (index) => (e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      // Clear this box, or step back and clear the previous one when this box is empty.
      const target = digits[index] ? index : Math.max(0, index - 1);
      onChange(value.slice(0, target));
      boxes.current[target]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      boxes.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      boxes.current[index + 1]?.focus();
    }
  };

  return (
    <div className={`otp ${invalid ? "is-invalid" : ""}`} role="group" aria-labelledby={labelledBy}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => { boxes.current[index] = node; }}
          className={`otp-box ${digit ? "is-filled" : ""}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={index === 0 ? LENGTH : 1}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={digit}
          onFocus={(e) => e.target.select()}
          // Clicking past the first empty box lands on it, so digits can't go in out of order.
          onClick={() => { if (index > value.length) boxes.current[value.length]?.focus(); }}
          onChange={(e) => fillFrom(index, e.target.value)}
          onKeyDown={handleKeyDown(index)}
          onPaste={(e) => { e.preventDefault(); fillFrom(0, e.clipboardData.getData("text")); }}
        />
      ))}
    </div>
  );
}

/** "Resend code in 0:42", then a Resend button. `availableAt` is a timestamp in ms. */
export function ResendCode({ availableAt, onResend, busy = false }) {
  const [now, setNow] = useState(() => Date.now());
  const seconds = Math.max(0, Math.ceil((availableAt - now) / 1000));

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [seconds, availableAt]);

  if (seconds > 0) {
    return <span className="otp-resend is-waiting" aria-live="off">Resend code in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>;
  }
  return (
    <button type="button" className="otp-resend" onClick={onResend} disabled={busy}>
      <RotateCw aria-hidden="true" /> {busy ? "Sending…" : "Resend code"}
    </button>
  );
}

/** Development only: the API echoes the code when no real mailbox is configured. */
export function DevCodeHint({ code, onUse }) {
  if (!code) return null;
  return (
    <p className="otp-dev">
      Dev mode — no email is sent. Your code is <strong>{code}</strong>.
      <button type="button" onClick={() => onUse(code)}>Fill it in</button>
    </p>
  );
}
