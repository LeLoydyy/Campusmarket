import { useState } from "react";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { SECURITY_QUESTIONS } from "../../utils/adminAccess.js";

export const emptyRecoveryQuestions = (count = 3) => SECURITY_QUESTIONS.slice(0, count).map((question) => ({ question, answer: "" }));

/** Ready to submit: different questions, each answered with 2+ characters. */
export const recoveryQuestionsComplete = (items) =>
  items.length > 0 && new Set(items.map((item) => item.question)).size === items.length && items.every((item) => item.answer.trim().length >= 2);

/**
 * Security questions for password recovery: one for buyers and sellers, three for administrators.
 * Answers are hidden like passwords (with a show toggle) and stored hashed. An account's only
 * question, or any two of three, unlocks a password reset (after an emailed code).
 */
export default function RecoveryQuestions({ value, onChange, idPrefix = "rq" }) {
  const single = value.length === 1;
  const title = single ? "Security question" : "Security questions";
  const note = single ? "If you forget your password, we'll email you a code and ask you this to reset it." : "If you forget your password, any two correct answers let you reset it.";
  const [shown, setShown] = useState(() => value.map(() => false));
  const update = (index, changes) => onChange(value.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const toggle = (index) => setShown((current) => current.map((on, i) => (i === index ? !on : on)));
  const isAnswered = (item) => item.answer.trim().length >= 2;
  const answered = value.filter(isAnswered).length;

  return (
    <fieldset className="rq">
      <legend className="sr-only">{title}</legend>
      <div className="rq-head">
        <div className="rq-head-row">
          <p className="auth-section-title" aria-hidden="true">{title}</p>
          {!single && <span className={`rq-count ${answered === value.length ? "is-complete" : ""}`} aria-live="polite">{answered} of {value.length} answered</span>}
        </div>
        <p className="rq-head-note">{note} Answers aren&apos;t case-sensitive.</p>
      </div>
      <ol className="rq-list">
        {value.map((item, index) => {
          // Each question can only be picked once.
          const taken = value.filter((_, i) => i !== index).map((other) => other.question);
          const done = isAnswered(item);
          return (
            <li key={index} className={`rq-item ${done ? "is-done" : ""}`}>
              {/* A clear select sits over the text, so long questions wrap instead of being cut off. */}
              <div className="rq-q">
                {(!single || done) && <span className="rq-num" aria-hidden="true">{done ? <Check /> : index + 1}</span>}
                <span className="rq-q-text" aria-hidden="true">{item.question}</span>
                <ChevronDown className="rq-q-caret" aria-hidden="true" />
                <label className="sr-only" htmlFor={`${idPrefix}-q${index}`}>Question {index + 1}</label>
                <select id={`${idPrefix}-q${index}`} className="rq-question" value={item.question} onChange={(e) => update(index, { question: e.target.value })}>
                  {SECURITY_QUESTIONS.map((question) => <option key={question} disabled={taken.includes(question)}>{question}</option>)}
                </select>
              </div>
              <label className="sr-only" htmlFor={`${idPrefix}-a${index}`}>Answer {index + 1}</label>
              <div className="form-input-wrap">
                <input
                  id={`${idPrefix}-a${index}`} type={shown[index] ? "text" : "password"} className="form-input rq-answer"
                  autoComplete="off" spellCheck={false} required minLength={2} maxLength={100}
                  placeholder="Your answer" value={item.answer} onChange={(e) => update(index, { answer: e.target.value })}
                />
                <button type="button" className="form-input-toggle" onClick={() => toggle(index)} aria-label={shown[index] ? `Hide answer ${index + 1}` : `Show answer ${index + 1}`} aria-pressed={shown[index]}>
                  {shown[index] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}
