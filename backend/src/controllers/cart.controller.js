import { cartStore } from "../data/marketStore.js";

// GET /api/cart
export const getCart = async (req, res, next) => {
  try {
    const items = await cartStore.list(req.user.id);
    res.json(items || []);
  } catch (err) {
    next(err);
  }
};

// POST /api/cart
export const addToCart = async (req, res, next) => {
  try {
    const { product_id, quantity = 1, option_id = null } = req.body;
    const item = await cartStore.add(req.user.id, product_id, quantity, option_id);
    res.json(item);
  } catch (err) {
    next(err);
  }
};

// PUT /api/cart/:id
export const updateCartItem = async (req, res, next) => {
  try {
    const item = await cartStore.update(req.user.id, req.params.id, req.body.quantity);
    res.json(item);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cart/:id
export const removeCartItem = async (req, res, next) => {
  try {
    await cartStore.remove(req.user.id, req.params.id);
    res.json({ message: "Item removed" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cart/clear
export const clearCart = async (req, res, next) => {
  try {
    await cartStore.clear(req.user.id);
    res.json({ message: "Cart cleared" });
  } catch (err) {
    next(err);
  }
};
