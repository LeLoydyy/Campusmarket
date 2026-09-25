import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowDown, SlidersHorizontal, X } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import ProductCard from "../../components/ui/ProductCard.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { SkeletonGrid } from "../../components/ui/Skeleton.jsx";
import { categoryLabel } from "../../components/ui/Chip.jsx";
import { productService } from "../../services/api.js";
import { plural } from "../../utils/marketplace.js";
import "./Browse.css";

const CATEGORIES = [
  { id: "food", name: "Food" },
  { id: "clothing", name: "Clothing" },
  { id: "electronics", name: "Electronics" },
  { id: "accessories", name: "Accessories" },
  { id: "student-made", name: "Student Made" },
  { id: "other", name: "Other" },
];

const SORTS = [
  { id: "", label: "Recommended" },
  { id: "newest", label: "Newest first" },
  { id: "popular", label: "Most viewed" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
];

const PRICE_MAX = 1000;
const FILTER_KEYS = ["q", "category", "min_price", "max_price", "sort", "location", "open_now"];

const getFiltersFromParams = (params) => ({
  q: params.get("q")?.trim() || "",
  category: params.get("category") || "",
  min_price: params.get("min_price") || "",
  max_price: params.get("max_price") || "",
  sort: params.get("sort") || "",
  location: params.get("location") || "",
  open_now: params.get("open_now") === "true" ? "true" : "",
});

const compactFilters = (filters) =>
  Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== "" && value != null,
    ),
  );

const filtersAreEqual = (left, right) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
};

const mergeUniqueProducts = (currentProducts, nextProducts) => {
  const productsById = new Map();

  [...currentProducts, ...nextProducts].forEach((product) => {
    productsById.set(product.id, product);
  });

  return Array.from(productsById.values());
};

function useBrowseProducts(initialFilters = {}, limit = 20) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(() => ({ ...initialFilters }));
  const [refreshKey, setRefreshKey] = useState(0);
  const latestRequestRef = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    let active = true;

    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data } = await productService.getAll({
          ...compactFilters(filters),
          page,
          limit,
        });

        if (!active || latestRequestRef.current !== requestId) return;

        const nextProducts = Array.isArray(data?.data) ? data.data : [];
        const nextTotal = Number(data?.total) || 0;

        setProducts((currentProducts) =>
          page === 1
            ? nextProducts
            : mergeUniqueProducts(currentProducts, nextProducts),
        );
        setTotal(nextTotal);
      } catch (requestError) {
        if (!active || latestRequestRef.current !== requestId) return;

        setError(
          requestError.response?.data?.error ||
            requestError.message ||
            "Failed to load products",
        );

        if (page === 1) {
          setProducts([]);
          setTotal(0);
        }
      } finally {
        if (active && latestRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    };

    fetchProducts();

    return () => {
      active = false;
    };
  }, [filters, limit, page, refreshKey]);

  const updateFilters = useCallback((newFilters) => {
    const nextFilters = { ...filtersRef.current, ...newFilters };
    if (filtersAreEqual(filtersRef.current, nextFilters)) return;

    filtersRef.current = nextFilters;
    setProducts([]);
    setTotal(0);
    setPage(1);
    setFilters(nextFilters);
  }, []);

  const replaceFilters = useCallback((newFilters = {}) => {
    const nextFilters = { ...newFilters };
    if (filtersAreEqual(filtersRef.current, nextFilters)) return;

    filtersRef.current = nextFilters;
    setProducts([]);
    setTotal(0);
    setPage(1);
    setFilters(nextFilters);
  }, []);

  const loadMore = useCallback(() => {
    if (loading || products.length >= total) return;
    setPage((currentPage) => currentPage + 1);
  }, [loading, products.length, total]);

  const refetch = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  return {
    products,
    loading,
    error,
    total,
    hasMore: products.length < total,
    isInitialLoading: loading && page === 1,
    isLoadingMore: loading && page > 1,
    filters,
    updateFilters,
    replaceFilters,
    loadMore,
    refetch,
  };
}

