import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { effectivePrice } from "../../utils/pricing.js";
import {
  FiArrowRight,
  FiCheckCircle,
  FiMinus,
  FiPackage,
  FiPlus,
  FiShield,
  FiShoppingBag,
  FiTrash2,
  FiTruck,
} from "react-icons/fi";
import toast from "react-hot-toast";

const formatPrice = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getProduct = (item) => item.products || item.product || item;

const getUnitPrice = (item) => {
  const product = getProduct(item);
  return item.products || item.product ? effectivePrice(product) : Number(item.price) || 0;
};

const getStallName = (item) => {
  const product = getProduct(item);
  return product.stalls?.name || item.stalls?.name || "Campus seller";
};

export default function CartDrawer({
  items = [],
  total,
  onRemove,
  onUpdateQty,
  onCheckout,
}) {
  const [pendingAction, setPendingAction] = useState(null);
  const [failedImages, setFailedImages] = useState({});

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + getUnitPrice(item) * Number(item.quantity || 0),
        0,
      ),
    [items],
  );

  const cartTotal = Number.isFinite(Number(total)) ? Number(total) : subtotal;
  const itemCount = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );

  const stallCount = useMemo(
    () => new Set(items.map(getStallName)).size,
    [items],
  );

  const updateQuantity = async (item, nextQuantity) => {
    const product = getProduct(item);
    const stock = Number(item.option_stock ?? product.stock);
    const quantity = Math.max(1, Number(nextQuantity));

    if (Number.isFinite(stock) && stock >= 0 && quantity > stock) {
      toast.error(
        `Only ${stock} ${stock === 1 ? "item is" : "items are"} available`,
      );
      return;
    }

    const actionKey = `update-${item.id}`;
    try {
      setPendingAction(actionKey);
      await onUpdateQty(item.id, quantity);
    } catch (error) {
      toast.error(error.response?.data?.error || "Could not update quantity");
    } finally {
      setPendingAction(null);
    }
  };

  const removeItem = async (item) => {
    const actionKey = `remove-${item.id}`;
    try {
      setPendingAction(actionKey);
      await onRemove(item.id);
      toast.success(`${getProduct(item).name || "Item"} removed`);
    } catch (error) {
      toast.error(error.response?.data?.error || "Could not remove item");
    } finally {
      setPendingAction(null);
    }
  };

  const markImageFailed = (itemId) => {
    setFailedImages((current) => ({ ...current, [itemId]: true }));
  };

  return (
    <div className="cart-drawer-layout">
      <section className="cart-items-card" aria-labelledby="cart-items-heading">
        <header className="cart-items-header">
          <div>
            <span className="cart-eyebrow">Your selection</span>
            <h2 id="cart-items-heading">
              {itemCount} {itemCount === 1 ? "item" : "items"} in your bag
            </h2>
          </div>
          <span className="cart-seller-count">
            {stallCount} {stallCount === 1 ? "seller" : "sellers"}
          </span>
        </header>

        <div className="cart-item-list">
          {items.map((item) => {
            const product = getProduct(item);
            const quantity = Number(item.quantity || 1);
            const stock = Number(item.option_stock ?? product.stock);
            const isUpdating = pendingAction === `update-${item.id}`;
            const isRemoving = pendingAction === `remove-${item.id}`;
            const isBusy = isUpdating || isRemoving;
            const hasImage = product.image_url && !failedImages[item.id];

            return (
              <article
                className={`cart-line-item ${isRemoving ? "is-removing" : ""}`}
                key={item.id}
              >
                <Link
                  to={`/products/${product.id}`}
                  className="cart-item-media"
                  aria-label={`View ${product.name}`}
                >
                  {hasImage ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                      onError={() => markImageFailed(item.id)}
                    />
                  ) : (
                    <span aria-hidden="true">
                      <FiShoppingBag />
                    </span>
                  )}
                </Link>

                <div className="cart-item-info">
                  <p className="cart-item-stall">
                    <FiCheckCircle aria-hidden="true" />
                    {getStallName(item)}
                  </p>
                  <Link
                    to={`/products/${product.id}`}
                    className="cart-item-name"
                  >
                    {product.name || "Campus Market item"}
                  </Link>
                  {item.option_label && <span className="cart-item-option">{item.option_label}</span>}
                  <span className="cart-item-unit-price">
                    {formatPrice(getUnitPrice(item))} each
                  </span>

                  <div className="cart-item-mobile-controls">
                    <QuantityControl
                      item={item}
                      quantity={quantity}
                      stock={stock}
                      disabled={isBusy}
                      loading={isUpdating}
                      onChange={updateQuantity}
                    />
                  </div>
                </div>

                <div className="cart-item-controls">
                  <QuantityControl
                    item={item}
                    quantity={quantity}
                    stock={stock}
                    disabled={isBusy}
                    loading={isUpdating}
                    onChange={updateQuantity}
                  />
                </div>

                <div className="cart-item-price-block">
                  <strong>{formatPrice(getUnitPrice(item) * quantity)}</strong>
                  <button
                    type="button"
                    className="cart-remove-btn"
                    onClick={() => removeItem(item)}
                    disabled={isBusy}
                    aria-label={`Remove ${product.name} from cart`}
                  >
                    {isRemoving ? (
                      <span
                        className="spinner cart-action-spinner"
                        aria-hidden="true"
                      />
                    ) : (
                      <FiTrash2 aria-hidden="true" />
                    )}
                    <span>Remove</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="cart-items-footer">
          <Link to="/browse" className="cart-continue-link">
            Continue shopping <FiArrowRight aria-hidden="true" />
          </Link>
          <span>Prices are shown in Philippine peso</span>
        </footer>
      </section>

      <aside
        className="cart-summary-card"
        aria-labelledby="order-summary-heading"
      >
        <div className="cart-summary-heading">
          <span className="cart-summary-icon" aria-hidden="true">
            <FiPackage />
          </span>
          <div>
            <span className="cart-eyebrow">Ready when you are</span>
            <h2 id="order-summary-heading">Order summary</h2>
          </div>
        </div>

        <dl className="cart-summary-lines">
          <div>
            <dt>
              Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
            </dt>
            <dd>{formatPrice(cartTotal)}</dd>
          </div>
          <div>
            <dt>Campus pickup</dt>
            <dd className="cart-free-label">Free</dd>
          </div>
        </dl>

        <div className="cart-summary-total">
          <div>
            <span>Total</span>
            <small>Taxes included where applicable</small>
          </div>
          <strong>{formatPrice(cartTotal)}</strong>
        </div>

        <button
          type="button"
          className="btn btn-primary cart-checkout-btn"
          onClick={onCheckout}
          disabled={!items.length || Boolean(pendingAction)}
        >
          Proceed to checkout <FiArrowRight aria-hidden="true" />
        </button>

        <div className="cart-assurance-list">
          <div>
            <FiShield aria-hidden="true" />
            <span>
              <strong>Protected checkout</strong>Secure account-based purchase
            </span>
          </div>
          <div>
            <FiTruck aria-hidden="true" />
            <span>
              <strong>Campus pickup</strong>Arrange pickup with the seller
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function QuantityControl({
  item,
  quantity,
  stock,
  disabled,
  loading,
  onChange,
}) {
  const hasStockLimit = Number.isFinite(stock) && stock >= 0;
  const atMaximum = hasStockLimit && quantity >= stock;

  return (
    <div className="cart-quantity-wrap">
      <span className="sr-only">Quantity</span>
      <div className="cart-quantity-control">
        <button
          type="button"
          onClick={() => onChange(item, quantity - 1)}
          disabled={disabled || quantity <= 1}
          aria-label="Decrease quantity"
        >
          <FiMinus aria-hidden="true" />
        </button>
        <output aria-live="polite">
          {loading ? (
            <span className="spinner cart-action-spinner" aria-hidden="true" />
          ) : (
            quantity
          )}
        </output>
        <button
          type="button"
          onClick={() => onChange(item, quantity + 1)}
          disabled={disabled || atMaximum}
          aria-label="Increase quantity"
        >
          <FiPlus aria-hidden="true" />
        </button>
      </div>
      {hasStockLimit && stock <= 5 && stock > 0 && (
        <small>{stock} in stock</small>
      )}
    </div>
  );
}
