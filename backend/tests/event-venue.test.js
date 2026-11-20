import { test } from "node:test";
import assert from "node:assert/strict";

test("spaces and landmarks are pinned on the real map; the event pin is their middle", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { closeDb } = await import("../src/db/index.js");
  const { eventStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  const event = await eventStore.saveEvent({ name: "Fair", location: "Gymnasium", date: "2026-12-01" }, "admin");
  assert.equal(event.latitude, null, "New events have no pin");
  const space = (n, pin = {}) => ({ id: `new-${n}`, stall_number: n, category: "food", status: "available", size: "3m x 3m", price: 100, ...pin });

  const saved = await eventStore.saveLayout(event.id, {
    version: 0,
    stalls: [space(1, { latitude: 9.12345678, longitude: 125.5 }), space(2, { latitude: 9.1236, longitude: 125.5002 }), space(3)],
    landmarks: [{ id: "gate", type: "entrance", label: "Gate 1", latitude: 9.1238, longitude: 125.5004 }],
  }, "admin");
  assert.deepEqual([saved.stalls[0].latitude, saved.stalls[0].longitude], [9.123457, 125.5], "Pins are rounded to 6 decimals");
  assert.equal(saved.stalls[2].latitude, null, "Spaces can wait to be pinned");
  assert.deepEqual([saved.event.landmarks[0].latitude, saved.event.landmarks[0].x], [9.1238, null], "A pinned landmark needs no grid box");
  assert.deepEqual([saved.event.latitude, saved.event.longitude], [9.123619, 125.5002], "The event pin is the middle of all pins");

  const [listed] = await eventStore.listStallsForEvent(event.id);
  assert.equal(listed.latitude, 9.123457, "Buyers' stall list includes the pins");

  const base = { version: 1, stalls: saved.stalls };
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, stalls: [{ ...saved.stalls[0], latitude: 91 }, ...saved.stalls.slice(1)] }, "admin"), /Space 1 has an invalid map pin/);
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, stalls: [{ ...saved.stalls[0], longitude: null }, ...saved.stalls.slice(1)] }, "admin"), /invalid map pin/);
  await assert.rejects(eventStore.saveLayout(event.id, { ...base, landmarks: [{ type: "stage", label: "Stage" }] }, "admin"), /Place landmark "Stage" on the map/);

  // Saving with nothing pinned keeps the event's last known spot.
  const unpinned = await eventStore.saveLayout(event.id, { version: 1, stalls: saved.stalls.map((item) => ({ ...item, latitude: null, longitude: null })), landmarks: [] }, "admin");
  assert.equal(unpinned.event.latitude, 9.123619);
});
