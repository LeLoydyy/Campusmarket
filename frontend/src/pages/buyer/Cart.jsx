import React from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/common/Navbar.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import CartDrawer from "../../components/buyer/CartDrawer.jsx";
import { useCart } from "../../context/CartContext.jsx";

const Cart = () => {
  const { items, total, removeItem, updateItem } = useCart();
  const navigate = useNavigate();

  return (
    <div>
      <Navbar />
      <div className="cart-page">
        <h1>Your Cart</h1>
        {items.length > 0 ? (
          <CartDrawer
            items={items}
            total={total}
            onRemove={removeItem}
            onUpdateQty={updateItem}
            onCheckout={() => navigate("/checkout")}
          />
        ) : (
          <EmptyState
            illustration="bag"
            title="Your cart is empty"
            description="Find a rice bowl for lunch, a varsity tee, or something a classmate made by hand."
            action={{ label: "Start shopping", to: "/browse" }}
            secondaryAction={{ label: "See stalls open now", to: "/stalls" }}
          />
        )}
      </div>

      <style>{`
        .cart-page { max-width: 900px; margin: 0 auto; padding: 1.75rem 1.5rem 4rem; }
        .cart-page h1 { font-size: 1.5rem; font-weight: 800; color: var(--gray-900); margin-bottom: 1.5rem; }
        .cart-empty {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 4rem 1.5rem; border: 1px dashed var(--gray-200); border-radius: var(--radius-xl);
        }
        .cart-empty-icon { color: var(--gray-300); margin-bottom: 1rem; }
        .cart-empty h3 { font-size: 1.1rem; font-weight: 700; color: var(--gray-800); margin-bottom: 0.25rem; }
        .cart-empty p { color: var(--gray-500); font-size: 0.9rem; margin-bottom: 1.25rem; }
      `}</style>
    </div>
  );
};

export default Cart;
