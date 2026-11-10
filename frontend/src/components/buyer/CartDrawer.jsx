import React from "react";
import { Link } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag, Wallet } from "lucide-react";
import { effectivePrice } from "../../utils/pricing.js";
import "./CartDrawer.css";

const formatPrice = (p) =>
  `₱${Number(p).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const CartDrawer = ({ items, total, onRemove, onUpdateQty, onCheckout }) => {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="cart-drawer">
      <ul className="cart-items">
        {items.map((item) => {
          const product = item.products || item;
          const price = item.products ? effectivePrice(product) : Number(item.price) || 0;
          const stock = Number(item.option_stock ?? product.stock);
          const atMax = Number.isFinite(stock) && item.quantity >= stock;

          return (
            <li key={item.id} className="cart-item">
              <Link to={`/products/${product.id}`} className="cart-item-thumb" tabIndex={-1} aria-hidden="true">
                {product.image_url ? <img src={product.image_url} alt="" /> : <ShoppingBag />}
              </Link>

              <div className="cart-item-info">
                <Link to={`/products/${product.id}`} className="cart-item-name">{product.name}</Link>
                {item.option_label && <span className="cart-item-option">{item.option_label}</span>}
                <span className="cart-item-price">{formatPrice(price)} each</span>
              </div>

              <button type="button" className="cart-item-remove" onClick={() => onRemove(item.id)} aria-label={`Remove ${product.name}`}>
                <Trash2 aria-hidden="true" />
              </button>

              <div className="cart-item-foot">
                <div className="cart-item-qty" role="group" aria-label={`Quantity of ${product.name}`}>
                  <button type="button" onClick={() => onUpdateQty(item.id, Math.max(1, item.quantity - 1))}
                    disabled={item.quantity <= 1} aria-label="Decrease quantity">
                    <Minus aria-hidden="true" />
                  </button>
                  <span aria-live="polite">{item.quantity}</span>
                  <button type="button" onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                    disabled={atMax} aria-label="Increase quantity" title={atMax ? "That's all the stock left" : undefined}>
                    <Plus aria-hidden="true" />
                  </button>
                </div>
                <strong className="cart-item-line-total">{formatPrice(price * item.quantity)}</strong>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="cart-summary" aria-label="Order summary">
        <div className="cart-summary-row">
          <span>Subtotal · {count} {count === 1 ? "item" : "items"}</span>
          <strong>{formatPrice(total)}</strong>
        </div>
        <p className="cart-summary-note">
          <Wallet aria-hidden="true" /> No fees. Pay cash when you pick up, or when a delivery arrives.
        </p>
        <button type="button" className="btn btn-primary btn-lg cart-checkout-btn" onClick={onCheckout}>
          Checkout · {formatPrice(total)}
        </button>
      </section>
    </div>
  );
};

export default CartDrawer;
