import Illustration from "../ui/Illustration.jsx";
// ── SkeletonCard ─────────────────────────────────────────────────────────────
export function SkeletonCard() {
  return (
    <div className="skel-card card">
      <div className="skeleton skel-img" />
      <div className="skel-body">
        <div className="skeleton skel-line short" />
        <div className="skeleton skel-line" />
        <div className="skeleton skel-line medium" />
        <div className="skel-footer">
          <div className="skeleton skel-price" />
          <div className="skeleton skel-btn" />
        </div>
      </div>
      <style>{`
        .skel-card { display: flex; flex-direction: column; overflow: hidden; }
        .skel-img { height: 180px; border-radius: 0; }
        .skel-body { padding: 0.875rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .skel-line { height: 14px; border-radius: 4px; }
        .skel-line.short  { width: 40%; }
        .skel-line.medium { width: 65%; }
        .skel-footer { display: flex; justify-content: space-between; margin-top: 0.5rem; }
        .skel-price { width: 60px; height: 20px; border-radius: 4px; }
        .skel-btn   { width: 34px; height: 34px; border-radius: 8px; }
      `}</style>
    </div>
  );
}

// ── SkeletonGrid ──────────────────────────────────────────────────────────────
export function SkeletonGrid({ count = 8 }) {
  return (
    <div className="product-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon, color = "gold", delta }) {
  const colors = {
    gold:    { bg: "var(--gold-50)",    text: "var(--gold-800)",    icon: "var(--gold-600)" },
    green:   { bg: "var(--green-50)",   text: "var(--green-800)",   icon: "var(--green-600)" },
    info:    { bg: "var(--color-info-light)", text: "var(--color-info)", icon: "var(--color-info)" },
    danger:  { bg: "var(--color-danger-light)", text: "var(--color-danger)", icon: "var(--color-danger)" },
    gray:    { bg: "var(--gray-100)",   text: "var(--gray-700)",    icon: "var(--gray-500)" },
  };
  const c = colors[color] || colors.gold;

  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: c.bg, color: c.icon }}>
        {icon}
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        {delta !== undefined && (
          <p className={`stat-delta ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </p>
        )}
      </div>
      <style>{`
        .stat-card {
          background: #fff;
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-xl);
          padding: 1.25rem 1.5rem;
          display: flex; align-items: center; gap: 1rem;
        }
        .stat-icon {
          width: 48px; height: 48px; border-radius: var(--radius-lg);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.35rem; flex-shrink: 0;
        }
        .stat-label { font-size: 0.8rem; color: var(--gray-500); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
        .stat-value { font-size: 1.6rem; font-weight: 700; color: var(--gray-900); line-height: 1.2; margin-top: 2px; }
        .stat-delta { font-size: 0.75rem; margin-top: 2px; font-weight: 500; }
        .stat-delta.up   { color: var(--color-success); }
        .stat-delta.down { color: var(--color-danger); }
      `}</style>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
// Older call sites pass an emoji icon; map it onto the shared illustrations.
const EMOJI_ILLUSTRATIONS = { "📋": "box", "🏪": "store", "👥": "chat", "📅": "calendar", "🔍": "search", "✅": "check" };
export function EmptyState({ icon = "📭", title, description, action }) {
  return (
    <div className="cm-empty cm-empty--compact">
      <Illustration name={EMOJI_ILLUSTRATIONS[icon] || "bag"} size={120} />
      {title && <h2>{title}</h2>}
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, maxWidth = 500 }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
      <style>{`
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--gray-200);
        }
        .modal-title { font-size: 1.1rem; font-weight: 700; color: var(--gray-900); }
        .modal-close {
          width: 32px; height: 32px; border-radius: var(--radius-md);
          display: flex; align-items: center; justify-content: center;
          color: var(--gray-500); font-size: 1rem;
          transition: var(--transition-fast);
        }
        .modal-close:hover { background: var(--gray-100); color: var(--gray-800); }
        .modal-body { padding: 1.5rem; }
      `}</style>
    </div>
  );
}