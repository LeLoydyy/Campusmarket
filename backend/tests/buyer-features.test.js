import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

test("Buyers: profile and delivery location, pickup codes, reviews and saved products", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-buyer-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "true", SEED_PASSWORD: "seed-pass-123", JWT_SECRET: "buyer-test-only-secret", NODE_ENV: "test", EMAIL_PROVIDER: "console", PRODUCT_PHOTO_DIR: path.join(directory, "photos") }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("campus-buyer-"));
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
  const buyer = await signIn("buyer@campusmarket.test");
  const seller = await signIn("seller@campusmarket.test");
  const [product, other] = (await request("/products?limit=10")).data.data;
  const order = (body) => request("/orders", buyer, { items: [{ product_id: product.id, quantity: 1 }], ...body });

  // Profile: phone and delivery location; delivery needs a location.
  assert.equal((await order({ fulfillment: "delivery" })).status, 400);
  assert.equal((await request("/auth/profile", buyer, { phone: "abc" }, "PUT")).status, 400);
  const profile = await request("/auth/profile", buyer, { phone: "0917 123 4567", address: "Library, 2nd floor" }, "PUT");
  assert.equal(profile.status, 200, JSON.stringify(profile.data));
  assert.equal((await request("/auth/me", buyer)).data.address, "Library, 2nd floor");
  const delivery = await order({ fulfillment: "delivery" });
  assert.equal(delivery.status, 201);
  assert.equal(delivery.data.order.delivery_address, "Library, 2nd floor");
  assert.equal(delivery.data.order.buyer_phone, "0917 123 4567");
  const elsewhere = await order({ fulfillment: "delivery", delivery_address: "Gym entrance" });
  assert.equal(elsewhere.data.order.delivery_address, "Gym entrance", "Checkout can deliver somewhere else");

  // Pickup code: the buyer sees it, the seller doesn't, and handing over needs it.
  const pickup = (await order({ fulfillment: "pickup" })).data.order;
  const mine = (await request("/orders/buyer", buyer)).data.find((item) => item.id === pickup.id);
  assert.match(mine.pickup_code, /^\d{4}$/);
  const sellerView = (await request("/orders/seller", seller)).data.find((item) => item.id === pickup.id);
  assert.equal(sellerView.pickup_code, undefined);
  assert.equal(sellerView.has_pickup_code, true);
  const review = { order_id: pickup.id, product_id: product.id, rating: 4, comment: "Tasty and quick" };
  assert.equal((await request("/reviews", buyer, review)).status, 409, "Not received yet");
  for (const status of ["confirmed", "ready"]) assert.equal((await request(`/orders/${pickup.id}/status`, seller, { status }, "PUT")).status, 200);
  assert.equal((await request(`/orders/${pickup.id}/status`, seller, { status: "delivered" }, "PUT")).status, 400);
  const wrong = mine.pickup_code === "1111" ? "2222" : "1111";
  assert.match((await request(`/orders/${pickup.id}/status`, seller, { status: "delivered", pickup_code: wrong }, "PUT")).data.error, /doesn't match/);
  const handed = await request(`/orders/${pickup.id}/status`, seller, { status: "delivered", pickup_code: mine.pickup_code }, "PUT");
  assert.equal(handed.status, 200);
  assert.equal(handed.data.pickup_code, undefined);

  // Reviews: once per product per order, editable; the seller is told once.
  assert.equal((await request("/reviews", seller, review)).status, 403);
  assert.equal((await request("/reviews", buyer, { ...review, product_id: other.id })).status, 404);
  assert.equal((await request("/reviews", buyer, review)).status, 201);
  const edited = await request("/reviews", buyer, { ...review, rating: 5, comment: "Even better the second time" });
  assert.equal(edited.data.rating, 5);
  const detail = (await request(`/products/${product.id}`)).data;
  assert.equal(detail.review_count, 1);
  assert.equal(detail.avg_rating, 5);
  assert.equal(detail.reviews[0].comment, "Even better the second time");
  assert.equal(detail.reviews[0].users.name.length > 0, true);
  const sellerReviews = (await request("/reviews/mine", seller)).data;
  assert.equal(sellerReviews.length, 1);
  assert.equal(sellerReviews[0].product.id, product.id);
  const reviewNotes = (await request("/notifications", seller)).data.filter((item) => item.type === "review");
  assert.equal(reviewNotes.length, 1);
  const rated = (await request("/orders/buyer", buyer)).data.find((item) => item.id === pickup.id);
  assert.equal(rated.items[0].review.rating, 5);

  // Saved products live on the server; unknown IDs from an old browser list are skipped.
  assert.deepEqual((await request("/favorites", buyer, { product_ids: [product.id, "not-a-product"] })).data, [product.id]);
  assert.equal((await request("/favorites", buyer)).data[0].id, product.id);
  assert.deepEqual((await request(`/favorites/${product.id}`, buyer, null, "DELETE")).data, []);
  assert.equal((await request("/favorites")).status, 401);
});
