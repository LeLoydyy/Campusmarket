import { test } from "node:test";
import assert from "node:assert/strict";

test("order changes notify the buyer and seller, each only about their side", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { orderStore, notificationStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES
    ('buyer', 'Maria Santos', 'b@test.invalid', 'x', 'buyer', 'approved'),
    ('seller', 'Jayson Cruz', 's@test.invalid', 'x', 'seller', 'approved'),
    ('other', 'Other Buyer', 'o@test.invalid', 'x', 'buyer', 'approved')`);
  await query("INSERT INTO stalls (id, owner_id, name, location, status, is_active) VALUES ('stall', 'seller', 'Campus Eats', 'Main Canteen', 'approved', TRUE)");
  await query("INSERT INTO products (id, stall_id, name, price, stock, image_url) VALUES ('rice', 'stall', 'Adobo Rice', 89.5, 20, '/images/buyer/product-adobo.png')");

  const order = await orderStore.create("buyer", [{ product_id: "rice", quantity: 2 }], "", "pickup");
  let [buyerNote] = await notificationStore.list("buyer");
  assert.equal(buyerNote.title, "Order placed");
  assert.equal(buyerNote.status, "pending");
  assert.equal(buyerNote.read, false);
  assert.match(buyerNote.body, /Campus Eats received your order of 2 items/);
  assert.deepEqual(
    { stall: buyerNote.order.stall_name, items: buyerNote.order.item_count, image: buyerNote.order.first_item.image_url, total: buyerNote.order.total },
    { stall: "Campus Eats", items: 2, image: "/images/buyer/product-adobo.png", total: 179 },
  );
  const [sellerNote] = await notificationStore.list("seller");
  assert.equal(sellerNote.title, "New order");
  assert.equal(sellerNote.body, "Maria Santos ordered 2 items · ₱179.00 (pickup).");
  assert.equal(sellerNote.link, "/seller/orders");

  // Each stage the seller moves the order to reaches the buyer, newest first.
  await orderStore.updateStatus(order.id, "confirmed", "seller", "seller");
  await orderStore.updateStatus(order.id, "preparing", "seller", "seller");
  await orderStore.updateStatus(order.id, "ready", "seller", "seller");
  const buyerNotes = await notificationStore.list("buyer");
  assert.deepEqual(buyerNotes.map((n) => [n.status, n.title]), [
    ["ready", "Ready for pickup"], ["preparing", "Being prepared"], ["confirmed", "Confirmed by seller"], ["pending", "Order placed"],
  ]);
  assert.equal(buyerNotes[0].body, "Collect your order at Campus Eats, Main Canteen.");
  assert.ok(buyerNotes.every((n) => n.order.status === "ready"), "Every card shows the order's current status too");
  assert.equal((await notificationStore.list("seller")).length, 1, "Sellers aren't told about their own updates");

  // A rejected transition rolls back with no notification.
  await assert.rejects(orderStore.updateStatus(order.id, "pending", "seller", "seller"));
  assert.equal((await notificationStore.list("buyer")).length, 4);

  // A buyer cancelling tells the seller, not the buyer.
  const second = await orderStore.create("buyer", [{ product_id: "rice", quantity: 1 }], "", "delivery", "Library lobby");
  await orderStore.updateStatus(second.id, "cancelled", "buyer", "buyer");
  const [cancelNote] = await notificationStore.list("seller");
  assert.equal(cancelNote.title, "Order cancelled by buyer");
  assert.equal((await notificationStore.list("buyer"))[0].title, "Order placed");

  // Unread counts, marking read, and nobody can touch someone else's notifications.
  let summary = await notificationStore.summary("buyer");
  assert.equal(summary.unread, 5);
  assert.equal(summary.latest_id, (await notificationStore.list("buyer"))[0].id);
  await assert.rejects(notificationStore.markRead("other", summary.latest_id), { status: 404 });
  await notificationStore.markRead("buyer", summary.latest_id);
  assert.equal((await notificationStore.summary("buyer")).unread, 4);
  await notificationStore.markAllRead("buyer");
  summary = await notificationStore.summary("buyer");
  assert.equal(summary.unread, 0);
  assert.equal((await notificationStore.summary("seller")).unread, 3);
  assert.deepEqual(await notificationStore.list("other"), []);
});
