import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Search, X } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import SellerCta from "../../components/ui/SellerCta.jsx";
import ShopFrom from "../../components/ui/ShopFrom.jsx";
import StallCard from "../../components/ui/StallCard.jsx";
import { FilterChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { stallService } from "../../services/api.js";
import { plural, stallOpenStatus } from "../../utils/marketplace.js";
import "./Stalls.css";

const CATEGORY_LABELS = {
  food: "Food",
  merchandise: "Merchandise",
  mixed: "Mixed-use",
  services: "Services",
  other: "Other",
};

// The count cards only once the directory is big enough to look busy.
const MIN_STATS_STALLS = 10;
const HIDDEN_STATUSES = new Set(["pending", "rejected", "suspended", "inactive"]);

const list = (payload) => {
  const value = payload?.data?.stalls ?? payload?.stalls ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const stallCategory = (value) => {
  const raw = String(value || "other").trim().toLowerCase();
  if (raw.includes("food")) return "food";
  if (raw.includes("merch") || raw.includes("retail")) return "merchandise";
  if (raw.includes("mixed")) return "mixed";
  if (raw.includes("service")) return "services";
  return raw.replace(/[^a-z0-9]+/g, "-") || "other";
};

const categoryName = (key) => CATEGORY_LABELS[key] || key.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
const ratingScore = (stall) => Number(stall.avg_rating || 0) * Math.min(Number(stall.review_count || 0), 20);

export default function Stalls() {
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  const loadStalls = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await stallService.getAll();
      setStalls(list(data).filter((stall) => !HIDDEN_STATUSES.has(String(stall.status || "approved").toLowerCase())));
    } catch (requestError) {
      setStalls([]);
      setError(requestError.response?.data?.error || "We couldn't load the campus stalls. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStalls(); }, [loadStalls]);

  const openCount = useMemo(() => stalls.filter((stall) => stallOpenStatus(stall).open).length, [stalls]);

  const categories = useMemo(() => {
    const counts = {};
    for (const stall of stalls) {
      const key = stallCategory(stall.category);
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, count]) => ({ key, label: categoryName(key), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [stalls]);

  // Featured: Premium stalls first, then open ones, then the best reviewed.
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = stalls.filter((stall) => {
      if (category !== "all" && stallCategory(stall.category) !== category) return false;
      if (openOnly && !stallOpenStatus(stall).open) return false;
      if (!term) return true;
      return [stall.name, stall.seller_name, stall.description, stall.location].join(" ").toLowerCase().includes(term);
    });
    return matches.sort((a, b) => {
      if (sortBy === "rating") return Number(b.avg_rating || 0) - Number(a.avg_rating || 0) || Number(b.review_count || 0) - Number(a.review_count || 0);
      if (sortBy === "products") return Number(b.product_count || 0) - Number(a.product_count || 0);
      if (sortBy === "name") return String(a.name).localeCompare(String(b.name));
      return Number(b.tier === "premium") - Number(a.tier === "premium")
        || Number(stallOpenStatus(b).open) - Number(stallOpenStatus(a).open)
        || ratingScore(b) - ratingScore(a)
        || Number(b.product_count || 0) - Number(a.product_count || 0);
    });
  }, [stalls, category, openOnly, query, sortBy]);

  const filtered = Boolean(query.trim()) || category !== "all" || openOnly;
  const clearFilters = () => { setQuery(""); setCategory("all"); setOpenOnly(false); };

  return (
    <div className="stl">
      <Navbar />
      <main className="stl-page">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header className="stl-hero">
          <div className="stl-hero-copy">
            <p className="cm-eyebrow">Campus stalls</p>
            <h1>Small stalls. <span>Big campus discoveries.</span></h1>
            <p className="stl-hero-lede">Meet the students selling around CSUCC, then order ahead and pick up between classes.</p>
          </div>
          <div className="stl-hero-side">
            {loading ? (
              <SkeletonBlock height={44} className="stl-hero-skel" />
            ) : stalls.length >= MIN_STATS_STALLS ? (
              <dl className="stl-stats">
                <div><dt>Campus stalls</dt><dd>{stalls.length}</dd></div>
                <div><dt>Open now</dt><dd>{openCount}</dd></div>
              </dl>
            ) : (
              <>
                <ShopFrom stalls={stalls} to={null} />
                {openCount > 0 && <p className="stl-open-pill"><i aria-hidden="true" /> {openCount} open now</p>}
              </>
            )}
          </div>
        </header>

        {/* ── Search, sort and filters ─────────────────────────────────── */}
        {!loading && !error && stalls.length > 0 && (
          <section className="stl-toolbar" aria-label="Find a stall">
            <div className="stl-toolbar-row">
              <label className="stl-search">
                <Search aria-hidden="true" />
                <span className="sr-only">Search stalls</span>
                <input type="search" placeholder="Search stalls, sellers or locations…" value={query} onChange={(event) => setQuery(event.target.value)} />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X aria-hidden="true" /></button>
                )}
              </label>
              <label className="stl-sort">
                <ArrowUpDown aria-hidden="true" />
                <span className="sr-only">Sort stalls</span>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                  <option value="featured">Featured</option>
                  <option value="rating">Top rated</option>
                  <option value="products">Most products</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>
            <div className="stl-chips" role="group" aria-label="Filter stalls">
              <FilterChip active={category === "all" && !openOnly} count={stalls.length} onClick={() => { setCategory("all"); setOpenOnly(false); }}>All</FilterChip>
              {openCount > 0 && (
                <FilterChip active={openOnly} count={openCount} onClick={() => setOpenOnly((on) => !on)}>
                  <i className="stl-chip-dot" aria-hidden="true" /> Open now
                </FilterChip>
              )}
              {categories.length > 1 && categories.map((entry) => (
                <FilterChip key={entry.key} active={category === entry.key} count={entry.count} onClick={() => setCategory(category === entry.key ? "all" : entry.key)}>
                  {entry.label}
                </FilterChip>
              ))}
            </div>
          </section>
        )}

        {/* ── Results ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="stl-grid" aria-label="Loading stalls">
            {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={280} className="stl-skel" />)}
          </div>
        ) : error ? (
          <EmptyState illustration="store" title="We couldn't open the stall directory" description={error} action={{ label: "Try again", onClick: loadStalls }} />
        ) : stalls.length === 0 ? (
          <EmptyState illustration="store" title="No stalls are open yet" description="Approved campus sellers appear here once their stalls are ready." action={{ label: "Browse products", to: "/browse" }} />
        ) : (
          <section className="stl-results" aria-labelledby="stl-results-title">
            <div className="stl-results-head">
              <h2 id="stl-results-title" aria-live="polite" aria-atomic="true">{plural(results.length, "stall")}</h2>
              {filtered && (
                <button type="button" className="cm-link stl-reset" onClick={clearFilters}><X aria-hidden="true" /> Clear filters</button>
              )}
            </div>
            {results.length ? (
              <div className="stl-grid">
                {results.map((stall) => <StallCard key={stall.id} stall={stall} detailed />)}
              </div>
            ) : (
              <EmptyState compact illustration="search" title="No stalls match" description="Try a different keyword, or turn off “Open now”." action={{ label: "Clear filters", onClick: clearFilters }} />
            )}
          </section>
        )}
      </main>
      <SellerCta />
      <Footer />
    </div>
  );
}
