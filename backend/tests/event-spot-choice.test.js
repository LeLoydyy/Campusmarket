import { test } from "node:test";
import assert from "node:assert/strict";

test("sellers pick their spot on the stall map; approval places them there", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { eventStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query(`INSERT INTO users (id, name, email, password_hash, role, status) VALUES
    ('s1', 'First Seller', 's1@test.invalid', 'x', 'seller', 'approved'),
    ('s2', 'Second Seller', 's2@test.invalid', 'x', 'seller', 'approved'),
    ('s3', 'Third Seller', 's3@test.invalid', 'x', 'seller', 'approved')`);
  const event = await eventStore.saveEvent({ name: "Food Fest", location: "Grounds", date: "2099-12-08" }, "admin");
  const { stalls } = await eventStore.saveLayout(event.id, { version: 0, stalls: [
    { id: "a", stall_number: 1, category: "food", status: "available", size: "3m x 3m", price: 0 },
    { id: "b", stall_number: 2, category: "food", status: "available", size: "3m x 3m", price: 0 },
    { id: "c", stall_number: 3, category: "food", status: "reserved", size: "3m x 3m", price: 0 },
  ] }, "admin");
  const [one, two, reserved] = stalls;
  const apply = (sellerId, preferredSpaceId) => eventStore.submitApplication(sellerId, { eventId: event.id, stallName: `Stall ${sellerId}`,
    businessName: "Biz", productCategory: "food", productList: "rice meals", contactInfo: "09171234567", preferredSpaceId });

  // A mapped event needs a spot; the spot must be on this map and open.
  await assert.rejects(apply("s1"), { status: 400, message: /Pick your spot/ });
  await assert.rejects(apply("s1", "not-a-space"), { status: 404 });
  await assert.rejects(apply("s1", reserved.id), { status: 409, message: /isn't open/ });

  const first = await apply("s1", one.id);
  assert.equal(first.preferred_space_id, one.id);
  assert.equal(first.preferred_stall_size, null, "size is optional now");

  // The map marks the spot as requested, and nobody else can ask for it.
  const map = await eventStore.listStallsForEvent(event.id);
  assert.equal(map.find((space) => space.id === one.id).requested, true);
  assert.equal(map.find((space) => space.id === two.id).requested, false);
  await assert.rejects(apply("s2", one.id), { status: 409, message: /already asked for Space 1/ });

  // Listing shows the chosen space's number for admins and the seller.
  const [listed] = await eventStore.listApplications({ sellerId: "s1" });
  assert.equal(listed.preferred_space_number, 1);

  // Approving places the seller on their spot and tells them.
  await eventStore.reviewApplication(first.id, "admin", { status: "approved", note: "See you there" });
  const [placed] = await query("SELECT seller_id, status FROM event_stalls WHERE id = $1", [one.id]);
  assert.deepEqual(placed, { seller_id: "s1", status: "occupied" });
  const [notice] = await query("SELECT title FROM notifications WHERE user_id = 's1' AND type = 'event'");
  assert.match(notice.title, /Space 1/);

  // A rejected request frees the spot for someone else.
  const second = await apply("s2", two.id);
  await eventStore.reviewApplication(second.id, "admin", { status: "rejected", note: "Category is full" });
  assert.equal((await eventStore.listStallsForEvent(event.id)).find((space) => space.id === two.id).requested, false);
  const third = await apply("s3", two.id);
  assert.equal(third.preferred_space_id, two.id);

  // An admin clearing a placed seller frees the spot on the map too.
  await eventStore.assignSpace(event.id, one.id, { applicationId: null }, "admin");
  assert.equal((await eventStore.listStallsForEvent(event.id)).find((space) => space.id === one.id).requested, false);

  // Events without a map still accept applications without a spot.
  const noMap = await eventStore.saveEvent({ name: "Pop-up", location: "Lobby", date: "2099-12-20" }, "admin");
  const open = await eventStore.submitApplication("s2", { eventId: noMap.id, stallName: "Pop", businessName: "Biz",
    productCategory: "food", productList: "snacks", contactInfo: "0917" });
  assert.equal(open.preferred_space_id, null);

  // Past events drop out of the upcoming list and can't be applied to.
  const past = await eventStore.saveEvent({ name: "Last Year's Fair", location: "Court", date: "2020-05-01" }, "admin");
  const upcomingIds = (await eventStore.listEvents({ upcoming: true })).map((item) => item.id);
  assert.ok(upcomingIds.includes(event.id) && !upcomingIds.includes(past.id));
  assert.ok((await eventStore.listEvents()).some((item) => item.id === past.id), "the full list still has past events");
  await assert.rejects(eventStore.submitApplication("s3", { eventId: past.id, stallName: "Late", businessName: "Biz",
    productCategory: "food", productList: "snacks", contactInfo: "0917" }), { status: 409, message: /already ended/ });
});
