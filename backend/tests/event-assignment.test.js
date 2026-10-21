import { test } from "node:test";
import assert from "node:assert/strict";

test("admins place approved applicants on saved spaces, move them and clear them", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { eventStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES
    ('s1', 'James Lloyd', 's1@test.invalid', 'x', 'seller', 'approved'),
    ('s2', 'Other Seller', 's2@test.invalid', 'x', 'seller', 'approved')`);
  await query("INSERT INTO stalls (id, owner_id, name, logo_url, status, is_active) VALUES ('st1', 's1', 'Laloydyy', '/logo.png', 'approved', TRUE)");
  const event = await eventStore.saveEvent({ name: "Fair", location: "Court", date: "2026-10-01" }, "admin");
  const { stalls } = await eventStore.saveLayout(event.id, { version: 0, stalls: [
    { id: "a", stall_number: 1, category: "food", status: "available", size: "3m x 3m", price: 0 },
    { id: "b", stall_number: 2, category: "food", status: "available", size: "3m x 3m", price: 0 },
  ] }, "admin");
  const [one, two] = stalls;
  const apply = (sellerId) => eventStore.submitApplication(sellerId, { eventId: event.id, stallName: "Laloydyy", businessName: "Laloydyy",
    productCategory: "food", productList: "siomai rice", preferredStallSize: 4, duration: 2, contactInfo: "09171234567" });
  const app = await apply("s1");

  await assert.rejects(eventStore.assignSpace(event.id, one.id, { applicationId: app.id }, "admin"), { status: 409 }, "pending apps can't be placed");
  await eventStore.reviewApplication(app.id, "admin", { status: "approved", note: "Welcome aboard" });
  await assert.rejects(eventStore.assignSpace(event.id, "unsaved", { applicationId: app.id }, "admin"), { status: 404 });

  const placed = await eventStore.assignSpace(event.id, one.id, { applicationId: app.id }, "admin");
  assert.equal(placed.seller_id, "s1");
  assert.equal(placed.status, "occupied");
  assert.equal(placed.sellerStallName, "Laloydyy");
  assert.equal(placed.sellerLogo, "/logo.png");
  const [notice] = await query("SELECT title, link FROM notifications WHERE user_id = 's1' AND type = 'event'");
  assert.match(notice.title, /Space 1/);

  // Another approved seller can't take an occupied space.
  const other = await apply("s2");
  await eventStore.reviewApplication(other.id, "admin", { status: "approved", note: "Welcome aboard" });
  await assert.rejects(eventStore.assignSpace(event.id, one.id, { applicationId: other.id }, "admin"), { status: 409 });

  // Placing the same seller elsewhere moves them; one space each.
  await eventStore.assignSpace(event.id, two.id, { applicationId: app.id }, "admin");
  const rows = await query("SELECT stall_number, seller_id, status FROM event_stalls WHERE event_id = $1 ORDER BY stall_number", [event.id]);
  assert.deepEqual(rows, [{ stall_number: 1, seller_id: null, status: "available" }, { stall_number: 2, seller_id: "s1", status: "occupied" }]);

  // A layout save afterwards keeps the placement.
  const latest = await eventStore.listStallsForEvent(event.id);
  await eventStore.saveLayout(event.id, { version: 1, stalls: latest.map(({ sellerName, sellerStallId, sellerStallName, sellerLogo, productsAvailable, ...item }) => ({ ...item, price: Number(item.price) })) }, "admin");
  assert.equal((await query("SELECT seller_id FROM event_stalls WHERE id = $1", [two.id]))[0].seller_id, "s1");

  const cleared = await eventStore.assignSpace(event.id, two.id, { applicationId: null }, "admin");
  assert.equal(cleared.seller_id, null);
  assert.equal(cleared.status, "available");
});
