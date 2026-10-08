import test from "node:test";
import assert from "node:assert/strict";
import { canBuyerCancel } from "../src/config/orderCancellation.js";

test("buyer cancellation enforces ten minutes and restores stock only once", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { orderStore } = await import("../src/data/marketStore.js");
  t.after(closeDb);

  const now = Date.parse("2026-09-08T12:00:00Z");
  t.mock.method(Date, "now", () => now);
  for (const id of ["buyer", "seller", "another-buyer"]) {
    await query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, $1, $1 || '@test.invalid', 'x', $2, 'approved')",
      [id, id === "seller" ? "seller" : "buyer"]);
  }
  await query("INSERT INTO stalls (id, owner_id, name, status, is_active) VALUES ('stall', 'seller', 'Stall', 'approved', TRUE)");
  await query("INSERT INTO products (id, stall_id, name, price, stock) VALUES ('product', 'stall', 'Rice', 89, 100)");

  const makeOrder = (id, age, status = "pending") => ({ id, status, created_at: new Date(now - age).toISOString() });
  const orders = [
    makeOrder("new", 0), makeOrder("just-before", 599999), makeOrder("exact", 600000),
    makeOrder("expired", 600001), makeOrder("confirmed", 1000, "confirmed"),
    makeOrder("ready", 1000, "ready"), makeOrder("delivered", 1000, "delivered"),
    makeOrder("cancelled", 1000, "cancelled"), makeOrder("foreign", 1000),
    makeOrder("future", -1000),
  ];
  for (const order of orders) {
    await query("INSERT INTO orders (id, buyer_id, seller_id, stall_id, total, status, created_at) VALUES ($1, 'buyer', 'seller', 'stall', 178, $2, $3)",
      [order.id, order.status, order.created_at]);
    await query("INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES ($1, 'product', 'Rice', 2, 89)", [order.id]);
  }
  const stock = async () => (await query("SELECT stock FROM products WHERE id = 'product'"))[0].stock;

  for (const id of ["new", "just-before", "confirmed"]) {
    const before = await stock();
    const result = await orderStore.updateStatus(id, "cancelled", "buyer", "buyer");
    assert.equal(result.status, "cancelled");
    assert.ok(result.cancelled_at);
    assert.equal(await stock(), before + 2);
    await assert.rejects(orderStore.updateStatus(id, "cancelled", "buyer", "buyer"), { status: 409 });
    assert.equal(await stock(), before + 2, "Repeated requests must not restore stock twice");
  }
  for (const id of ["exact", "expired", "ready", "delivered", "cancelled", "future"]) {
    const before = await stock();
    assert.equal(canBuyerCancel(orders.find((order) => order.id === id), now), false);
    await assert.rejects(orderStore.updateStatus(id, "cancelled", "buyer", "buyer"), { status: 409 });
    assert.equal(await stock(), before);
  }
  // A ready order is already prepared: even inside the 10 minutes the buyer is told why.
  await assert.rejects(orderStore.updateStatus("ready", "cancelled", "buyer", "buyer"), { status: 409, message: /already prepared/ });
  assert.equal(canBuyerCancel({ status: "pending", created_at: "invalid" }, now), false);
  await assert.rejects(orderStore.updateStatus("foreign", "cancelled", "another-buyer", "buyer"), { status: 403 });
  await assert.rejects(orderStore.updateStatus("foreign", "confirmed", "buyer", "buyer"), { status: 403 });
  // A seller must not advance an order after its buyer has cancelled it.
  await assert.rejects(orderStore.updateStatus("new", "confirmed", "seller", "seller"), { status: 400 });

  // Two simultaneous cancels of the same order must restore stock exactly once.
  await query("INSERT INTO orders (id, buyer_id, seller_id, total, created_at) VALUES ('race', 'buyer', 'seller', 178, $1)", [new Date(now).toISOString()]);
  await query("INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES ('race', 'product', 'Rice', 2, 89)");
  const before = await stock();
  const results = await Promise.allSettled([1, 2].map(() => orderStore.updateStatus("race", "cancelled", "buyer", "buyer")));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await stock(), before + 2);

  // The buyer's reason is stored, returned with their orders, and passed on to the seller.
  const { updateOrderStatus } = await import("../src/controllers/order.controller.js");
  const callController = async (body) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
    let error = null;
    await updateOrderStatus({ params: { id: "reasoned" }, body, user: { id: "buyer", role: "buyer" } }, res, (err) => { error = err; });
    return { res, error };
  };
  await query("INSERT INTO orders (id, buyer_id, seller_id, total, created_at) VALUES ('reasoned', 'buyer', 'seller', 89, $1)", [new Date(now).toISOString()]);
  await query("INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES ('reasoned', 'product', 'Rice', 1, 89)");

  const missing = await callController({ status: "cancelled" });
  assert.equal(missing.res.statusCode, 400, "A buyer must give a reason to cancel");
  const tooLong = await callController({ status: "cancelled", cancel_reason: "x".repeat(601) });
  assert.equal(tooLong.res.statusCode, 400);
  assert.equal((await query("SELECT status FROM orders WHERE id = 'reasoned'"))[0].status, "pending");

  const ok = await callController({ status: "cancelled", cancel_reason: "  I ordered   by mistake; I don't need it anymore " });
  assert.equal(ok.error, null);
  assert.equal(ok.res.body.cancel_reason, "I ordered by mistake; I don't need it anymore");
  const listed = (await orderStore.listBuyer("buyer")).find((order) => order.id === "reasoned");
  assert.equal(listed.cancel_reason, "I ordered by mistake; I don't need it anymore");
  const [note] = await query("SELECT body FROM notifications WHERE user_id = 'seller' AND order_id = 'reasoned'");
  assert.match(note.body, /I ordered by mistake/);
});
