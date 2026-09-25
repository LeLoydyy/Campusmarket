import { test } from "node:test";
import assert from "node:assert/strict";

test("stall maps store positions and landmarks, and reject overlaps or off-grid shapes", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { eventStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ('seller', 'Liza', 'l@test.invalid', 'x', 'seller', 'approved')");
  await query("INSERT INTO stalls (id, owner_id, name, logo_url, status, is_active) VALUES ('crafty', 'seller', 'Crafty Hands', '/logo.png', 'approved', TRUE)");
  const event = await eventStore.saveEvent({ name: "Fair", location: "Grounds", date: "2026-10-01" }, "admin");
  const space = (n, geometry = {}) => ({ id: `new-${n}`, stall_number: n, category: "food", status: "available", size: "3m x 3m", price: 100, ...geometry });
  const stage = { type: "stage", label: "Main stage", x: 8, y: 0, w: 8, h: 3 };

  const saved = await eventStore.saveLayout(event.id, {
    version: 0,
    stalls: [space(1, { x: 0, y: 4, w: 3, h: 2 }), space(2)],
    landmarks: [stage, { type: "entrance", label: "Gate 1", x: 11, y: 15, w: 2, h: 1 }],
  }, "admin");
  assert.deepEqual([saved.stalls[0].x, saved.stalls[0].y, saved.stalls[0].w, saved.stalls[0].h], [0, 4, 3, 2]);
  assert.equal(saved.stalls[1].x, null, "Spaces without geometry stay auto-placed");
  assert.deepEqual(saved.event.landmarks.map((l) => l.label), ["Main stage", "Gate 1"]);

  const base = { version: 1, stalls: saved.stalls };
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, stalls: [saved.stalls[0], { ...saved.stalls[1], x: 1, y: 5, w: 2, h: 2 }] }, "admin"), /Space 2 overlaps Space 1|Space 1 overlaps Space 2/);
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, stalls: [{ ...saved.stalls[0], x: 23, w: 3 }, saved.stalls[1]] }, "admin"), /inside the 24×16 map grid/);
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, landmarks: [{ ...stage, type: "rollercoaster" }] }, "admin"), /type and a short label/);
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, landmarks: [{ ...stage, x: 0, y: 4 }] }, "admin"), /overlaps/);

  // Omitting landmarks keeps the saved ones.
  const again = await eventStore.saveLayout(event.id, { version: 1, stalls: saved.stalls }, "admin");
  assert.equal(again.event.landmarks.length, 2);

  // Buyers' stall list links assigned spaces to the seller's stall.
  await query("UPDATE event_stalls SET seller_id = 'seller', status = 'occupied' WHERE event_id = $1 AND stall_number = 1", [event.id]);
  const [assigned] = await eventStore.listStallsForEvent(event.id);
  assert.deepEqual([assigned.sellerStallId, assigned.sellerStallName, assigned.sellerLogo, assigned.sellerName], ["crafty", "Crafty Hands", "/logo.png", "Liza"]);
});
