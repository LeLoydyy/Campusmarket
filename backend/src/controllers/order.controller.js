import { orderStore } from "../data/marketStore.js";

// Room for several listed reasons plus a written one.
const CANCEL_REASON_MAX = 600;

// ── POST /api/orders ──────────────────────────────────────────────────────────
export const createOrder = async (req, res, next) => {
  try {
    const { items, delivery_notes, notes, fulfillment, delivery_address } = req.body;
    const order = await orderStore.create(req.user.id, items, delivery_notes ?? notes, fulfillment, delivery_address);
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/orders/buyer ─────────────────────────────────────────────────────
export const getBuyerOrders = async (req, res, next) => {
  try {
    const orders = await orderStore.listBuyer(req.user.id);
    res.json(orders || []);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/orders/seller ────────────────────────────────────────────────────
export const getSellerOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    const orders = await orderStore.listSeller(req.user.id, status);
    res.json(orders || []);
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/orders/:id/status ────────────────────────────────────────────────
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "completed",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const reason =
      typeof req.body.cancel_reason === "string"
        ? req.body.cancel_reason.replace(/\s+/g, " ").trim()
        : "";
    if (reason.length > CANCEL_REASON_MAX) {
      return res.status(400).json({ error: `Keep the reason under ${CANCEL_REASON_MAX} characters.` });
    }
    if (status === "cancelled" && req.user.role === "buyer" && reason.length < 3) {
      return res.status(400).json({ error: "Tell the seller why you're cancelling this order." });
    }
    if (status === "cancelled" && req.user.role === "seller" && reason.length < 3) {
      return res.status(400).json({ error: "Tell the buyer why you're cancelling this order." });
    }
    const readyIn = Number(req.body.ready_in_minutes);
    if (req.body.ready_in_minutes != null && !(Number.isInteger(readyIn) && readyIn >= 1 && readyIn <= 1440)) {
      return res.status(400).json({ error: "Pick a ready time between 1 minute and 24 hours." });
    }

    const order = await orderStore.updateStatus(
      req.params.id,
      status,
      req.user.id,
      req.user.role,
      status === "cancelled" ? reason || null : null,
      typeof req.body.pickup_code === "string" ? req.body.pickup_code : null,
      req.body.ready_in_minutes != null ? readyIn : null,
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
};
