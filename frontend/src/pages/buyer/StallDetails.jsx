import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpDown,
  BadgeCheck,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Star,
  Store,
  UserRound,
  X,
} from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import ProductCard from "../../components/common/ProductCard.jsx";
import { productService, stallService } from "../../services/api.js";

const extractObject = (payload) =>
  payload?.data?.stall || payload?.stall || payload?.data || payload || null;

const extractArray = (payload) => {
  const value =
    payload?.data?.products ?? payload?.products ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const titleCase = (value = "") =>
  String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeStall = (record) => {
  const stall = record?.stalls || record?.stall || record || {};
  const rating = Number(stall.avg_rating ?? stall.rating ?? 0);
  const reviews = Number(stall.review_count ?? stall.reviews ?? 0);

  return {
    id: stall.id || stall.stall_id,
    name: stall.name || "Campus Stall",
    description:
      stall.description ||
      stall.tagline ||
      "A student-run shop serving the CSUCC campus community.",
    category: titleCase(stall.category || "Campus Seller"),
    logo: stall.logo_url || stall.logo || null,
    cover: stall.banner_url || stall.cover_url || stall.image_url || null,
    seller:
      stall.profiles?.full_name ||
      stall.seller?.name ||
      stall.seller_name ||
      "Campus seller",
    sellerId: stall.seller_id || stall.user_id || stall.seller?.id,
    location:
      stall.location ||
      stall.address ||
      "Caraga State University – Cabadbaran Campus",
    rating: Number.isFinite(rating) ? rating : 0,
    reviews: Number.isFinite(reviews) ? reviews : 0,
    verified:
      Boolean(stall.is_verified) ||
      ["approved", "active"].includes(String(stall.status || "").toLowerCase()),
    status: String(stall.status || "active").toLowerCase(),
    nestedProducts: Array.isArray(stall.products) ? stall.products : [],
  };
};

const normalizeProduct = (product, stall) => ({
  ...product,
  id: product.id || product.product_id,
  name: product.name || product.product_name || "Untitled product",
  price: Number(product.price || 0),
  category: product.category || "other",
  image_url: product.image_url || product.image || null,
  stock: Number(product.stock ?? product.quantity ?? 0),
  avg_rating: product.avg_rating ?? product.rating ?? null,
  review_count: product.review_count ?? product.reviews ?? 0,
  stalls: product.stalls || { id: stall?.id, name: stall?.name },
});

function StallDetailsSkeleton() {
  return (
    <div className="stall-details-skeleton" aria-label="Loading stall">
      <div className="stall-details-skeleton-hero" />
      <div className="stall-details-skeleton-lines">
        <span />
        <span />
        <span />
      </div>
      <div className="stall-details-skeleton-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index}>
            <span />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StallDetails() {
  const { stallId } = useParams();
  const [stall, setStall] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("featured");

  const loadStall = useCallback(async () => {
    if (!stallId) return;

    setLoading(true);
    setError("");

    const [stallResult, productResult] = await Promise.allSettled([
      stallService.get(stallId),
      productService.getAll({ stall_id: stallId, limit: 50 }),
    ]);

    if (stallResult.status === "rejected") {
      setStall(null);
      setProducts([]);
      setError(
        stallResult.reason?.response?.data?.error ||
          "This stall could not be loaded. It may be unavailable or no longer active.",
      );
      setLoading(false);
      return;
    }

    const normalizedStall = normalizeStall(
      extractObject(stallResult.value.data),
    );
    const remoteProducts =
      productResult.status === "fulfilled"
        ? extractArray(productResult.value.data)
        : [];
    const sourceProducts =
      remoteProducts.length > 0
        ? remoteProducts
        : normalizedStall.nestedProducts;

    setStall(normalizedStall);
    setProducts(
      sourceProducts.map((product) =>
        normalizeProduct(product, normalizedStall),
      ),
    );
    setLoading(false);
  }, [stallId]);

  useEffect(() => {
    loadStall();
  }, [loadStall]);

  const categories = useMemo(() => {
    const values = [
      ...new Set(products.map((product) => product.category).filter(Boolean)),
    ];
    return ["all", ...values];
  }, [products]);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = products.filter((product) => {
      const matchesCategory =
        category === "all" || product.category === category;
      const matchesSearch =
        !term ||
        [product.name, product.description, product.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      return matchesCategory && matchesSearch;
    });

    return [...matches].sort((a, b) => {
      if (sortBy === "price-low") return a.price - b.price;
      if (sortBy === "price-high") return b.price - a.price;
      if (sortBy === "rating")
        return Number(b.avg_rating || 0) - Number(a.avg_rating || 0);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return (
        Number(b.stock > 0) - Number(a.stock > 0) ||
        Number(b.avg_rating || 0) - Number(a.avg_rating || 0)
      );
    });
  }, [category, products, query, sortBy]);

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
  };

  return (
    <div className="stall-details-shell">
      <Navbar />

      <main className="stall-details-page">
        <Link to="/stalls" className="stall-details-back">
          <ArrowLeft aria-hidden="true" /> Back to stalls
        </Link>

        {loading ? (
          <StallDetailsSkeleton />
        ) : error || !stall ? (
          <section className="stall-details-state is-error">
            <span>
              <Store aria-hidden="true" />
            </span>
            <small>Stall unavailable</small>
            <h1>We couldn't find this stall</h1>
            <p>{error || "The requested stall does not exist."}</p>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={loadStall}
              >
                <RefreshCw size={16} aria-hidden="true" /> Try again
              </button>
              <Link to="/stalls" className="btn btn-outline">
                Browse stalls
              </Link>
            </div>
          </section>
        ) : (
          <>
            <header
              className="stall-details-hero"
              style={
                stall.cover
                  ? { backgroundImage: `url(${stall.cover})` }
                  : undefined
              }
            >
              <div className="stall-details-hero-overlay" />
              <div className="stall-details-identity">
                <div className="stall-details-logo">
                  {stall.logo ? (
                    <img src={stall.logo} alt="" />
                  ) : (
                    <span aria-hidden="true">
                      {stall.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="stall-details-title">
                  <div>
                    <span>{stall.category}</span>
                    {stall.verified && (
                      <span className="stall-details-verified">
                        <BadgeCheck aria-hidden="true" /> Verified seller
                      </span>
                    )}
                  </div>
                  <h1>{stall.name}</h1>
                  <p>{stall.description}</p>
                </div>
              </div>

              <div className="stall-details-meta">
                <span>
                  <UserRound aria-hidden="true" /> {stall.seller}
                </span>
                <span>
                  <MapPin aria-hidden="true" /> {stall.location}
                </span>
              </div>
            </header>

            <section className="stall-details-stats" aria-label="Stall summary">
              <div>
                <Package aria-hidden="true" />
                <span>
                  <strong>{products.length}</strong> Products
                </span>
              </div>
              <div>
                <Star fill="currentColor" aria-hidden="true" />
                <span>
                  <strong>
                    {stall.rating > 0 ? stall.rating.toFixed(1) : "New"}
                  </strong>
                  {stall.rating > 0 ? " Rating" : " seller"}
                </span>
              </div>
              <div>
                <BadgeCheck aria-hidden="true" />
                <span>
                  <strong>{stall.reviews}</strong> Reviews
                </span>
              </div>
            </section>

            {products.length > 0 && (
              <section
                className="stall-products-controls"
                aria-label="Product filters"
              >
                <label className="stall-products-search">
                  <Search aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Search ${stall.name}`}
                    aria-label="Search products in this stall"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </label>

                <div className="stall-products-categories">
                  {categories.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={category === item ? "active" : ""}
                      onClick={() => setCategory(item)}
                      aria-pressed={category === item}
                    >
                      {item === "all" ? "All products" : titleCase(item)}
                    </button>
                  ))}
                </div>

                <label className="stall-products-sort">
                  <ArrowUpDown aria-hidden="true" />
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                  >
                    <option value="featured">Featured</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                    <option value="rating">Top rated</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </label>
              </section>
            )}

            <section className="stall-products-section">
              <div className="stall-products-heading">
                <div>
                  <small>Shop this stall</small>
                  <h2>Products</h2>
                </div>
                <span>
                  {visibleProducts.length} item
                  {visibleProducts.length === 1 ? "" : "s"}
                </span>
              </div>

              {products.length === 0 ? (
                <EmptyState compact illustration="store" title="No products listed yet" description="This seller is still stocking their shelves. Meanwhile, see what other stalls have." action={{ label: "Browse all products", to: "/browse" }} />
              ) : visibleProducts.length === 0 ? (
                <EmptyState compact illustration="search" title="No matching products" description="Try another search term or category." action={{ label: "Clear filters", onClick: clearFilters }} />
              ) : (
                <div className="stall-products-grid">
                  {visibleProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      showStall={false}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
