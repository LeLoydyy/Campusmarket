/** Loading placeholders shaped like the content they stand in for. */
export function ProductCardSkeleton() {
  return (
    <div className="pc pc--skeleton" aria-hidden="true">
      <div className="cm-skel pc-skel-media" />
      <div className="pc-body">
        <div className="cm-skel cm-skel-line" style={{ width: "55%" }} />
        <div className="cm-skel cm-skel-line" style={{ width: "85%", height: 16 }} />
        <div className="cm-skel cm-skel-line" style={{ width: "40%" }} />
        <div className="cm-skel cm-skel-line" style={{ width: "35%", height: 20 }} />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8, className = "pc-grid" }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  );
}

export function SkeletonBlock({ height = 120, className = "" }) {
  return <div className={`cm-skel ${className}`} style={{ height }} aria-hidden="true" />;
}