/** Dual-thumb price slider plus number fields; reports a change when the user lets go. */
function PriceRange({ min, max, onCommit }) {
  const id = useId();
  const [low, setLow] = useState(min === "" ? 0 : Number(min));
  const [high, setHigh] = useState(max === "" ? PRICE_MAX : Number(max));
  useEffect(() => { setLow(min === "" ? 0 : Number(min)); setHigh(max === "" ? PRICE_MAX : Number(max)); }, [min, max]);
  const commit = (nextLow = low, nextHigh = high) => {
    const a = Math.max(0, Math.min(nextLow, nextHigh));
    const b = Math.max(nextLow, nextHigh);
    onCommit({ min_price: a > 0 ? String(a) : "", max_price: b < PRICE_MAX ? String(b) : "" });
  };
  const pct = (value) => `${(Math.min(value, PRICE_MAX) / PRICE_MAX) * 100}%`;
  return (
    <fieldset className="bf-group">
      <legend>Price</legend>
      <div className="bf-range" style={{ "--lo": pct(low), "--hi": pct(high) }}>
        <input type="range" min="0" max={PRICE_MAX} step="10" value={Math.min(low, PRICE_MAX)} aria-label="Minimum price"
          onChange={(e) => setLow(Math.min(Number(e.target.value), high))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
        <input type="range" min="0" max={PRICE_MAX} step="10" value={Math.min(high, PRICE_MAX)} aria-label="Maximum price"
          onChange={(e) => setHigh(Math.max(Number(e.target.value), low))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
      </div>
      <div className="bf-price-inputs">
        <label htmlFor={`${id}-min`}><span>Min</span>
          <span className="bf-peso"><b aria-hidden="true">₱</b><input id={`${id}-min`} type="number" inputMode="numeric" min="0" value={low}
            onChange={(e) => setLow(Math.max(0, Number(e.target.value) || 0))} onBlur={() => commit()} /></span>
        </label>
        <span aria-hidden="true" className="bf-dash">–</span>
        <label htmlFor={`${id}-max`}><span>Max</span>
          <span className="bf-peso"><b aria-hidden="true">₱</b><input id={`${id}-max`} type="number" inputMode="numeric" min="0" value={high >= PRICE_MAX && max === "" ? "" : high} placeholder="Any"
            onChange={(e) => setHigh(e.target.value === "" ? PRICE_MAX : Math.max(0, Number(e.target.value)))} onBlur={() => commit()} /></span>
        </label>
      </div>
    </fieldset>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="bf-toggle">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

/** All filters; used in the desktop sidebar and the mobile bottom sheet. */
function FilterPanel({ filters, locations, onChange, onClear, activeCount }) {
  return (
    <div className="bf-panel">
      <div className="bf-head">
        <h2>Filters</h2>
        {activeCount > 0 && <button type="button" className="bf-clear" onClick={onClear}>Clear all</button>}
      </div>
      <Toggle label="Open now" hint="Stalls open at this hour" checked={filters.open_now === "true"} onChange={(on) => onChange({ open_now: on ? "true" : "" })} />
      <Toggle label="Student Made" hint="Handmade by CSUCC students" checked={filters.category === "student-made"} onChange={(on) => onChange({ category: on ? "student-made" : "" })} />
      <fieldset className="bf-group">
        <legend>Category</legend>
        <div className="bf-cats">
          {[{ id: "", name: "All" }, ...CATEGORIES].map((category) => (
            <button key={category.id || "all"} type="button" className={`bf-cat bf-cat--${category.id || "all"} ${filters.category === category.id ? "is-active" : ""}`}
              aria-pressed={filters.category === category.id} onClick={() => onChange({ category: category.id })}>
              <i aria-hidden="true" />{category.name}
            </button>
          ))}
        </div>
      </fieldset>
      <PriceRange min={filters.min_price} max={filters.max_price} onCommit={onChange} />
      <fieldset className="bf-group">
        <legend>Pickup location</legend>
        <select className="bf-select" value={filters.location} onChange={(e) => onChange({ location: e.target.value })} aria-label="Pickup location">
          <option value="">Anywhere on campus</option>
          {locations.map((location) => <option key={location} value={location}>{location}</option>)}
        </select>
      </fieldset>
    </div>
  );
}

export function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const urlFilters = useMemo(() => getFiltersFromParams(new URLSearchParams(queryString)), [queryString]);
  const { products, loading, error, total, hasMore, isInitialLoading, isLoadingMore, filters, replaceFilters, loadMore, refetch } = useBrowseProducts(urlFilters);
  const [locations, setLocations] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => { replaceFilters(urlFilters); }, [replaceFilters, urlFilters]);
  useEffect(() => { productService.getLocations().then(({ data }) => setLocations(Array.isArray(data) ? data : [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const escape = (event) => { if (event.key === "Escape") setSheetOpen(false); };
    document.addEventListener("keydown", escape);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", escape); document.body.style.overflow = ""; };
  }, [sheetOpen]);

  // The URL is the source of truth: every change goes through ?params.
  const commit = (changes) => {
    const next = new URLSearchParams(searchParams);
    const merged = { ...urlFilters, ...changes };
    FILTER_KEYS.forEach((key) => {
      const value = String(merged[key] || "").trim();
      if (value) next.set(key, value); else next.delete(key);
    });
    setSearchParams(next, { replace: true });
  };
  const clearAll = () => commit({ category: "", min_price: "", max_price: "", location: "", open_now: "", q: "" });

  const activeChips = [
    filters.q && { key: "q", label: `“${filters.q}”`, clear: { q: "" } },
    filters.category && { key: "category", label: categoryLabel(filters.category), clear: { category: "" } },
    (filters.min_price || filters.max_price) && { key: "price", label: `₱${filters.min_price || 0} – ${filters.max_price ? `₱${filters.max_price}` : "any"}`, clear: { min_price: "", max_price: "" } },
    filters.location && { key: "location", label: filters.location, clear: { location: "" } },
    filters.open_now && { key: "open", label: "Open now", clear: { open_now: "" } },
  ].filter(Boolean);
  const panelCount = activeChips.filter((chip) => chip.key !== "q").length;
  const heading = filters.q ? `Results for “${filters.q}”` : filters.category ? categoryLabel(filters.category) : "All products";

  return (
    <div className="browse">
      <Navbar />
      <main>
        <section className="browse-banner" aria-labelledby="browse-title">
          <div className="browse-wrap browse-banner-inner">
            <div>
              <p className="cm-eyebrow">Shop campus</p>
              <h1 id="browse-title">{heading}</h1>
              <p>{isInitialLoading ? "Finding products…" : `${plural(total, "product")} from CSUCC sellers`}</p>
            </div>
            <img src="/images/buyer/campusmarket-background.png" alt="" aria-hidden="true" />
          </div>
        </section>

        <div className="browse-wrap browse-layout">
          <aside className="browse-sidebar" aria-label="Product filters">
            <FilterPanel filters={filters} locations={locations} onChange={commit} onClear={clearAll} activeCount={panelCount} />
          </aside>

          <section className="browse-results" aria-live="polite" aria-busy={loading}>
            <div className="browse-toolbar">
              <p className="browse-count"><strong>{isInitialLoading ? "…" : total}</strong> {total === 1 ? "result" : "results"}</p>
              <button type="button" className="btn btn-outline btn-sm browse-filter-btn" onClick={() => setSheetOpen(true)}>
                <SlidersHorizontal aria-hidden="true" /> Filters {panelCount > 0 && <span className="cm-chip-count">{panelCount}</span>}
              </button>
              <label className="browse-sort">
                <span>Sort</span>
                <select value={filters.sort} onChange={(e) => commit({ sort: e.target.value })}>
                  {SORTS.map((sort) => <option key={sort.id} value={sort.id}>{sort.label}</option>)}
                </select>
              </label>
            </div>

            {activeChips.length > 0 && (
              <div className="browse-chips" aria-label="Active filters">
                {activeChips.map((chip) => (
                  <button key={chip.key} type="button" className="cm-chip cm-tone-green browse-chip" onClick={() => commit(chip.clear)} aria-label={`Remove filter ${chip.label}`}>
                    {chip.label} <X aria-hidden="true" />
                  </button>
                ))}
                <button type="button" className="cm-link" onClick={clearAll}>Clear all</button>
              </div>
            )}

            {error && (
              <div className="browse-error" role="alert">
                <AlertCircle aria-hidden="true" />
                <div><strong>We couldn't load products.</strong><span>{error}</span></div>
                <button type="button" className="btn btn-outline btn-sm" onClick={refetch}>Try again</button>
              </div>
            )}

            {isInitialLoading ? <SkeletonGrid count={9} /> : error ? null : products.length === 0 ? (
              <EmptyState
                illustration="search"
                title={activeChips.length ? "Nothing matches those filters" : "No products yet"}
                description={activeChips.length ? "Try another category, widen the price range, or turn off “Open now”." : "Campus sellers are setting up — check back soon, or open a stall yourself."}
                action={activeChips.length ? { label: "Clear filters", onClick: clearAll } : { label: "Open your stall", to: "/open-store" }}
              />
            ) : (
              <div className="pc-grid browse-grid">
                {products.map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            )}

            {hasMore && !isInitialLoading && (
              <div className="browse-more">
                <button type="button" className="btn btn-outline" onClick={loadMore} disabled={loading}>
                  {isLoadingMore ? "Loading…" : <>Show more <ArrowDown aria-hidden="true" /></>}
                </button>
                <small>Showing {products.length} of {total}</small>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />

      {sheetOpen && (
        <div className="sheet-layer" role="presentation" onClick={() => setSheetOpen(false)}>
          <section className="sheet browse-sheet" role="dialog" aria-modal="true" aria-label="Filters" onClick={(event) => event.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <button type="button" className="sheet-close browse-sheet-close" onClick={() => setSheetOpen(false)} aria-label="Close filters"><X aria-hidden="true" /></button>
            <FilterPanel filters={filters} locations={locations} onChange={commit} onClear={clearAll} activeCount={panelCount} />
            <button type="button" className="btn btn-primary btn-lg browse-sheet-done" onClick={() => setSheetOpen(false)}>
              Show {plural(total, "result")}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

export default Browse;
