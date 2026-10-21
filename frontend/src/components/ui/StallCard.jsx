import { Link } from "react-router-dom";
import { MapPin, Star, Store } from "lucide-react";
import { CategoryChip } from "./Chip.jsx";
import { stallOpenStatus } from "../../utils/marketplace.js";

/**
 * Compact stall card for rows like "Open now": cover, logo, name, category,
 * pickup location, a live open/closed dot and rating ("New" until the first review).
 * `detailed` adds the seller and description (the Stalls directory). Without an id it
 * renders as a plain card, e.g. the seller's branding preview.
 */
export default function StallCard({ stall, detailed = false }) {
  const status = stallOpenStatus(stall);
  const rating = Number(stall.avg_rating || 0);
  const reviews = Number(stall.review_count || 0);
  const hours = String(stall.operating_hours || "").trim();
  const initial = (stall.name || "?").trim().charAt(0).toUpperCase();
  const Wrapper = stall.id ? Link : "article";
  const wrapperProps = stall.id ? { to: `/stalls/${stall.id}` } : {};
  return (
    <Wrapper {...wrapperProps} className="sc">
      <span className="sc-cover" aria-hidden="true">
        {stall.banner_url ? <img src={stall.banner_url} alt="" loading="lazy" /> : <span className="sc-cover-letter">{initial}</span>}
      </span>
      <span className="sc-head">
        <span className="sc-logo">
          {stall.logo_url ? <img src={stall.logo_url} alt={`${stall.name} logo`} loading="lazy" /> : <Store aria-hidden="true" />}
        </span>
        <span className="sc-top">
          <CategoryChip category={stall.category} size="sm" />
          <span className={`sc-status ${status.open ? "is-open" : "is-closed"}`}>
            <i aria-hidden="true" />{status.open ? "Open now" : "Closed"}
          </span>
        </span>
      </span>
      <span className="sc-body">
        <strong className="sc-name">{stall.name}</strong>
        {detailed && stall.seller_name && <span className="sc-seller">by {stall.seller_name}</span>}
        {detailed && stall.description && <span className="sc-desc">{stall.description}</span>}
        <span className="sc-meta"><MapPin aria-hidden="true" /> {stall.location || "CSUCC campus"}</span>
        {hours && <span className="sc-meta"><span aria-hidden="true">🕐</span> Open {hours}</span>}
        <span className="sc-meta">
          {reviews > 0 && rating > 0 ? (
            <><Star aria-hidden="true" className="is-rated" /> <span aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${reviews} ${reviews === 1 ? "review" : "reviews"}`}>{rating.toFixed(1)} ({reviews})</span></>
          ) : (
            <span className="cm-chip cm-chip--new cm-chip--sm">New</span>
          )}
          {Number(stall.product_count) > 0 && <> · {stall.product_count} {Number(stall.product_count) === 1 ? "product" : "products"}</>}
        </span>
      </span>
    </Wrapper>
  );
}
