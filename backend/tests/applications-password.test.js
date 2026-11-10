import { test } from "node:test";
import assert from "node:assert/strict";

test("admins review event applications once; password changes are verified", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { query, closeDb } = await import("../src/db/index.js");
  const { eventStore, authStore, ready } = await import("../src/data/marketStore.js");
  t.after(closeDb);
  await ready();

  await query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ('seller', 'Seller Name', 's@test.invalid', 'x', 'seller', 'approved')");
  await query("INSERT INTO events (id, name, date, location) VALUES ('fair', 'Fair', '2099-10-01', 'Grounds')");
  const payload = { eventId: "fair", stallName: "Snacks", businessName: "Biz", productCategory: "food", productList: "Chips", contactInfo: "0917", preferredStallSize: 9, duration: 2 };
  const application = await eventStore.submitApplication("seller", payload);
  await assert.rejects(eventStore.submitApplication("seller", payload), { status: 409 });

  const approved = await eventStore.reviewApplication(application.id, "admin", { status: "approved", note: "Space 4, set up by 7am." });
  assert.equal(approved.status, "approved");
  assert.equal(approved.review_note, "Space 4, set up by 7am.");
  assert.ok(approved.reviewed_at);
  await assert.rejects(eventStore.reviewApplication(application.id, "admin", { status: "rejected", note: "Changed my mind" }), { status: 409 });
  await assert.rejects(eventStore.reviewApplication("missing", "admin", { status: "approved", note: "Nope nope" }), { status: 404 });
  const [listed] = await eventStore.listApplications({ sellerId: "seller" });
  assert.equal(listed.seller_name, "Seller Name");
  assert.equal(listed.event.name, "Fair");
  // An approved application still blocks a duplicate; a rejected one would not.
  await assert.rejects(eventStore.submitApplication("seller", payload), { status: 409 });

  const user = await authStore.registerUser({ name: "Pat", email: "pat@test.invalid", password: "first-password", campus_id: "ID-1", affiliation: "student", department: "CCIS" });
  await assert.rejects(authStore.changePassword(user.id, "wrong-password", "second-password"), { status: 401 });
  await assert.rejects(authStore.changePassword(user.id, "first-password", "first-password"), { status: 400 });
  const changed = await authStore.changePassword(user.id, "first-password", "second-password");
  assert.ok(changed.password_changed_at);
  assert.equal(changed.password_hash, undefined);
  await assert.rejects(authStore.loginUser("pat@test.invalid", "first-password"), { status: 401 });
  assert.equal((await authStore.loginUser("pat@test.invalid", "second-password")).id, user.id);
});
