/**
 * KPI card: coloured icon tile, value, label, optional trend and a scope note
 * that says exactly what the number covers.
 *
 * tone: green | gold | teal | coral
 * delta: percentage change vs the previous period (number) or null when unknown
 */
export default function StatCard({ icon: Icon, label, value, tone = "green", delta, deltaLabel = "vs last period", scope, className = "" }) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const direction = !hasDelta ? "" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <article className={`cm-stat cm-stat--${tone} ${className}`}>
      {Icon && <span className="cm-stat-icon" aria-hidden="true"><Icon /></span>}
      <div className="cm-stat-body">
        <p className="cm-stat-label">{label}</p>
        <p className="cm-stat-value">{value}</p>
        {hasDelta && (
          <p className={`cm-stat-delta is-${direction}`}>
            <span aria-hidden="true">{direction === "up" ? "↑" : direction === "down" ? "↓" : "→"}</span>
            {" "}{Math.abs(delta).toFixed(0)}% <span className="cm-stat-delta-label">{deltaLabel}</span>
          </p>
        )}
        {scope && <p className="cm-stat-scope">{scope}</p>}
      </div>
    </article>
  );
}
