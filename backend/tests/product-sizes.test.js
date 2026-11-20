import { test } from "node:test";
import assert from "node:assert/strict";

test("products keep a size type with their sizes, and drop it when the sizes go", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { closeDb, query } = await import("../src/db/index.js");
  const { productStore, ready } = await import("../src/data/marketStore.js");
  const { productSchema, productUpdateSchema } = await import("../src/middleware/validate.js");
  t.after(closeDb);
  await ready();
  await query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ('s1', 'Seller', 's1@csucc.edu.ph', 'x', 'seller', 'approved')");
  await query("INSERT INTO stalls (id, owner_id, name, status, is_active) VALUES ('11111111-1111-4111-8111-111111111111', 's1', 'Bag Shop', 'approved', TRUE)");
  const seller = { id: "s1", role: "seller" };

  const payload = productSchema.parse({
    name: "Canvas tote", price: 250, stock: 0, category: "accessories", stall_id: "11111111-1111-4111-8111-111111111111",
    option_type: "  Bag size ", options: [{ label: "Small", stock: 3 }, { label: "Large", stock: 2 }],
  });
  assert.equal(payload.option_type, "Bag size");
  const created = await productStore.create(payload.stall_id, payload);
  const [listed] = (await productStore.listProducts({ stallId: payload.stall_id })).data;
  assert.equal(created.option_type, "Bag size");
  assert.deepEqual([listed.option_type, listed.options.map((o) => o.label), listed.stock], ["Bag size", ["Small", "Large"], 5]);

  // Renaming the type, then clearing it with an empty box.
  assert.equal((await productStore.update(created.id, productUpdateSchema.parse({ option_type: "Size" }), seller)).option_type, "Size");
  assert.equal((await productStore.update(created.id, productUpdateSchema.parse({ option_type: "" }), seller)).option_type, null);
  // A type without sizes is not kept.
  await productStore.update(created.id, productUpdateSchema.parse({ option_type: "Cup size", options: [] }), seller);
  assert.equal((await productStore.update(created.id, {}, seller)).option_type, null);
  assert.ok(!productSchema.safeParse({ ...payload, option_type: "x".repeat(21) }).success, "Size types stay short");
});
