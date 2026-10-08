import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { SECURITY_QUESTIONS } from "../../utils/adminAccess.js";

export const emptyRecoveryQuestions = () => SECURITY_QUESTIONS.slice(0, 3).map((question) => ({ question, answer: "" }));

/** Ready to submit: three different questions, each answered with 2+ characters. */
export const recoveryQuestionsComplete = (items) =>
  items.length === 3 && new Set(items.map((item) => item.question)).size === 3 && items.every((item) => item.answer.trim().length >= 2);

/**
 * Three security questions for password recovery. Answers are hidden like passwords
 * (with a show toggle) and stored hashed; any two of the three unlock a password reset.
 */
export default function RecoveryQuestions({ value, onChange, idPrefix = "rq", note = "Forgot your password? After an emailed code, answering any two of these lets you set a new one." }) {
  const [shown, setShown] = useState([false, false, false]);
  const update = (index, changes) => onChange(value.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const toggle = (index) => setShown((current) => current.map((on, i) => (i === index ? !on : on)));

  return (
    <fieldset className="reg-security">
      <legend><KeyRound aria-hidden="true" /> Security questions</legend>
      <p className="reg-note">{note} Answers aren&apos;t case-sensitive.</p>
      {value.map((item, index) => {
        // Each question can only be picked once.
        const taken = value.filter((_, i) => i !== index).map((other) => other.question);
        return (
          <div key={index} className="rq-item">
            <div className="form-group">
              <label className="form-label" htmlFor={`${idPrefix}-q${index}`}>Question {index + 1}</label>
              <select id={`${idPrefix}-q${index}`} className="form-input form-select" value={item.question} onChange={(e) => update(index, { question: e.target.value })}>
                {SECURITY_QUESTIONS.map((question) => <option key={question} disabled={taken.includes(question)}>{question}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${idPrefix}-a${index}`}>Answer {index + 1}</label>
              <div className="form-input-wrap">
                <input
                  id={`${idPrefix}-a${index}`} type={shown[index] ? "text" : "password"} className="form-input rq-answer"
                  autoComplete="off" spellCheck={false} required minLength={2} maxLength={100}
                  placeholder="Hidden as you type" value={item.answer} onChange={(e) => update(index, { answer: e.target.value })}
                />
                <button type="button" className="form-input-toggle" onClick={() => toggle(index)} aria-label={shown[index] ? `Hide answer ${index + 1}` : `Show answer ${index + 1}`} aria-pressed={shown[index]}>
                  {shown[index] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
