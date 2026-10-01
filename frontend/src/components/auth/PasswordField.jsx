import { useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Lock, X } from "lucide-react";

/** Password input with show/hide and a Caps Lock warning (the most common cause of "wrong password"). */
export default function PasswordField({ id, label, labelAction, value, onChange, show, onToggleShow, describedBy, invalid, ...inputProps }) {
  const [capsLock, setCapsLock] = useState(false);
  const checkCaps = (e) => setCapsLock(Boolean(e.getModifierState?.("CapsLock")));
  const capsId = `${id}-caps`;

  return (
    <div className="form-group">
      <div className="pw-label-row">
        <label className="form-label" htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className="form-input-wrap">
        <Lock size={18} className="form-input-icon" aria-hidden="true" />
        <input
          id={id}
          type={show ? "text" : "password"}
          className="form-input"
          value={value}
          onChange={onChange}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, capsLock ? capsId : null].filter(Boolean).join(" ") || undefined}
          {...inputProps}
        />
        {onToggleShow && (
          <button type="button" className="form-input-toggle" onClick={onToggleShow} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {capsLock && <p id={capsId} className="field-note is-warn" role="status"><AlertTriangle aria-hidden="true" /> Caps Lock is on</p>}
    </div>
  );
}

// Required rules match the server (8+ characters, a letter, a number); the rest only raise the strength.
export const PASSWORD_RULES = [
  { label: "8+ characters", test: (value) => value.length >= 8, required: true },
  { label: "A letter", test: (value) => /[a-z]/i.test(value), required: true },
  { label: "A number", test: (value) => /\d/.test(value), required: true },
  { label: "Upper & lower case", test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: "A symbol", test: (value) => /[^a-z0-9]/i.test(value) },
];
export const passwordMeetsRules = (value) => PASSWORD_RULES.every((rule) => !rule.required || rule.test(value));

const LEVELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];

export function PasswordStrength({ id, value }) {
  const passed = PASSWORD_RULES.filter((rule) => rule.test(value)).length;
  const meets = passwordMeetsRules(value);
  // Missing a required rule caps the meter at "Weak" however many extras pass.
  const level = !value ? 0 : meets ? Math.min(4, passed - 1 + (value.length >= 12 ? 1 : 0)) : Math.min(1, passed - 1);

  return (
    <div id={id} className="pw-strength" data-level={value ? level : undefined}>
      <div className="pw-meter" aria-hidden="true">{[0, 1, 2, 3].map((bar) => <span key={bar} className={value && bar < Math.max(1, level) ? "is-on" : ""} />)}</div>
      <p className="pw-level" aria-live="polite">{value ? <>Password strength: <strong>{LEVELS[Math.max(0, level)]}</strong></> : "Use a password you don't use anywhere else."}</p>
      <ul className="pw-rules">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(value);
          return (
            <li key={rule.label} className={ok ? "is-ok" : ""}>
              {ok ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
              {rule.label}{!rule.required && <span className="pw-optional"> (stronger)</span>}
              <span className="sr-only">{ok ? " — done" : " — not yet"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
