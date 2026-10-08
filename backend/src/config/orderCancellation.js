export const CANCELLATION_WINDOW_MS = 10 * 60 * 1000;
// Once the seller marks an order ready the food is already made, so buyers can no longer cancel.
const CANCELLABLE_STATUSES = new Set(["pending", "confirmed", "preparing"]);
export const LOCKED_STATUSES = new Set(["ready", "ready-for-pickup", "out-for-delivery"]);

export const cancellationDeadline = (order) => {
  const created = Date.parse(order.created_at);
  return Number.isFinite(created) ? created + CANCELLATION_WINDOW_MS : null;
};

export const canBuyerCancel = (order, now = Date.now()) => {
  const deadline = cancellationDeadline(order);
  return deadline !== null && now >= deadline - CANCELLATION_WINDOW_MS && now < deadline && CANCELLABLE_STATUSES.has(order.status);
};
