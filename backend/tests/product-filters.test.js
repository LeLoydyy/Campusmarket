import { test } from "node:test";
import assert from "node:assert/strict";
import { isStallOpen } from "../src/services/openingHours.js";

// "h:mm AM" in campus time, offset from now by `hours`.
const manilaClock = (hours) => new Date(Date.now() + hours * 3600000)
  .toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

test("opening hours are read in campus time", () => {
  assert.equal(isStallOpen({ is_active: true, operating_hours: `${manilaClock(-1)} – ${manilaClock(1)}` }), true);
  assert.equal(isStallOpen({ is_active: true, operating_hours: `${manilaClock(2)} – ${manilaClock(3)}` }), false);
  assert.equal(isStallOpen({ is_active: false, operating_hours: "" }), false, "Seller closed the store");
  assert.equal(isStallOpen({ is_active: true, operating_hours: "Whenever" }), true, "Unreadable hours count as open");
  // Overnight window (e.g. 10:00 PM – 2:00 AM)
  const noon = new Date("2026-09-25T04:00:00Z"); // 12:00 in Manila
  assert.equal(isStallOpen({ is_active: true, operating_hours: "10:00 PM - 2:00 AM" }, noon), false);
  assert.equal(isStallOpen({ is_active: true, operating_hours: "10:00 PM to 2:00 AM" }, new Date("2026-09-25T16:30:00Z")), true);
});

test("product list sorts, filters by pickup spot and open-now, and pages correctly", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { productStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES
    ('s1', 'A', 'a@test.invalid', 'x', 'seller', 'approved'), ('s2', 'B', 'b@test.invalid', 'x', 'seller', 'approved')`);
  await query(`INSERT INTO stalls (id, owner_id, name, location, operating_hours, status, is_active) VALUES
    ('open', 's1', 'Open Stall', 'Main Canteen', $1, 'approved', TRUE),
    ('shut', 's2', 'Shut Stall', 'Library Annex', $2, 'approved', TRUE)`,
    [`${manilaClock(-1)} – ${manilaClock(1)}`, `${manilaClock(2)} – ${manilaClock(3)}`]);
  await query(`INSERT INTO products (id, stall_id, name, price, view_count, created_at) VALUES
    ('a', 'open', 'Apple', 30, 5, now() - interval '3 days'),
    ('b', 'open', 'Banana', 10, 50, now() - interval '2 days'),
    ('c', 'shut', 'Cherry', 20, 1, now() - interval '1 day')`);

  const names = async (options) => (await productStore.listProducts(options)).data.map((p) => p.name);
  assert.deepEqual(await names({}), ["Apple", "Banana", "Cherry"], "Default order unchanged");
  assert.deepEqual(await names({ sort: "price_asc" }), ["Banana", "Cherry", "Apple"]);
  assert.deepEqual(await names({ sort: "price_desc" }), ["Apple", "Cherry", "Banana"]);
  assert.deepEqual(await names({ sort: "popular" }), ["Banana", "Apple", "Cherry"]);
  assert.deepEqual(await names({ sort: "newest" }), ["Cherry", "Banana", "Apple"]);
  assert.deepEqual(await names({ sort: "p.price; DROP TABLE products" }), ["Apple", "Banana", "Cherry"], "Unknown sorts fall back safely");
  assert.deepEqual(await names({ location: "Library Annex" }), ["Cherry"]);

  const open = await productStore.listProducts({ openNow: true, limit: 1, sort: "price_asc" });
  assert.equal(open.total, 2, "Only the open stall's products");
  assert.deepEqual(open.data.map((p) => p.name), ["Banana"]);
  assert.deepEqual((await productStore.listProducts({ openNow: true, limit: 1, page: 2, sort: "price_asc" })).data.map((p) => p.name), ["Apple"]);

  assert.deepEqual(await productStore.listLocations(), ["Library Annex", "Main Canteen"]);
});
