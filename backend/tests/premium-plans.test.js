import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

test("Premium: plan page, one-time nudges, request, review, notifications", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-premium-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "true", SEED_PASSWORD: "seed-pass-123", JWT_SECRET: "premium-test-only-secret", NODE_ENV: "test", EMAIL_PROVIDER: "console", PRODUCT_PHOTO_DIR: path.join(directory, "photos"), PREMIUM_PRICE: "₱150 per semester" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("campus-premium-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Test server did not start: ${diagnostics}`)), 30000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("Server running")) { clearTimeout(timeout); resolve(); } });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(diagnostics)); });
  });
  const request = async (url, token, body, method = body ? "POST" : "GET") => {
    const response = await fetch(`http://127.0.0.1:${port}/api${url}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const signIn = async (email) => {
    const first = await request("/auth/login", null, { email, password: "seed-pass-123" });
    if (first.data.accessToken) return first.data.accessToken;
    return (await request("/auth/login/verify", null, { challenge: first.data.challenge, code: first.data.dev_code })).data.accessToken;
  };
  const admin = await signIn("admin@campusmarket.test");
  const seller = await signIn("seller@campusmarket.test");
  const planNotes = async () => (await request("/notifications", seller)).data.filter((item) => item.type === "plan");

  // The demo stall starts on Premium; put it on Free.
  const { data: { stall } } = await request("/plans/my", seller);
  assert.equal((await request(`/admin/stalls/${stall.id}/plan`, admin, { tier: "free" }, "PUT")).status, 200);
  const free = await request("/plans/my", seller);
  assert.equal(free.data.stall.tier, "free");
  assert.equal(free.data.listings, 3);
  assert.equal(free.data.price, "₱150 per semester");
  assert.equal(free.data.plans.premium.listing_limit, 25);
  assert.equal((await request("/auth/me", seller)).data.stall_plan.tier, "free");

  // Tapping a locked feature: one nudge, never repeated.
  await request("/plans/my?feature=analytics", seller);
  await request("/plans/my?feature=analytics", seller);
  assert.equal((await planNotes()).filter((item) => item.status === "locked_analytics").length, 1);
  assert.equal((await request("/analytics/sales?days=30", seller)).data.code, "PREMIUM_REQUIRED");

  // Listing slots: 4 of 5, then 5 of 5, then the limit.
  const product = (name) => ({ name, price: 50, stock: 3, category: "food", stall_id: stall.id });
  assert.equal((await request("/products", seller, product("Turon"))).status, 201);
  assert.ok((await planNotes()).some((item) => item.status === "listings_almost"));
  assert.equal((await request("/products", seller, product("Banana cue"))).status, 201);
  assert.ok((await planNotes()).some((item) => item.status === "listings_full"));
  assert.equal((await request("/products", seller, product("Kwek-kwek"))).status, 403);
  assert.equal((await planNotes()).length, 3);

  // Request Premium (with a payment reference), once at a time; the admin dashboard counts it.
  const sent = await request("/plans/requests", seller, { note: "For the food fair", payment_reference: "GCash 1029384756" });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.payment_reference, "GCash 1029384756");
  assert.equal((await request("/plans/requests", seller, { note: "again" })).status, 409);
  assert.equal((await request("/admin/stats", admin)).data.pending_plan_requests, 1);
  const queue = await request("/admin/plan-requests", admin);
  assert.equal(queue.data.length, 1);
  assert.equal(queue.data[0].stall_name, "Campus Eats");

  // Cancel and re-send; decline needs a reason; approve with an end date.
  assert.equal((await request("/plans/requests/pending", seller, null, "DELETE")).status, 200);
  const again = await request("/plans/requests", seller, { note: "Ready to pay at the office" });
  assert.equal((await request(`/admin/plan-requests/${again.data.id}`, admin, { decision: "declined" }, "PUT")).status, 400);
  assert.equal((await request(`/admin/plan-requests/${again.data.id}`, admin, { decision: "declined", note: "Please pay the fee first" }, "PUT")).status, 200);
  assert.ok((await planNotes()).some((item) => item.status === "plan_declined" && item.body === "Please pay the fee first"));
  const third = await request("/plans/requests", seller, { note: "Paid", payment_reference: "OR-5521" });
  const nextYear = `${new Date().getFullYear() + 1}-03-31`;
  assert.equal((await request(`/admin/plan-requests/${third.data.id}`, admin, { decision: "approved", premium_until: "2001-01-01" }, "PUT")).status, 400);
  const approved = await request(`/admin/plan-requests/${third.data.id}`, admin, { decision: "approved", premium_until: nextYear }, "PUT");
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  const premium = await request("/plans/my", seller);
  assert.equal(premium.data.stall.tier, "premium");
  assert.ok(premium.data.stall.premium_until.startsWith(nextYear));
  assert.equal(premium.data.pending, null);
  assert.ok((await planNotes()).some((item) => item.status === "plan_approved" && item.title.includes("Premium")));
  assert.equal((await request("/analytics/sales?days=30", seller)).status, 200, "Premium unlocks analytics");
  assert.equal((await request("/plans/requests", seller, { note: "more" })).status, 409, "Already Premium");

  // Premium stalls get no more upgrade nudges.
  await request("/plans/my?feature=pos", seller);
  assert.ok(!(await planNotes()).some((item) => item.status === "locked_pos"));

  // The admin activity log records the decisions.
  const activity = (await request("/admin/activity", admin)).data.data.map((row) => row.action);
  assert.ok(["plan.requested", "plan.declined", "plan.approved"].every((action) => activity.includes(action)));
});

test("Premium with an end date drops back to Free and tells the seller", async () => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "true";
  process.env.SEED_PASSWORD = "seed-pass-123";
  process.env.NODE_ENV = "test";
  const { planStore, ready } = await import("../src/data/marketStore.js");
  const { query } = await import("../src/db/index.js");
  await ready();
  const [stall] = await query("SELECT id, owner_id FROM stalls LIMIT 1");
  await query("UPDATE stalls SET tier = 'premium', premium_until = now() - interval '1 minute' WHERE id = $1", [stall.id]);
  assert.equal(await planStore.expireDue(), 1);
  assert.equal(await planStore.expireDue(), 0, "Only once");
  const [after] = await query("SELECT tier, premium_until FROM stalls WHERE id = $1", [stall.id]);
  assert.deepEqual(after, { tier: "free", premium_until: null });
  const notes = await query("SELECT status FROM notifications WHERE user_id = $1 AND type = 'plan'", [stall.owner_id]);
  assert.deepEqual(notes.map((row) => row.status), ["plan_expired"]);
});
