import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { reviewService } from "../../services/api.js";
import {
  FiAlertCircle,
  FiAward,
  FiMessageSquare,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiStar,
  FiX,
} from "react-icons/fi";
import "./Reviews.css";
import EmptyState from "../../components/ui/EmptyState.jsx";
import toast from "react-hot-toast";

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

/** The seller's public answer under a review: write, edit or remove it. */
function ReviewReply({ review, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.seller_reply || "");
  const [saving, setSaving] = useState(false);
  const save = async (value) => {
    setSaving(true);
    try {
      const { data } = await reviewService.reply(review.id, value);
      onSaved(data);
      setEditing(false);
      toast.success(value ? "Reply posted" : "Reply removed");
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Your reply could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return (
      <form className="seller-review-reply-form" onSubmit={(event) => { event.preventDefault(); if (text.trim()) save(text.trim()); }}>
        <label className="sr-only" htmlFor={`reply-${review.id}`}>Your reply</label>
        <textarea id={`reply-${review.id}`} rows={3} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)}
          placeholder="Thank the buyer, or explain what you'll do about it. Everyone can see this reply." autoFocus disabled={saving} />
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setText(review.seller_reply || ""); }} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !text.trim()}>{saving ? "Saving…" : "Post reply"}</button>
        </div>
      </form>
    );
  }
  if (review.seller_reply) {
    return (
      <div className="seller-review-reply">
        <strong>Your reply</strong>
        <p>{review.seller_reply}</p>
        <div>
          <button type="button" onClick={() => { setText(review.seller_reply); setEditing(true); }}>Edit</button>
          <button type="button" onClick={() => window.confirm("Remove your reply?") && save("")} disabled={saving}>Remove</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" className="seller-review-reply-btn" onClick={() => setEditing(true)}>
      <FiMessageSquare aria-hidden="true" /> Reply publicly
    </button>
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
      const { data } = await reviewService.getMine();
      setReviews(
        (Array.isArray(data) ? data : []).map((review) => ({
          ...review,
          rating: Math.max(1, Math.min(5, Number(review.rating) || 0)),
          comment: review.comment || "",
          product: review.product || { name: "Product" },
        })),
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
                <em>{summary.total ? "From your buyers" : "None yet"}</em>
              </div>
            </article>
            <article>
              <span className="tone-gold">
                <FiStar />
              </span>
              <div>
                <small>Average rating</small>
                <strong>{loading ? "—" : summary.total ? <>{summary.average.toFixed(1)}<span className="seller-reviews-out-of"> / 5</span></> : "—"}</strong>
                <em>{summary.total ? <Stars value={Math.round(summary.average)} /> : "No ratings yet"}</em>
              </div>
            </article>
            <article>
              <span className="tone-green">
                <FiAward />
              </span>
              <div>
                <small>Five-star share</small>
                <strong>{loading ? "—" : summary.total ? `${summary.fiveStarRate}%` : "—"}</strong>
                <em>{summary.total ? "of all reviews" : "No ratings yet"}</em>
              </div>
            </article>
            <article>
              <span className="tone-coral">
                <FiPackage />
              </span>
              <div>
                <small>Products reviewed</small>
                <strong>{loading ? "—" : summary.products}</strong>
                <em>{summary.products === 1 ? "product" : "products"} with feedback</em>
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
                <label className="seller-reviews-search">
                  <FiSearch aria-hidden="true" />
                  <span className="sr-only">Search reviews</span>
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

              <div className="seller-reviews-filters" role="group" aria-label="Filter by rating">
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
                              <span className="seller-review-meta">
                                <Stars value={review.rating} />
                                <time>{formatDate(review.created_at)}</time>
                              </span>
                            </div>
                            <span className={`seller-review-score tone-${review.rating >= 4 ? "good" : review.rating === 3 ? "mid" : "low"}`}>
                              {review.rating}.0
                            </span>
                          </header>
                          <p className={review.comment ? "" : "is-empty"}>
                            {review.comment ||
                              "The buyer left a rating without a written comment."}
                          </p>
                          <span className="seller-review-product">
                            {review.product?.image_url ? (
                              <img src={review.product.image_url} alt="" />
                            ) : (
                              <FiPackage aria-hidden="true" />
                            )}
                            {review.product?.name}
                          </span>
                          <ReviewReply review={review} onSaved={(saved) => setReviews((current) => current.map((item) => item.id === saved.id ? { ...item, seller_reply: saved.seller_reply, seller_replied_at: saved.seller_replied_at } : item))} />
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
                <strong className={summary.total ? "" : "is-empty"}>{summary.total ? summary.average.toFixed(1) : "0.0"}</strong>
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
                    <em>{count}<span>{summary.total ? ` · ${Math.round((count / summary.total) * 100)}%` : ""}</span></em>
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
