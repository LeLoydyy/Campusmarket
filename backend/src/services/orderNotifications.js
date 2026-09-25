/**
 * orderNotifications.js — the text of order notifications.
 *
 * Buyers hear about every stage their order reaches; sellers hear about new
 * orders and buyer cancellations. The frontend draws the progress bar from
 * `status`, so titles here only need to read well.
 */

const peso = (amount) => `₱${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const items = (count) => `${count} ${count === 1 ? "item" : "items"}`;

/**
 * @param {object} order      { status, fulfillment, total }
 * @param {object} context    { stallName, stallLocation, buyerName, itemCount }
 * @returns {{ title: string, body: string }}
 */
export const buyerOrderMessage = (order, { stallName, stallLocation, itemCount }) => {
  const stall = stallName || "The seller";
  const delivery = order.fulfillment === "delivery";
  switch (order.status) {
    case "pending":
      return { title: "Order placed", body: `${stall} received your order of ${items(itemCount)}. We'll let you know when it's confirmed.` };
    case "confirmed":
      return { title: "Confirmed by seller", body: `${stall} accepted your order and will start preparing it soon.` };
    case "preparing":
      return { title: "Being prepared", body: `${stall} is preparing your order now.` };
    case "ready":
      return delivery
        ? { title: "Ready for delivery", body: `${stall} has your order ready and will deliver it soon.` }
        : { title: "Ready for pickup", body: `Collect your order at ${stall}${stallLocation ? `, ${stallLocation}` : ""}.` };
    case "delivered":
      return { title: "Order delivered", body: `Your order from ${stall} was delivered. Enjoy!` };
    case "completed":
      return { title: "Order completed", body: `Thanks for shopping at ${stall}!` };
    case "cancelled":
      return { title: "Order cancelled", body: `${stall} cancelled your order.` };
    default:
      return { title: "Order updated", body: `Your order from ${stall} was updated.` };
  }
};

export const sellerNewOrderMessage = (order, { buyerName, itemCount }) => ({
  title: "New order",
  body: `${buyerName || "A buyer"} ordered ${items(itemCount)} · ${peso(order.total)} (${order.fulfillment === "delivery" ? "delivery" : "pickup"}).`,
});

export const sellerCancelledMessage = (_order, { buyerName }) => ({
  title: "Order cancelled by buyer",
  body: `${buyerName || "The buyer"} cancelled their order. The stock is back on your shelf.`,
});
