import { Link } from "react-router-dom";
import { MapPin, Star, Store } from "lucide-react";
import { CategoryChip } from "./Chip.jsx";
import { stallOpenStatus } from "../../utils/marketplace.js";

/**
 * Compact stall card for rows like "Open now": logo, name, category,
 * pickup location, a live open/closed dot and rating.
 */
export default function StallCard({ stall }) {
  const status = stallOpenStatus(stall);
  const rating = Number(stall.avg_rating || 0);
  return (
    <Link to={`/stalls/${stall.id}`} className="sc">
      <span className="sc-cover" aria-hidden="true" style={stall.banner_url ? { backgroundImage: `url(${stall.banner_url})` } : undefined} />
      <span className="sc-logo">
        {stall.logo_url ? <img src={stall.logo_url} alt={`${stall.name} logo`} loading="lazy" /> : <Store aria-hidden="true" />}
      </span>
      <span className="sc-body">
        <span className="sc-top">
          <CategoryChip category={stall.category} size="sm" />
          <span className={`sc-status ${status.open ? "is-open" : "is-closed"}`}>
            <i aria-hidden="true" />{status.open ? "Open now" : "Closed"}
          </span>
        </span>
        <strong className="sc-name">{stall.name}</strong>
        <span className="sc-meta"><MapPin aria-hidden="true" /> {stall.location || "CSUCC campus"}</span>
        <span className="sc-meta">
          <Star aria-hidden="true" className={rating > 0 ? "is-rated" : ""} />
          {rating > 0 ? `${rating.toFixed(1)} rating` : "No reviews yet"}
          {Number(stall.product_count) > 0 && <> · {stall.product_count} {Number(stall.product_count) === 1 ? "product" : "products"}</>}
        </span>
      </span>
    </Link>
  );
}
