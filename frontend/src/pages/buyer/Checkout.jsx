import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import orderService from "../../services/orderService.js";
import { useNotifications } from "../../context/NotificationContext.jsx";
import toast from "react-hot-toast";

const NOTES_LIMIT = 300;

const formatPrice = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getProduct = (item) => item.products || item.product || item;

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { user } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const navigate = useNavigate();

  const [fulfillment, setFulfillment] = useState("pickup");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [failedImages, setFailedImages] = useState({});

  const itemCount = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const hasDeliveryAddress = Boolean(user?.address?.trim());

  const selectFulfillment = (method) => {
    if (placing) return;
    setFulfillment(method);
  };

  const handlePlaceOrder = async (event) => {
    event.preventDefault();
    if (!items.length || placing) return;

    try {
      setPlacing(true);
      await orderService.createOrder({
        items: items.map((item) => ({
          product_id:
            item.products?.id ?? item.product?.id ?? item.product_id ?? item.id,
          quantity: item.quantity,
        })),
        fulfillment,
        delivery_notes: notes.trim(),
      });
      // The server records "Order placed"; load it quietly (no pop-up for your own action).
      refreshNotifications({ announce: false });
      await clearCart();
      toast.success("Order placed successfully");
      navigate("/orders");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error?.error || error?.message || "Failed to place order";
      toast.error(message);
    } finally {
      setPlacing(false);
    }
  };

  const markImageFailed = (itemId) => {
    setFailedImages((current) => ({ ...current, [itemId]: true }));
  };

  if (!items.length) {
    return (
      <div className="checkout-shell">
        <Navbar />
        <main className="checkout-page checkout-page-empty">
          <h1 className="sr-only">Checkout</h1>
          <EmptyState
            illustration="bag"
            title="Nothing to check out yet"
            description="Add something from a campus seller, then come back here to complete your order."
            action={{ label: "Browse products", to: "/browse" }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="checkout-shell">
      <Navbar />

      <main className="checkout-page">
        <nav className="checkout-breadcrumb" aria-label="Breadcrumb">
          <Link to="/cart">
            <ArrowLeft size={14} /> Cart
          </Link>
          <ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page">Checkout</span>
        </nav>

        <header className="checkout-page-header">
          <div>
            <span className="checkout-eyebrow">Final step</span>
            <h1>Review and place your order</h1>
            <p>
              Confirm how you want to receive your items before placing the
              order.
            </p>
          </div>
          <div className="checkout-secure-badge">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              <strong>Protected checkout</strong>Your account details stay
              private
            </span>
          </div>
        </header>

        <div className="checkout-progress" aria-label="Checkout progress">
          <div className="is-complete">
            <span>
              <Check size={13} />
            </span>
            <strong>Cart</strong>
          </div>
          <i aria-hidden="true" />
          <div className="is-current">
            <span>2</span>
            <strong>Details</strong>
          </div>
          <i aria-hidden="true" />
          <div>
            <span>3</span>
            <strong>Confirmation</strong>
          </div>
        </div>

        <form className="checkout-layout" onSubmit={handlePlaceOrder}>
          <div className="checkout-main">
            <section
              className="checkout-card"
              aria-labelledby="fulfillment-heading"
            >
              <div className="checkout-card-heading">
                <span>1</span>
                <div>
                  <h2 id="fulfillment-heading">Choose a fulfillment method</h2>
                  <p>Select the most convenient way to receive your order.</p>
                </div>
              </div>

              <div
                className="fulfillment-options"
                role="radiogroup"
                aria-label="Fulfillment method"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === "pickup"}
                  className={`fulfillment-option ${fulfillment === "pickup" ? "active" : ""}`}
                  onClick={() => selectFulfillment("pickup")}
                >
                  <span className="fulfillment-icon">
                    <Store size={20} />
                  </span>
                  <span className="fulfillment-copy">
                    <strong>Campus pickup</strong>
                    <small>
                      Meet the seller or collect from their campus stall
                    </small>
                    <em>Free</em>
                  </span>
                  <span className="fulfillment-radio" aria-hidden="true">
                    {fulfillment === "pickup" && <Check size={13} />}
                  </span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === "delivery"}
                  className={`fulfillment-option ${fulfillment === "delivery" ? "active" : ""}`}
                  onClick={() => selectFulfillment("delivery")}
                >
                  <span className="fulfillment-icon">
                    <Truck size={20} />
                  </span>
                  <span className="fulfillment-copy">
                    <strong>Campus delivery</strong>
                    <small>
                      Delivery to a dorm or building inside the campus
                    </small>
                    <em>Fee arranged by seller</em>
                  </span>
                  <span className="fulfillment-radio" aria-hidden="true">
                    {fulfillment === "delivery" && <Check size={13} />}
                  </span>
                </button>
              </div>

              {fulfillment === "delivery" && (
                <div
                  className={`checkout-address ${hasDeliveryAddress ? "has-address" : "needs-address"}`}
                >
                  <span className="checkout-address-icon">
                    <MapPin size={17} />
                  </span>
                  <div>
                    <strong>
                      {hasDeliveryAddress
                        ? "Delivery address"
                        : "Address needed"}
                    </strong>
                    <span>
                      {user?.address ||
                        "No delivery address is saved. Add your exact campus location in your profile."}
                    </span>
                  </div>
                  {hasDeliveryAddress && (
                    <CheckCircle2 size={17} aria-label="Address available" />
                  )}
                </div>
              )}
            </section>

            <section className="checkout-card" aria-labelledby="notes-heading">
              <div className="checkout-card-heading">
                <span>2</span>
                <div>
                  <h2 id="notes-heading">Add order notes</h2>
                  <p>Optional instructions will be shared with the seller.</p>
                </div>
              </div>

              <div className="checkout-notes-field">
                <ClipboardList size={17} aria-hidden="true" />
                <textarea
                  className="form-input"
                  rows={4}
                  maxLength={NOTES_LIMIT}
                  placeholder="Example: I can pick this up after my 3:00 PM class."
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={placing}
                />
              </div>
              <span className="checkout-character-count">
                {notes.length}/{NOTES_LIMIT}
              </span>
            </section>

            <section
              className="checkout-card"
              aria-labelledby="checkout-items-heading"
            >
              <div className="checkout-card-heading checkout-items-heading">
                <span>3</span>
                <div>
                  <h2 id="checkout-items-heading">Review your items</h2>
                  <p>
                    {itemCount} {itemCount === 1 ? "item" : "items"} from campus
                    sellers
                  </p>
                </div>
                <Link to="/cart">Edit cart</Link>
              </div>

              <div className="checkout-items">
                {items.map((item) => {
                  const product = getProduct(item);
                  const price = Number(product.price ?? item.price ?? 0);
                  const hasImage = product.image_url && !failedImages[item.id];

                  return (
                    <article key={item.id} className="checkout-item">
                      <Link
                        to={`/products/${product.id}`}
                        className="checkout-item-thumb"
                      >
                        {hasImage ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            loading="lazy"
                            onError={() => markImageFailed(item.id)}
                          />
                        ) : (
                          <ShoppingBag size={20} aria-hidden="true" />
                        )}
                      </Link>
                      <div className="checkout-item-info">
                        <span>{product.stalls?.name || "Campus seller"}</span>
                        <Link
                          to={`/products/${product.id}`}
                          className="checkout-item-name"
                        >
                          {product.name || "Campus Market item"}
                        </Link>
                        <small>Quantity: {item.quantity}</small>
                      </div>
                      <div className="checkout-item-price">
                        <strong>
                          {formatPrice(price * Number(item.quantity || 0))}
                        </strong>
                        <span>{formatPrice(price)} each</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside
            className="checkout-summary"
            aria-labelledby="checkout-summary-heading"
          >
            <div className="checkout-summary-heading">
              <span>
                <PackageCheck size={19} />
              </span>
              <div>
                <span className="checkout-eyebrow">Almost there</span>
                <h2 id="checkout-summary-heading">Order summary</h2>
              </div>
            </div>

            <dl className="checkout-summary-lines">
              <div>
                <dt>Subtotal ({itemCount})</dt>
                <dd>{formatPrice(total)}</dd>
              </div>
              <div>
                <dt>
                  {fulfillment === "delivery"
                    ? "Campus delivery"
                    : "Campus pickup"}
                </dt>
                <dd
                  className={
                    fulfillment === "pickup" ? "is-free" : "is-arranged"
                  }
                >
                  {fulfillment === "delivery" ? "Seller arranged" : "Free"}
                </dd>
              </div>
            </dl>

            <div className="checkout-summary-total">
              <div>
                <strong>Total</strong>
                <small>Delivery fee, if any, is paid separately</small>
              </div>
              <strong>{formatPrice(total)}</strong>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg checkout-submit"
              disabled={placing}
            >
              {placing ? (
                <>
                  <span
                    className="spinner checkout-submit-spinner"
                    aria-hidden="true"
                  />{" "}
                  Placing order…
                </>
              ) : (
                <>
                  Place order <ChevronRight size={18} aria-hidden="true" />
                </>
              )}
            </button>

            <p className="checkout-submit-note">
              <ShieldCheck size={14} aria-hidden="true" />
              You can cancel from Your orders within 10 minutes of placing an
              order, unless it has already been delivered.
            </p>
          </aside>
        </form>
      </main>
    </div>
  );
}
