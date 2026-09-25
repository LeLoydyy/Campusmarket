import { Link } from "react-router-dom";
import Illustration from "./Illustration.jsx";

/**
 * Every empty state: an illustration, a heading, one helpful sentence and a way forward.
 * `action` is { label, to } for a link, or { label, onClick } for a button.
 */
export default function EmptyState({ illustration = "bag", title, description, action, secondaryAction, compact = false, className = "" }) {
  const renderAction = (item, primary) => {
    if (!item) return null;
    const cls = `btn ${primary ? "btn-primary" : "btn-outline"}`;
    return item.to
      ? <Link className={cls} to={item.to}>{item.label}</Link>
      : item.href
        ? <a className={cls} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
        : <button type="button" className={cls} onClick={item.onClick}>{item.label}</button>;
  };
  return (
    <section className={`cm-empty ${compact ? "cm-empty--compact" : ""} ${className}`}>
      <Illustration name={illustration} size={compact ? 120 : 170} />
      {title && <h2>{title}</h2>}
      {description && <p>{description}</p>}
      {(action || secondaryAction) && (
        <div className="cm-empty-actions">
          {renderAction(action, true)}
          {renderAction(secondaryAction, false)}
        </div>
      )}
    </section>
  );
}
