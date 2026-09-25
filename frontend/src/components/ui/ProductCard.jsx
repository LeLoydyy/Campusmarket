import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Heart, MapPin, ShoppingBag, ShoppingCart, Star, BadgeCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useCart } from "../../context/CartContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { behaviorService } from "../../services/api.js";
import favoriteService from "../../services/favoriteService.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import { isNewProduct } from "../../utils/marketplace.js";
import { CategoryChip } from "./Chip.jsx";

/**
 * The one product card used across the buyer side.
 * Shows only real facts: seller, pickup spot, rating, price; a stock warning
 * only at 5 or fewer, and "New" only for items listed within 7 days.
 */
export default function ProductCard({ product, showStall = true }) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);

  const stall = product.stalls || product.stall || null;
  const stock = Number(product.stock || 0);
  const outOfStock = stock < 1;
  const lowStock = stock > 0 && stock <= 5;
  const rating = Number(product.avg_rating || 0);
  const reviews = Number(product.review_count || 0);
  const isBuyerOrGuest = !user || user.role === "buyer";
  const canFavorite = user?.role === "buyer";

  useEffect(() => { setImageFailed(false); }, [product.image_url]);

  useEffect(() => {
    if (!added) return undefined;
    const timer = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [added]);

  useEffect(() => {
    if (!canFavorite || !user?.id) { setIsFavorite(false); return undefined; }
    let active = true;
    favoriteService.isFavorite(user.id, product.id).then((saved) => { if (active) setIsFavorite(saved); });
    const unsubscribe = favoriteService.subscribe(user.id, (favorites) => {
      if (active) setIsFavorite(favorites.some((item) => String(item.id) === String(product.id)));
    });
    return () => { active = false; unsubscribe(); };
  }, [product.id, canFavorite, user?.id]);

  const handleView = () => { if (user) behaviorService.log(product.id, "view").catch(() => {}); };

  const handleAddToCart = async () => {
    if (!user) return toast.error("Log in to add items to your cart");
    if (user.role !== "buyer") return toast.error("Only buyer accounts can use the cart");
    if (outOfStock) return toast.error("This product is out of stock");
    try {
      setAdding(true);
      await addItem(product);
      setAdded(true);
      toast.success(`${product.name} added to cart`);
    } catch (error) {
      toast.error(error.response?.data?.error || "Couldn't add this item to your cart");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!user) return toast.error("Log in to save favorites");
    try {
      setSavingFavorite(true);
      const result = await favoriteService.toggle(user.id, product);
      setIsFavorite(result.saved);
      toast.success(result.saved ? "Saved to favorites" : "Removed from favorites");
    } catch {
      toast.error("Couldn't update favorites");
    } finally {
      setSavingFavorite(false);
    }
  };

  return (
    <article className={`pc ${outOfStock ? "is-out" : ""}`}>
      <Link to={`/products/${product.id}`} className="pc-link" onClick={handleView}>
        <div className="pc-media">
          {product.image_url && !imageFailed ? (
            <img src={product.image_url} alt={product.name} loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <span className="pc-media-empty" aria-hidden="true"><ShoppingBag /></span>
          )}
          <span className="pc-tags">
            <CategoryChip category={product.category} size="sm" />
            {isNewProduct(product) && <span className="cm-chip cm-chip--new cm-chip--sm">New</span>}
          </span>
          {lowStock && <span className="pc-stock">Only {stock} left</span>}
          {outOfStock && <span className="pc-soldout">Sold out</span>}
        </div>

        <div className="pc-body">
          {showStall && stall?.name && (
            <p className="pc-seller">
              <span className="pc-seller-avatar" aria-hidden="true">
                {stall.logo_url ? <img src={stall.logo_url} alt="" loading="lazy" /> : stall.name.charAt(0)}
              </span>
              <span className="pc-seller-name">{stall.name}</span>
              <BadgeCheck className="pc-verified" aria-label="Verified CSUCC seller" />
            </p>
          )}
          <h3 className="pc-name">{product.name}</h3>
          {stall?.location && (
            <p className="pc-meta"><MapPin aria-hidden="true" /> <span>Pickup at {stall.location}</span></p>
          )}
          <p className="pc-meta pc-rating">
            {rating > 0 ? (
              <>
                <span className="pc-stars" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} aria-hidden="true" className={n <= Math.round(rating) ? "is-on" : ""} />)}
                </span>
                <span>{rating.toFixed(1)} ({reviews})</span>
              </>
            ) : (
              <><Star aria-hidden="true" /> <span>No reviews yet</span></>
            )}
          </p>
          <p className="pc-price">{formatCurrency(product.price)}</p>
        </div>
      </Link>

      {canFavorite && (
        <button
          type="button"
          className={`pc-fav ${isFavorite ? "is-on" : ""}`}
          onClick={handleToggleFavorite}
          disabled={savingFavorite}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${product.name} from favorites` : `Save ${product.name} to favorites`}
        >
          <Heart aria-hidden="true" />
        </button>
      )}

      {isBuyerOrGuest && (
        <button
          type="button"
          className={`pc-cart ${added ? "is-added" : ""}`}
          onClick={handleAddToCart}
          disabled={adding || outOfStock}
          aria-label={outOfStock ? `${product.name} is sold out` : added ? `${product.name} added to cart` : `Add ${product.name} to cart`}
        >
          {added ? <Check aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />}
          {adding && <span className="pc-cart-spin" aria-hidden="true" />}
        </button>
      )}
      <span className="sr-only" aria-live="polite">{added ? `${product.name} added to cart` : ""}</span>
    </article>
  );
}
