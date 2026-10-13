import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PGLITE_DIR = "memory://";
process.env.SEED_DEMO = "true";
process.env.SEED_PASSWORD = "seed-pass-123";
process.env.NODE_ENV = "test";

const { planStore, productStore, stallStore, ready } = await import("../src/data/marketStore.js");
const { query } = await import("../src/db/index.js");
await ready();

const [stall] = await query("SELECT id, owner_id FROM stalls LIMIT 1");
const [admin] = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
const seller = { id: stall.owner_id, role: "seller" };
const nextYear = `${new Date().getFullYear() + 1}-06-30`;
const planNotes = async () => (await query("SELECT status, body FROM notifications WHERE user_id = $1 AND type = 'plan' ORDER BY created_at", [stall.owner_id]));
const visible = async () => (await query("SELECT name FROM products WHERE stall_id = $1 AND is_active ORDER BY created_at DESC, id", [stall.id])).map((row) => row.name);

// Give the Premium demo stall 8 listings in a known order (Extra 1 oldest … Extra 5 newest).
await query("UPDATE products SET created_at = now() - interval '10 days' WHERE stall_id = $1", [stall.id]);
for (let index = 1; index <= 5; index += 1) {
  await query(`INSERT INTO products (stall_id, name, price, stock, category, created_at)
               VALUES ($1, $2, 20, 5, 'food', now() - make_interval(days => $3))`, [stall.id, `Extra ${index}`, 6 - index]);
}

test("Premium stalls feature up to 3 visible products", async () => {
  const ids = (await query("SELECT id FROM products WHERE stall_id = $1 ORDER BY created_at DESC, id", [stall.id])).map((row) => row.id);
  await query("UPDATE products SET is_featured = FALSE WHERE stall_id = $1", [stall.id]);
  for (const id of ids.slice(0, 3)) await productStore.setFeatured(id, true, seller);
  await assert.rejects(productStore.setFeatured(ids[3], true, seller), /up to 3/);
  await productStore.setFeatured(ids[0], false, seller);
  await productStore.setFeatured(ids[3], true, seller);
  const featured = await productStore.listProducts({ featured: true, limit: 24 });
  assert.equal(featured.total ?? featured.data.length, 3);

  // Hiding a product drops it from the featured picks.
  await productStore.update(ids[3], { is_active: false }, seller);
  assert.equal((await query("SELECT is_featured FROM products WHERE id = $1", [ids[3]]))[0].is_featured, false);
  await productStore.update(ids[3], { is_active: true }, seller);
});

test("Moving to Free hides listings beyond 5 (newest stay), and Premium brings them back", async () => {
  const stallAfter = await stallStore.setPlan(stall.id, { tier: "free", note: "Semester ended" }, admin.id);
  assert.equal(stallAfter.tier, "free");
  assert.deepEqual(await visible(), ["Extra 5", "Extra 4", "Extra 3", "Extra 2", "Extra 1"]);
  assert.equal((await query("SELECT count(*)::int AS n FROM products WHERE stall_id = $1 AND hidden_by_plan", [stall.id]))[0].n, 3);
  assert.equal((await query("SELECT count(*)::int AS n FROM products WHERE stall_id = $1 AND is_featured", [stall.id]))[0].n, 0, "Featured picks are cleared");
  const note = (await planNotes()).at(-1);
  assert.equal(note.status, "plan_downgraded");
  assert.match(note.body, /we hid .* Choose which 5 stay visible/);
  assert.match(note.body, /Semester ended/);

  // Free: a 6th visible product is refused, and featuring is Premium only.
  const [hiddenOne] = await query("SELECT id FROM products WHERE stall_id = $1 AND hidden_by_plan LIMIT 1", [stall.id]);
  await assert.rejects(productStore.update(hiddenOne.id, { is_active: true }, seller), /shows up to 5/);
  await assert.rejects(productStore.setFeatured(hiddenOne.id, true, seller), /included in Premium/);

  // The seller picks which 5 stay visible.
  const picks = (await query("SELECT id, name FROM products WHERE stall_id = $1 ORDER BY created_at, id LIMIT 5", [stall.id]));
  await productStore.chooseVisible(stall.owner_id, picks.map((row) => row.id));
  assert.deepEqual((await visible()).sort(), picks.map((row) => row.name).sort());
  await assert.rejects(productStore.chooseVisible(stall.owner_id, (await query("SELECT id FROM products WHERE stall_id = $1", [stall.id])).map((row) => row.id)), /up to 5/);

  // Premium again (until a date): everything the plan hid is visible again.
  const premium = await stallStore.setPlan(stall.id, { tier: "premium", premium_until: nextYear }, admin.id);
  assert.ok(premium.premium_until.startsWith(nextYear));
  assert.equal((await visible()).length, 8);
  assert.equal((await planNotes()).at(-1).status, "plan_approved");

  // Extending: a new end date, and the seller hears about it.
  const later = `${new Date().getFullYear() + 2}-01-15`;
  const extended = await stallStore.setPlan(stall.id, { tier: "premium", premium_until: later }, admin.id);
  assert.ok(extended.premium_until.startsWith(later));
  assert.equal((await planNotes()).at(-1).status, "plan_extended");
  await assert.rejects(stallStore.setPlan(stall.id, { tier: "premium", premium_until: "2001-01-01" }, admin.id), /future/);
});

test("Expiry follows the same rule as the admin switch", async () => {
  await query("UPDATE stalls SET premium_until = now() - interval '1 minute' WHERE id = $1", [stall.id]);
  assert.equal(await planStore.expireDue(), 1);
  assert.equal((await visible()).length, 5);
  const note = (await planNotes()).at(-1);
  assert.equal(note.status, "plan_expired");
  assert.match(note.body, /we hid Extra|we hid /);
});
