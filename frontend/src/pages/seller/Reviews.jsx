import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { productService, stallService } from "../../services/api.js";
import {
  FiAlertCircle,
  FiMessageSquare,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiStar,
  FiX,
} from "react-icons/fi";
import "./Reviews.css";
import EmptyState from "../../components/ui/EmptyState.jsx";

const extractStall = (payload) => {
  const value =
    payload?.data?.stall ?? payload?.stall ?? payload?.data ?? payload;
  return Array.isArray(value) ? value[0] || null : value || null;
};

const extractProducts = (payload) => {
  const value =
    payload?.data?.products ?? payload?.products ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const extractProduct = (payload) =>
  payload?.data?.product || payload?.product || payload?.data || payload || {};

const formatDate = (value) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getReviewerName = (review) =>
  review.users?.name ||
  review.user?.name ||
  review.buyer_name ||
  "Campus buyer";

const initials = (name) =>
  String(name || "CB")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

function Stars({ value }) {
  return (
    <span
      className="seller-review-stars"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <FiStar key={star} className={star <= value ? "filled" : ""} />
      ))}
    </span>
  );
}

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [search, setSearch] = useState("");

  const loadReviews = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const stallResponse = await stallService.getMy();
      const stall = extractStall(stallResponse.data);

      if (!stall?.id) {
        setReviews([]);
        return;
      }

      const productResponse = await productService.getAll({
        stall_id: stall.id,
        limit: 100,
      });
      const products = extractProducts(productResponse.data).filter(
        (product) =>
          !product.stall_id || String(product.stall_id) === String(stall.id),
      );

      const details = await Promise.allSettled(
        products
          .slice(0, 50)
          .map((product) => productService.getOne(product.id)),
      );

      const records = details.flatMap((result, index) => {
        const fallback = products[index];
        const product =
          result.status === "fulfilled"
            ? extractProduct(result.value.data)
            : fallback;
        const productReviews = Array.isArray(product?.reviews)
          ? product.reviews
          : [];

        return productReviews.map((review) => ({
          ...review,
          id:
            review.id || `${product.id}-${review.created_at || Math.random()}`,
          rating: Math.max(1, Math.min(5, Number(review.rating) || 0)),
          comment: review.comment || review.content || review.text || "",
          product: {
            id: product.id || fallback?.id,
            name: product.name || fallback?.name || "Product",
            image_url: product.image_url || fallback?.image_url || "",
          },
        }));
      });

      setReviews(
        records.sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
        ),
      );
    } catch (requestError) {
      setReviews([]);
      setError(
        requestError.response?.data?.error ||
          "We couldn't load your customer reviews. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const summary = useMemo(() => {
    const total = reviews.length;
    const average = total
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / total
      : 0;
    const fiveStars = reviews.filter((review) => review.rating === 5).length;
    const products = new Set(
      reviews.map((review) => review.product?.id).filter(Boolean),
    ).size;
    const distribution = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => review.rating === rating).length,
    }));
    return {
      total,
      average,
      fiveStarRate: total ? Math.round((fiveStars / total) * 100) : 0,
      products,
      distribution,
    };
  }, [reviews]);

  const visibleReviews = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesRating =
        ratingFilter === "all" || review.rating === Number(ratingFilter);
      const matchesSearch =
        !query ||
        [getReviewerName(review), review.comment, review.product?.name]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesRating && matchesSearch;
    });
  }, [ratingFilter, reviews, search]);

  return (
    <div className="dashboard-layout seller-reviews-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar seller-reviews-topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Reviews</h1>
              <p>Understand what buyers appreciate about your products.</p>
            </div>
          </div>
          <button
            className="seller-reviews-refresh"
            type="button"
            onClick={() => loadReviews(true)}
            disabled={loading || refreshing}
          >
            <FiRefreshCw className={refreshing ? "spinning" : ""} />
            Refresh
          </button>
        </header>

        <div className="dashboard-content seller-reviews-content">
          {error && (
            <div className="seller-reviews-error" role="alert">
              <FiAlertCircle />
              <span>{error}</span>
              <button type="button" onClick={() => loadReviews()}>
                Try again
              </button>
            </div>
          )}

          <section className="seller-reviews-metrics" aria-label="Review summary">
            <article>
              <span className="tone-blue">
                <FiMessageSquare />
              </span>
              <div>
                <small>Total reviews</small>
                <strong>{loading ? "—" : summary.total}</strong>
              </div>
            </article>
            <article>
              <span className="tone-gold">
                <FiStar />
              </span>
              <div>
                <small>Average rating</small>
                <strong>{loading ? "—" : summary.total ? summary.average.toFixed(1) : "No ratings"}</strong>
              </div>
            </article>
            <article>
              <span className="tone-green">
                <FiStar />
              </span>
              <div>
                <small>Five-star share</small>
                <strong>{loading ? "—" : `${summary.fiveStarRate}%`}</strong>
              </div>
            </article>
            <article>
              <span className="tone-blue">
                <FiPackage />
              </span>
              <div>
                <small>Products reviewed</small>
                <strong>{loading ? "—" : summary.products}</strong>
              </div>
            </article>
          </section>

          <div className="seller-reviews-layout">
            <section className="seller-reviews-panel">
              <div className="seller-reviews-panel-heading">
                <div>
                  <small>Recent feedback</small>
                  <h2>Customer reviews</h2>
                </div>
              </div>

              <div className="seller-reviews-filters">
                {["all", "5", "4", "3", "2", "1"].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    className={ratingFilter === rating ? "active" : ""}
                    aria-pressed={ratingFilter === rating}
                    onClick={() => setRatingFilter(rating)}
                  >
                    {rating === "all" ? (
                      "All ratings"
                    ) : (
                      <>
                        {rating} <FiStar />
                      </>
                    )}
                    <span>
                      {rating === "all"
                        ? summary.total
                        : summary.distribution.find((row) => row.rating === Number(rating))?.count ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              <div className="seller-reviews-filter-row">
                <label className="seller-reviews-search">
                  <FiSearch />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search buyer, product, or comment"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                      <FiX />
                    </button>
                  )}
                </label>
              </div>

              {loading ? (
                <div className="seller-reviews-skeleton">
                  <i />
                  <i />
                  <i />
                </div>
              ) : !error && visibleReviews.length ? (
                <div className="seller-review-list">
                  {visibleReviews.map((review) => {
                    const buyer = getReviewerName(review);
                    return (
                      <article className="seller-review-card" key={review.id}>
                        <span className="seller-review-avatar">
                          {initials(buyer)}
                        </span>
                        <div>
                          <header>
                            <div>
                              <strong>{buyer}</strong>
                              <span>reviewed {review.product?.name}</span>
                            </div>
                            <time>{formatDate(review.created_at)}</time>
                          </header>
                          <Stars value={review.rating} />
                          <p>
                            {review.comment ||
                              "The buyer left a rating without a written comment."}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : !error ? (
                <EmptyState
                  compact
                  illustration={search || ratingFilter !== "all" ? "search" : "heart"}
                  title={search || ratingFilter !== "all" ? "No matching reviews" : "No reviews yet"}
                  description={search || ratingFilter !== "all" ? "Try a different search or rating filter." : "Buyer feedback will appear after customers review your products."}
                  action={search || ratingFilter !== "all" ? { label: "Clear filters", onClick: () => { setSearch(""); setRatingFilter("all"); } } : { label: "View your products", to: "/seller/products" }}
                />
              ) : null}
            </section>

            <aside className="seller-rating-breakdown">
              <small>Rating breakdown</small>
              <h2>Customer sentiment</h2>
              <div className="seller-reviews-score">
                <strong>{summary.total ? summary.average.toFixed(1) : "—"}</strong>
                <div>
                  <Stars value={Math.round(summary.average)} />
                  <span>
                    {summary.total
                      ? `Based on ${summary.total} review${summary.total === 1 ? "" : "s"}`
                      : "No ratings yet"}
                  </span>
                </div>
              </div>
              <div className="seller-rating-rows">
                {summary.distribution.map(({ rating, count }) => (
                  <button
                    type="button"
                    className={`seller-rating-row${ratingFilter === String(rating) ? " is-selected" : ""}`}
                    key={rating}
                    onClick={() => setRatingFilter(ratingFilter === String(rating) ? "all" : String(rating))}
                    aria-pressed={ratingFilter === String(rating)}
                    aria-label={`Show ${rating}-star reviews (${count})`}
                  >
                    <span>
                      {rating} <FiStar />
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${summary.total ? (count / summary.total) * 100 : 0}%`,
                        }}
                      />
                    </i>
                    <em>{count}</em>
                  </button>
                ))}
              </div>
              <p>
                Ratings come from buyers who reviewed your products. Click a
                row to see only those reviews.
              </p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
