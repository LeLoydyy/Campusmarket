import React from "react";
import { Link } from "react-router-dom";
import { Trash2, Minus, Plus } from "lucide-react";

const formatPrice = (p) =>
  `₱${Number(p).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const CartDrawer = ({ items, total, onRemove, onUpdateQty, onCheckout }) => {
  return (
    <div className="cart-drawer">
      <div className="cart-items">
        {items.map((item) => {
          const product = item.products || item;
          const price = product.price ?? item.price ?? 0;
          const lineTotal = price * item.quantity;

          return (
            <div key={item.id} className="cart-item">
              <div className="cart-item-thumb">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} />
                ) : (
                  "🛍️"
                )}
              </div>

              <div className="cart-item-info">
                <Link to={`/products/${product.id}`} className="cart-item-name">
                  {product.name}
                </Link>
                <span className="cart-item-price">
                  {formatPrice(price)} each
                </span>
              </div>

              <div className="cart-item-qty">
                <button
                  className="qty-step-btn"
                  onClick={() =>
                    onUpdateQty(item.id, Math.max(1, item.quantity - 1))
                  }
                  aria-label="Decrease quantity"
                >
                  <Minus size={14} />
                </button>
                <span className="qty-step-val">{item.quantity}</span>
                <button
                  className="qty-step-btn"
                  onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                  aria-label="Increase quantity"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="cart-item-line-total">
                {formatPrice(lineTotal)}
              </div>

              <button
                className="cart-item-remove"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${product.name}`}
              >
                <Trash2 size={17} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Subtotal</span>
          <span>{formatPrice(total)}</span>
        </div>
        <p className="cart-summary-note">
          Shipping and fees calculated at checkout.
        </p>
        <button
          className="btn btn-primary btn-lg cart-checkout-btn"
          onClick={onCheckout}
        >
          Checkout ({items.length} {items.length === 1 ? "item" : "items"})
        </button>
      </div>

      <style>{`
        .cart-drawer { display: flex; flex-direction: column; gap: 1.5rem; }

        .cart-items { display: flex; flex-direction: column; gap: 0.75rem; }
        .cart-item {
          display: grid; grid-template-columns: 64px 1fr auto auto auto;
          align-items: center; gap: 1rem; padding: 0.9rem;
          background: #fff; border: 1px solid var(--gray-200); border-radius: var(--radius-lg);
        }
        .cart-item-thumb {
          width: 64px; height: 64px; border-radius: var(--radius-md); overflow: hidden;
          background: var(--gray-100); display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem; flex-shrink: 0;
        }
        .cart-item-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .cart-item-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
        .cart-item-name {
          font-weight: 600; color: var(--gray-900); font-size: 0.9rem; text-decoration: none;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cart-item-name:hover { color: var(--color-primary); }
        .cart-item-price { font-size: var(--text-xs); color: var(--gray-500); }

        .cart-item-qty {
          display: inline-flex; align-items: center; gap: 0.5rem;
          border: 1.5px solid var(--gray-200); border-radius: var(--radius-md); padding: 0.25rem;
        }
        .qty-step-btn {
          width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm, 6px); color: var(--gray-600); background: none; border: none;
          transition: var(--transition-fast); cursor: pointer;
        }
        .qty-step-btn:hover { background: var(--gray-100); }
        .qty-step-val { min-width: 20px; text-align: center; font-weight: 600; font-size: 0.85rem; }

        .cart-item-line-total { font-weight: 700; color: var(--color-primary); white-space: nowrap; }
        .cart-item-remove {
          display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: var(--radius-md); color: var(--gray-400);
          background: none; border: none; cursor: pointer; transition: var(--transition-fast);
        }
        .cart-item-remove:hover { background: var(--color-danger-light); color: var(--color-danger); }

        .cart-summary {
          background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius-xl);
          padding: 1.25rem;
        }
        .cart-summary-row {
          display: flex; align-items: center; justify-content: space-between;
          font-weight: 700; font-size: 1.1rem; color: var(--gray-900); margin-bottom: 0.375rem;
        }
        .cart-summary-note { font-size: 0.8rem; color: var(--gray-500); margin-bottom: 1rem; }
        .cart-checkout-btn { width: 100%; }

        @media (max-width: 640px) {
          .cart-item { grid-template-columns: 48px 1fr; grid-template-rows: auto auto; row-gap: 0.5rem; position: relative; }
          .cart-item-qty, .cart-item-line-total { grid-column: 2; }
          .cart-item-remove { position: absolute; top: 0.6rem; right: 0.6rem; }
        }
      `}</style>
    </div>
  );
};

export default CartDrawer;
