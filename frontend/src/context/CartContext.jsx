import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { cartService } from "../services/api.js";
import { useAuth } from "./AuthContext.jsx";
import { effectivePrice } from "../utils/pricing.js";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!user || user.role !== "buyer" || user.status !== "approved") { setItems([]); return; }
    try {
      setLoading(true);
      const { data } = await cartService.get();
      setItems(data || []);
    } catch {
      // ignore network errors silently
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addItem = useCallback(async (product, quantity = 1, optionId = null) => {
    const { data } = await cartService.add(product.id, quantity, optionId);
    await fetchCart();
    return data;
  }, [fetchCart]);

  const updateItem = useCallback(async (itemId, quantity) => {
    await cartService.update(itemId, quantity);
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i))
    );
  }, []);

  const removeItem = useCallback(async (itemId) => {
    await cartService.remove(itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const clearCart = useCallback(async () => {
    await cartService.clear();
    setItems([]);
  }, []);

  const total = items.reduce(
    (sum, item) => sum + (item.products ? effectivePrice(item.products) : Number(item.price) || 0) * item.quantity,
    0
  );
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ items, loading, total, count, addItem, updateItem, removeItem, clearCart, fetchCart }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
};