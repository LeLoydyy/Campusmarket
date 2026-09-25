import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpDown,
  BadgeCheck,
  ChevronRight,
  ArrowRight,
  MapPin,
  MessageCircle,
  ShoppingBag,
  Package,
  RefreshCw,
  Search,
  Star,
  Store,
  X,
} from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { stallService } from "../../services/api.js";
import "./Stalls.css";

const CATEGORY_LABELS = {
  food: "Food Stall",
  merchandise: "Merchandise",
  mixed: "Mixed-Use",
  services: "Services",
  other: "Other",
};

const hiddenStatuses = new Set([
  "pending",
  "rejected",
  "suspended",
  "inactive",
]);

const extractStalls = (payload) => {
  const value =
    payload?.data?.stalls ?? payload?.stalls ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const normalizeCategory = (value) => {
  const raw = String(value || "other")
    .trim()
    .toLowerCase();
  if (raw.includes("food")) return "food";
  if (raw.includes("merch") || raw.includes("retail")) return "merchandise";
  if (raw.includes("mixed")) return "mixed";
  if (raw.includes("service")) return "services";
  return raw.replace(/[^a-z0-9]+/g, "-") || "other";
};

const titleCase = (value) =>
  String(value || "Other")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const normalizeStall = (record, index) => {
  const stall = record?.stalls || record?.stall || record || {};
  const category = normalizeCategory(stall.category || record?.category);
  const products = Array.isArray(stall.products)
    ? stall.products
    : Array.isArray(record?.products)
      ? record.products
      : [];
  const rating = Number(
    stall.avg_rating ??
      stall.rating ??
      record?.avg_rating ??
      record?.rating ??
      0,
  );
  const reviews = Number(
    stall.review_count ??
      stall.reviews ??
      record?.review_count ??
      record?.reviews ??
      0,
  );

  return {
    id: stall.id || stall.stall_id || record?.stall_id || record?.id,
    key: stall.id || record?.id || `stall-${index}`,
    name: stall.name || record?.name || `Campus Stall ${index + 1}`,
    category,
    categoryLabel: CATEGORY_LABELS[category] || titleCase(category),
    location: stall.location || stall.address || "CSU Cabadbaran Campus",
    rating: Number.isFinite(rating) ? rating : 0,
    reviews: Number.isFinite(reviews) ? reviews : 0,
    logo:
      stall.logo_url || stall.logo || record?.logo_url || record?.logo || null,
    cover: stall.banner_url || stall.cover_url || record?.banner_url || null,
    tagline:
      stall.tagline ||
      stall.description ||
      record?.tagline ||
      record?.description ||
      "Discover products made and sold by students on campus.",
    seller:
      stall.profiles?.full_name ||
      stall.seller?.name ||
      stall.seller_name ||
      record?.seller_name ||
      record?.sellerName ||
      "Campus seller",
    productCount: Number(
      stall.product_count ??
        record?.product_count ??
        record?.products_count ??
        products.length,
    ),
    status: String(stall.status || record?.status || "approved").toLowerCase(),
    verified:
      Boolean(stall.is_verified ?? record?.is_verified) ||
      ["approved", "active"].includes(
        String(stall.status || record?.status || "").toLowerCase(),
      ),
  };
};

export function StallCard({ stall }) {
  const content = (
    <>
      <div
        className={`market-stall-cover market-stall-cover-${stall.category}`}
        style={
          stall.cover ? { backgroundImage: `url(${stall.cover})` } : undefined
        }
      >
        {!stall.cover && (
          <div className="market-stall-storefront" aria-hidden="true">
            {stall.logo ? (
              <img className="market-stall-brand" src={stall.logo} alt="" loading="lazy" />
            ) : (
              <>
                <Store />
                <span>Made for campus life</span>
              </>
            )}
          </div>
        )}
        <div className="market-stall-logo">
          {stall.logo ? (
            <img src={stall.logo} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">{stall.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {stall.verified && (
          <span className="market-stall-verified">
            <BadgeCheck aria-hidden="true" /> Verified
          </span>
        )}
      </div>

      <div className="market-stall-card-body">
        <div className="market-stall-title-row">
          <div>
            <span>{stall.categoryLabel}</span>
            <h2>{stall.name}</h2>
          </div>
          {stall.id && <ChevronRight aria-hidden="true" />}
        </div>

        <p className="market-stall-seller">by {stall.seller}</p>
        <p className="market-stall-tagline">{stall.tagline}</p>
        <p className="market-stall-location"><MapPin aria-hidden="true" /> {stall.location}</p>

        <div className="market-stall-footer">
          <span className="market-stall-rating">
            <Star fill="currentColor" aria-hidden="true" />
            {stall.rating > 0 ? (
              <>
                <strong>{stall.rating.toFixed(1)}</strong>
                <small>({stall.reviews})</small>
              </>
            ) : (
              <small>No ratings yet</small>
            )}
          </span>
          <span className="market-stall-products">
            <Package aria-hidden="true" />
            {stall.productCount > 0
              ? `${stall.productCount} ${stall.productCount === 1 ? "product" : "products"}`
              : "Explore products"}
          </span>
        </div>
        {stall.id && <span className="market-stall-visit">Visit stall <ArrowRight aria-hidden="true" /></span>}
      </div>
    </>
  );

  return stall.id ? (
    <Link to={`/stalls/${stall.id}`} className="market-stall-card">
      {content}
    </Link>
  ) : (
    <article className="market-stall-card">{content}</article>
  );
}

export default function Stalls() {
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  const loadStalls = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await stallService.getAll();
      const normalized = extractStalls(data)
        .map(normalizeStall)
        .filter((stall) => !hiddenStatuses.has(stall.status));
      setStalls(normalized);
    } catch (requestError) {
      setStalls([]);
      setError(
        requestError.response?.data?.error ||
          "We couldn't load the campus stalls. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStalls();
  }, [loadStalls]);

  const categories = useMemo(() => {
    const counts = stalls.reduce((result, stall) => {
      result[stall.category] = (result[stall.category] || 0) + 1;
      return result;
    }, {});

    return [
      { key: "all", label: "All", count: stalls.length },
      ...Object.keys(counts)
        .sort((a, b) =>
          (CATEGORY_LABELS[a] || a).localeCompare(CATEGORY_LABELS[b] || b),
        )
        .map((key) => ({
          key,
          label: CATEGORY_LABELS[key] || titleCase(key),
          count: counts[key],
        })),
    ];
  }, [stalls]);

  const filteredStalls = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const matches = stalls.filter((stall) => {
      const matchesCategory =
        activeCategory === "all" || stall.category === activeCategory;
      const haystack = [
        stall.name,
        stall.seller,
        stall.tagline,
        stall.categoryLabel,
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!query || haystack.includes(query));
    });

    return [...matches].sort((a, b) => {
      if (sortBy === "rating")
        return b.rating - a.rating || b.reviews - a.reviews;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "products") return b.productCount - a.productCount;
      return (
        Number(b.verified) - Number(a.verified) ||
        b.rating - a.rating ||
        b.reviews - a.reviews
      );
    });
  }, [activeCategory, searchTerm, sortBy, stalls]);

  const clearFilters = () => {
    setSearchTerm("");
    setActiveCategory("all");
  };

  const verifiedCount = stalls.filter((stall) => stall.verified).length;

  return (
    <div className="market-stalls-shell">
      <Navbar />

      <main className="market-stalls-page">
        <header className="market-stalls-hero">
          <div className="market-stalls-hero-copy">
            <span className="market-stalls-eyebrow"><Store size={15} aria-hidden="true" /> Your campus marketplace</span>
            <h1>Small stalls.<br />Big campus discoveries.</h1>
            <p>
              Shop from trusted entrepreneurs across CSUCC and support
              businesses built by students.
            </p>
          </div>

          <div
            className="market-stalls-summary"
            aria-label="Stall directory summary"
          >
            <div>
              <Store aria-hidden="true" />
              <span>
                <strong>{loading || error ? "—" : stalls.length}</strong> campus stalls
              </span>
            </div>
            <div>
              <BadgeCheck aria-hidden="true" />
              <span>
                <strong>{loading || error ? "—" : verifiedCount}</strong> verified sellers
              </span>
            </div>
          </div>
        </header>

        {!loading && !error && stalls.length > 0 && (
          <section
            className="market-stalls-controls"
            aria-label="Stall filters"
          >
            <label className="market-stalls-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                placeholder="Search stalls or sellers…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search stalls"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </label>

            <div
              className="market-stalls-categories"
              aria-label="Stall categories"
            >
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.key}
                  className={activeCategory === category.key ? "active" : ""}
                  onClick={() => setActiveCategory(category.key)}
                  aria-pressed={activeCategory === category.key}
                >
                  {category.label} <span>{category.count}</span>
                </button>
              ))}
            </div>

            <label className="market-stalls-sort">
              <ArrowUpDown aria-hidden="true" />
              <span>Sort</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="featured">Featured</option>
                <option value="rating">Top rated</option>
                <option value="products">Most products</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </section>
        )}

        {loading ? (
          <div className="market-stalls-skeleton" aria-label="Loading stalls">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                <span />
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ) : error ? (
          <section className="market-stalls-state is-error">
            <span>
              <Store aria-hidden="true" />
            </span>
            <small>Unable to load</small>
            <h2>We couldn't open the stall directory</h2>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadStalls}
            >
              <RefreshCw size={16} aria-hidden="true" /> Try again
            </button>
          </section>
        ) : stalls.length === 0 ? (
          <EmptyState illustration="store" title="No stalls are open yet" description="Approved campus sellers appear here once their stalls are ready. Have something to sell?" action={{ label: "Open your stall", to: "/open-store" }} secondaryAction={{ label: "Browse products", to: "/browse" }} />
        ) : filteredStalls.length === 0 ? (
          <EmptyState compact illustration="search" title="No stalls match" description="Try a different keyword or category." action={{ label: "Clear filters", onClick: clearFilters }} />
        ) : (
          <section aria-label="Stall directory results">
            <div className="market-stalls-heading">
              <div>
                <small>Explore the market</small>
                <h2 aria-live="polite" aria-atomic="true">
                  {filteredStalls.length} stall
                  {filteredStalls.length === 1 ? "" : "s"}
                </h2>
              </div>
              {searchTerm || activeCategory !== "all" ? (
                <button type="button" className="market-stalls-reset" onClick={clearFilters}>
                  <X size={15} aria-hidden="true" /> Clear filters
                </button>
              ) : <p>Find your next campus favorite</p>}
            </div>
            <div className="market-stalls-directory">
            <div className={`market-stalls-grid${filteredStalls.length === 1 ? " market-stalls-grid--single" : ""}`}>
              {filteredStalls.map((stall) => (
                <StallCard key={stall.key} stall={stall} />
              ))}
            </div>
            <aside className="market-stalls-guide" aria-labelledby="stall-guide-title">
              <span className="market-stalls-guide-icon"><ShoppingBag aria-hidden="true" /></span>
              <h2 id="stall-guide-title">Shop local. Start here.</h2>
              <p>Get to know the people behind your campus favorites.</p>
              <ol>
                <li><Store aria-hidden="true" /><div><strong>Discover a stall</strong><span>Find something that fits your taste.</span></div></li>
                <li><Package aria-hidden="true" /><div><strong>Explore its products</strong><span>Check prices and product details.</span></div></li>
                <li><MessageCircle aria-hidden="true" /><div><strong>Connect with the seller</strong><span>Ask questions before you order.</span></div></li>
              </ol>
              <Link to="/browse">Browse all products <ArrowRight size={16} aria-hidden="true" /></Link>
            </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
