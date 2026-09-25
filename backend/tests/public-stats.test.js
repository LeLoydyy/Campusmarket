import { test } from "node:test";
import assert from "node:assert/strict";

test("public stats count real activity and never expose who ordered", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { orderStore, statsStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES
    ('b1', 'Maria Santos', 'b1@test.invalid', 'x', 'buyer', 'approved'),
    ('b2', 'Jose Rizal', 'b2@test.invalid', 'x', 'buyer', 'approved'),
    ('s1', 'Seller One', 's1@test.invalid', 'x', 'seller', 'approved'),
    ('s2', 'Hidden Seller', 's2@test.invalid', 'x', 'seller', 'pending')`);
  await query(`INSERT INTO stalls (id, owner_id, name, status, is_active) VALUES
    ('open', 's1', 'Open Stall', 'approved', TRUE), ('hidden', 's2', 'Hidden Stall', 'approved', TRUE)`);
  await query(`INSERT INTO products (id, stall_id, name, price, stock) VALUES
    ('p1', 'open', 'Adobo Rice', 89, 50), ('p2', 'open', 'Iced Coffee', 65, 50), ('p3', 'hidden', 'Secret', 10, 5)`);

  await orderStore.create("b1", [{ product_id: "p1", quantity: 1 }]);
  await orderStore.create("b1", [{ product_id: "p2", quantity: 1 }]);
  const cancelled = await orderStore.create("b2", [{ product_id: "p1", quantity: 1 }]);
  await orderStore.updateStatus(cancelled.id, "cancelled", "b2", "buyer");

  const stats = await statsStore.publicSummary();
  assert.equal(stats.active_stalls, 1, "Stalls of unapproved owners aren't public");
  assert.equal(stats.products, 2);
  assert.equal(stats.students_served, 1, "Distinct buyers with a non-cancelled order");
  assert.deepEqual(stats.recent_orders.map((o) => o.product_name), ["Iced Coffee", "Adobo Rice"]);
  const json = JSON.stringify(stats);
  for (const secret of ["Maria", "Jose", "b1", "b2", "buyer", "total"]) assert.ok(!json.includes(secret), `leaked ${secret}`);
  assert.deepEqual(Object.keys(stats.recent_orders[0]).sort(), ["image_url", "ordered_at", "product_name"]);
});
