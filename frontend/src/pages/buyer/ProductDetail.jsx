import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCheck,
  FiChevronRight,
  FiMessageSquare,
  FiMinus,
  FiPlus,
  FiRefreshCw,
  FiSend,
  FiShoppingBag,
  FiShoppingCart,
  FiStar,
} from "react-icons/fi";
import {
  behaviorService,
  messageService,
  productService,
} from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { BadgeCheck, Banknote, Clock3, MapPin } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import ProductCard from "../../components/ui/ProductCard.jsx";
import { CategoryChip, categoryKey, categoryLabel } from "../../components/ui/Chip.jsx";
import { SkeletonGrid } from "../../components/ui/Skeleton.jsx";
import { stallOpenStatus } from "../../utils/marketplace.js";
import "./ProductDetail.css";
import toast from "react-hot-toast";
import { discountLabel, effectivePrice, isOnSale, productOptions } from "../../utils/pricing.js";

const formatPrice = (price) =>
  `₱${Number(price || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatReviewDate = (date) => {
  if (!date) return "";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
};

function StarRating({ value = 0, size = 16 }) {
  const numericValue = Number(value) || 0;
  const roundedValue = Math.round(numericValue);

  return (
    <span
      className="detail-stars"
      aria-label={`${numericValue.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <FiStar
          key={star}
          size={size}
          className={star <= roundedValue ? "filled" : ""}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="product-detail-screen">
      <Navbar />
      <main className="product-detail-page" aria-busy="true">
        <div className="detail-breadcrumb-skeleton skeleton" />
        <div className="detail-layout detail-loading-layout">
          <div className="detail-image-skeleton skeleton" />
          <div className="detail-info-skeleton">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [error, setError] = useState("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [optionId, setOptionId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const optionsRef = useRef(null);
  const chatRef = useRef(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadProduct = async () => {
      window.scrollTo({ top: 0, left: 0 });
      setLoading(true);
      setError("");
      setProduct(null);
      setQty(1);
      setAdded(false);
      setImageFailed(false);
      setChatOpen(false);
      setMessage("");

      try {
        const { data } = await productService.getOne(id);
        if (!active) return;

        setProduct(data);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError.response?.data?.error ||
            "This product could not be found or is no longer available.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    const loadSimilarProducts = async () => {
      setSimilarLoading(true);
      setSimilar([]);

      try {
        const { data } = await productService.getSimilar(id);
        if (active) {
          setSimilar(
            Array.isArray(data)
              ? data.filter(
                  (similarProduct) => String(similarProduct.id) !== String(id),
                )
              : [],
          );
        }
      } catch {
        if (active) setSimilar([]);
      } finally {
        if (active) setSimilarLoading(false);
      }
    };

    loadProduct();
    loadSimilarProducts();

    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (user?.id && product?.id) {
      behaviorService.log(product.id, "view").catch(() => {});
    }
  }, [product?.id, user?.id]);

  useEffect(() => {
    if (!added) return undefined;
    const timer = window.setTimeout(() => setAdded(false), 2000);
    return () => window.clearTimeout(timer);
  }, [added]);

  // A new product starts on its first photo with no option chosen.
  useEffect(() => {
    setPhotoIndex(0);
    setOptionId(null);
    setImageFailed(false);
  }, [product?.id]);

  const photos = [product?.image_url, ...(Array.isArray(product?.images) ? product.images : [])].filter(Boolean);
  const options = productOptions(product);
  const selectedOption = options.find((option) => option.id === optionId) || null;
  const needsOption = options.length > 0 && !selectedOption;
  // With options, stock and quantity follow the chosen option.
  const stock = Number(selectedOption ? selectedOption.stock : product?.stock || 0);
  const isOutOfStock = Number(product?.stock || 0) < 1 || (selectedOption && stock < 1);
  const isLowStock = stock > 0 && stock <= 5;
  const rating = Number(product?.avg_rating || 0);
  const reviews = Array.isArray(product?.reviews) ? product.reviews : [];
  const ownerId = product?.stalls?.owner_id;
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId);
  const showCartAction = !user || user.role === "buyer";
  const showMessageAction = Boolean(ownerId && !isOwner);
  const stall = product?.stalls || null;
  const stallStatus = stallOpenStatus(stall);
  const hours = String(stall?.operating_hours || "").trim();
  const reviewCount = Number(product?.review_count || reviews.length);
  const longDescription = String(product?.description || "").length > 140;
  const stockLabel = isOutOfStock ? "Out of stock" : isLowStock ? `Only ${stock} left` : `${stock} in stock`;

  const handleAddToCart = async () => {
    if (!user) {
      toast.error("Please log in to add items to your cart");
      return;
    }

    if (user.role !== "buyer") {
      toast.error("Only buyers can add items to the cart");
      return;
    }

    if (!product || isOutOfStock) {
      toast.error("This product is currently out of stock");
      return;
    }

    if (needsOption) {
      toast.error(`Choose ${options.length > 1 ? "an option" : "the option"} first`);
      return;
    }

    try {
      setAdding(true);
      await addItem(product, Math.min(qty, stock), selectedOption?.id);
      behaviorService.log(id, "cart_add").catch(() => {});
      setAdded(true);
      toast.success("Added to cart");
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to add item to cart",
      );
    } finally {
      setAdding(false);
    }
  };

  const handleToggleChat = () => {
    if (!user) {
      toast.error("Please log in to message the seller");
      return;
    }

    setChatOpen((open) => !open);
  };

  useEffect(() => {
    if (chatOpen) chatRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [chatOpen]);

  // Phone buy bar: with options, take the buyer to the option picker first.
  const handleBuyBar = () => {
    if (needsOption) {
      optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(`Choose ${options.length > 1 ? "an option" : "the option"} first`, { icon: "👆" });
      return;
    }
    handleAddToCart();
  };

  const handleSendMessage = async () => {
    const content = message.trim();
    if (!content) return;

    if (!user) {
      toast.error("Please log in to message the seller");
      return;
    }

    if (!ownerId || !product) {
      toast.error("Seller information is unavailable");
      return;
    }

    try {
      setSending(true);
      await messageService.send({
        receiver_id: ownerId,
        product_id: product.id,
        content,
      });
      toast.success("Message sent");
      setMessage("");
      setChatOpen(false);
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to send message",
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) return <ProductDetailSkeleton />;

  if (error || !product) {
    return (
      <div className="product-detail-screen">
        <Navbar />
        <main className="product-detail-page">
          <div className="detail-error-state" role="alert">
            <span>
              <FiAlertCircle />
            </span>
            <h1>Product unavailable</h1>
            <p>{error || "This product could not be found."}</p>
            <div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <FiRefreshCw /> Try again
              </button>
              <Link to="/browse" className="btn btn-primary">
                Browse products <FiArrowRight />
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="product-detail-screen">
      <Navbar />

      <main className="product-detail-page">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <Link to="/browse">Products</Link>
          <FiChevronRight aria-hidden="true" />
          <Link to={`/browse?category=${categoryKey(product.category)}`}>{categoryLabel(product.category)}</Link>
          <FiChevronRight aria-hidden="true" />
          <strong>{product.name}</strong>
        </nav>

        <section
          className="detail-layout fade-in"
          aria-labelledby="product-title"
        >
          <div className="detail-media-column">
            <div className="detail-image-wrap">
              {photos.length && !imageFailed ? (
                <img
                  src={photos[Math.min(photoIndex, photos.length - 1)]}
                  alt={photos.length > 1 ? `${product.name}, photo ${photoIndex + 1} of ${photos.length}` : product.name}
                  className="detail-img"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="detail-img-placeholder" aria-hidden="true">
                  <span>
                    <FiShoppingBag />
                  </span>
                </div>
              )}
              <span className="pd-media-tags">
                <CategoryChip category={product.category} />
                {isOnSale(product) && <span className="pd-sale-tag">Sale {discountLabel(product)}</span>}
              </span>
              {isOutOfStock && <span className="detail-stock-overlay out">Out of stock</span>}
            </div>

            {photos.length > 1 && (
              <div className="detail-thumbs" role="group" aria-label="Product photos">
                {photos.map((url, index) => (
                  <button
                    type="button"
                    key={url}
                    className={index === photoIndex ? "is-active" : ""}
                    onClick={() => { setPhotoIndex(index); setImageFailed(false); }}
                    aria-label={`Show photo ${index + 1}`}
                    aria-pressed={index === photoIndex}
                  >
                    <img src={url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

          </div>

          <article className="detail-info-card">
            <div className="detail-heading">
              {stall && (
                <Link to={stall.id ? `/stalls/${stall.id}` : "/stalls"} className="pd-stall">
                  <span className="pd-stall-logo" aria-hidden="true">
                    {stall.logo_url ? <img src={stall.logo_url} alt="" /> : (stall.name || "S").charAt(0).toUpperCase()}
                  </span>
                  <span className="pd-stall-name">{stall.name}</span>
                  <BadgeCheck className="pd-verified" aria-label="Verified CSUCC seller" />
                  <span className={`sc-status ${stallStatus.open ? "is-open" : "is-closed"}`}>
                    <i aria-hidden="true" />{stallStatus.open ? "Open now" : "Closed"}
                  </span>
                </Link>
              )}
              <h1 id="product-title" className="detail-title">
                {product.name}
              </h1>

              <div className="detail-rating">
                {reviewCount > 0 && rating > 0 ? (
                  <a href="#reviews-title" className="pd-rating-link">
                    <StarRating value={rating} />
                    <strong>{rating.toFixed(1)}</strong>
                    <span>({reviewCount} {reviewCount === 1 ? "review" : "reviews"})</span>
                  </a>
                ) : (
                  <><span className="cm-chip cm-chip--new cm-chip--sm">New</span><span>Just listed on Campus Market</span></>
                )}
              </div>
            </div>

            <div className="detail-price-block">
              <span className="detail-price-label">{isOnSale(product) ? "Sale price" : "Campus price"}</span>
              <div className="detail-price">
                {formatPrice(effectivePrice(product))}
                <span className={`pd-stock ${isOutOfStock ? "is-out" : isLowStock ? "is-low" : "is-in"}`}>{stockLabel}</span>
                {isOnSale(product) && (
                  <>
                    <s className="detail-price-was" aria-label={`Regular price ${formatPrice(product.price)}`}>{formatPrice(product.price)}</s>
                    <span className="detail-sale-badge">{discountLabel(product)}</span>
                  </>
                )}
              </div>
            </div>

            <ul className="pd-facts">
              <li>
                <MapPin aria-hidden="true" />
                <span><strong>Pickup at {stall?.location || "the stall"}</strong><small>Order ahead, collect between classes</small></span>
              </li>
              <li>
                <Clock3 aria-hidden="true" />
                <span><strong>{stallStatus.open ? "Open now" : "Closed right now"}</strong><small>{hours ? `Hours: ${hours}` : "Ask the seller about pickup times"}</small></span>
              </li>
              <li>
                <Banknote aria-hidden="true" />
                <span><strong>Cash on pickup</strong><small>Show your pickup code from My orders</small></span>
              </li>
            </ul>

            <div className="detail-description">
              <h2>About this product</h2>
              <p className={longDescription && !descOpen ? "pd-desc-clamp" : undefined}>
                {product.description ||
                  "The seller has not added a description yet."}
              </p>
              {longDescription && (
                <button type="button" className="pd-desc-toggle" onClick={() => setDescOpen((open) => !open)} aria-expanded={descOpen}>
                  {descOpen ? "Show less" : "Read more"}
                </button>
              )}
            </div>

            <div className="detail-purchase-panel">
              {options.length > 0 && (
                <fieldset className="detail-options" ref={optionsRef}>
                  <legend id="detail-options-hint">Choose an option {selectedOption && <span>· {selectedOption.label}</span>}</legend>
                  <div>
                    {options.map((option) => (
                      <label key={option.id} className={`${option.id === optionId ? "is-selected" : ""}${option.stock < 1 ? " is-out" : ""}`}>
                        <input
                          type="radio"
                          name="product-option"
                          value={option.id}
                          checked={option.id === optionId}
                          disabled={option.stock < 1}
                          onChange={() => { setOptionId(option.id); setQty(1); }}
                        />
                        <strong>{option.label}</strong>
                        <small>{option.stock < 1 ? "Sold out" : option.stock <= 5 ? `${option.stock} left` : "In stock"}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {user?.role === "buyer" && !isOutOfStock && !needsOption && (
                <div className="detail-quantity-row">
                  <div>
                    <span>Quantity</span>
                    <small>Maximum {stock}</small>
                  </div>
                  <div className="qty-control" aria-label="Product quantity">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() =>
                        setQty((current) => Math.max(1, current - 1))
                      }
                      disabled={qty <= 1}
                      aria-label="Decrease quantity"
                    >
                      <FiMinus />
                    </button>
                    <span className="qty-val" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() =>
                        setQty((current) => Math.min(stock, current + 1))
                      }
                      disabled={qty >= stock}
                      aria-label="Increase quantity"
                    >
                      <FiPlus />
                    </button>
                  </div>
                </div>
              )}

              <div className="detail-actions">
                {showCartAction && (
                  <button
                    type="button"
                    className={`btn btn-primary btn-lg detail-cart-btn ${added ? "btn-added" : ""}`}
                    onClick={handleAddToCart}
                    disabled={adding || isOutOfStock}
                    aria-describedby={needsOption ? "detail-options-hint" : undefined}
                  >
                    {adding ? (
                      <>
                        <span className="spinner" /> Adding to cart
                      </>
                    ) : added ? (
                      <>
                        <FiCheck /> Added to cart
                      </>
                    ) : (
                      <>
                        <FiShoppingCart /> {needsOption ? "Choose an option to add" : "Add to cart"}
                      </>
                    )}
                  </button>
                )}

                {showMessageAction && (
                  <button
                    type="button"
                    className="btn btn-outline btn-lg"
                    onClick={handleToggleChat}
                    aria-expanded={chatOpen}
                  >
                    <FiMessageSquare />{" "}
                    {chatOpen ? "Close message" : "Message seller"}
                  </button>
                )}
              </div>
            </div>

            {product.stalls && (
              <Link
                to={
                  product.stalls.id ? `/stalls/${product.stalls.id}` : "/stalls"
                }
                className="detail-seller-card"
              >
                <div className="seller-avatar">
                  {product.stalls.logo_url ? (
                    <img src={product.stalls.logo_url} alt="" />
                  ) : (
                    <span>{(product.seller_name || product.stalls.name || "S").charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="seller-card-copy">
                  <span>Sold by</span>
                  <strong>{product.seller_name || "Campus seller"}</strong>
                  <small>{product.stalls.name}</small>
                </div>
                <span className="seller-card-link">
                  View stall <FiArrowRight />
                </span>
              </Link>
            )}

            {chatOpen && (
              <div className="detail-chat-panel fade-in" ref={chatRef}>
                <div className="detail-chat-heading">
                  <div>
                    <FiMessageSquare />
                    <span>
                      <strong>Message seller</strong>
                      <small>Ask about this product</small>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label="Close message form"
                  >
                    ×
                  </button>
                </div>
                <label htmlFor="seller-message">Your message</label>
                <textarea
                  id="seller-message"
                  className="form-input"
                  rows={4}
                  maxLength={1000}
                  placeholder={`Hi, I’m interested in “${product.name}”…`}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <div className="detail-chat-footer">
                  <span>{message.length}/1000</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSendMessage}
                    disabled={sending || !message.trim()}
                  >
                    {sending ? (
                      <>
                        <span className="spinner detail-send-spinner" /> Sending
                      </>
                    ) : (
                      <>
                        <FiSend /> Send message
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </article>
        </section>

        {(showCartAction || showMessageAction) && (
          <div className="pd-buybar" role="region" aria-label="Buy this product">
            <div className="pd-buybar-price">
              <strong>{formatPrice(effectivePrice(product))}</strong>
              <small className={isOutOfStock ? "is-out" : isLowStock ? "is-low" : ""}>{needsOption && !isOutOfStock ? "Choose an option" : stockLabel}</small>
            </div>
            {showMessageAction && (
              <button type="button" className="pd-buybar-msg" onClick={handleToggleChat} aria-expanded={chatOpen} aria-label={chatOpen ? "Close message" : "Message seller"}>
                <FiMessageSquare aria-hidden="true" />
              </button>
            )}
            {showCartAction && (
              <button type="button" className={`btn btn-primary pd-buybar-cart ${added ? "btn-added" : ""}`} onClick={handleBuyBar} disabled={adding || isOutOfStock}>
                {adding ? <><span className="spinner" /> Adding…</> : added ? <><FiCheck aria-hidden="true" /> Added</> : isOutOfStock ? "Sold out" : <><FiShoppingCart aria-hidden="true" /> {needsOption ? "Choose option" : "Add to cart"}</>}
              </button>
            )}
          </div>
        )}

        <section
          className="detail-section detail-reviews-section"
          aria-labelledby="reviews-title"
        >
          <div className="detail-section-heading">
            <div>
              <span>Buyer feedback</span>
              <h2 id="reviews-title">Customer reviews</h2>
            </div>
            {reviews.length > 0 && (
              <span>
                {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
              </span>
            )}
          </div>

          {reviews.length > 0 ? (
            <div className="detail-reviews-layout">
              <div className="detail-rating-summary">
                <strong>{rating.toFixed(1)}</strong>
                <StarRating value={rating} size={18} />
                <span>
                  Based on {product.review_count || reviews.length} reviews
                </span>
              </div>
              <div className="detail-review-list">
                {reviews.map((review) => (
                  <article key={review.id} className="review-card">
                    <div className="review-header">
                      <div className="review-avatar" aria-hidden="true">
                        {review.users?.name?.charAt(0)?.toUpperCase() || "B"}
                      </div>
                      <div>
                        <p>{review.users?.name || "Campus buyer"}</p>
                        <div>
                          <StarRating value={review.rating} size={12} />
                          {formatReviewDate(review.created_at) && (
                            <span>{formatReviewDate(review.created_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {review.comment && (
                      <p className="review-text">{review.comment}</p>
                    )}
                    {review.seller_reply && (
                      <div className="review-reply">
                        <strong>Reply from {product.stalls?.name || "the seller"}</strong>
                        <p>{review.seller_reply}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="detail-reviews-empty">
              <span>
                <FiStar />
              </span>
              <div>
                <strong>Be the first to review</strong>
                <p>
                  Bought this? Once you pick up your order, rate it from{" "}
                  <Link to="/orders">My orders</Link>.
                </p>
              </div>
            </div>
          )}
        </section>

        {(similarLoading || similar.length > 0) && (
          <section className="detail-section" aria-labelledby="similar-title">
            <div className="detail-section-heading">
              <div>
                <span>Keep exploring</span>
                <h2 id="similar-title">Similar products</h2>
              </div>
              <Link to="/browse">
                Browse all <FiArrowRight />
              </Link>
            </div>

            {similarLoading ? <SkeletonGrid count={4} /> : (
              <div className="pc-grid detail-similar-grid">
                {similar.slice(0, 8).map((similarProduct) => <ProductCard key={similarProduct.id} product={similarProduct} />)}
              </div>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
