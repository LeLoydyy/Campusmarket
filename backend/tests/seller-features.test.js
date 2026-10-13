import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

test("Sellers: notification settings, cancel reasons, ready times, stock alerts, review replies, sale prices and options", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-seller-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "true", SEED_PASSWORD: "seed-pass-123", JWT_SECRET: "seller-test-only-secret", NODE_ENV: "test", EMAIL_PROVIDER: "console", PRODUCT_PHOTO_DIR: path.join(directory, "photos") }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("campus-seller-"));
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
  const notes = async (token, type) => (await request("/notifications", token)).data.filter((item) => !type || item.type === type);
  const buyerId = (await request("/auth/me", buyer)).data.id;
  const { data: { stall } } = await request("/plans/my", seller);

  // A product with a sale price, extra photos and size options; its stock is the options' total.
  const base = { name: "Org Shirt", price: 450, stock: 0, category: "clothing", stall_id: stall.id };
  assert.equal((await request("/products", seller, { ...base, sale_price: 450 })).status, 400, "Sale price must be lower");
  const created = await request("/products", seller, { ...base, sale_price: 300, images: ["https://example.com/back.jpg"], options: [{ label: "S", stock: 2 }, { label: "M", stock: 5 }] });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const shirt = (await request(`/products/${created.data.id}`)).data;
  assert.equal(shirt.stock, 7);
  assert.deepEqual(shirt.options.map((option) => option.label), ["S", "M"]);
  assert.deepEqual(shirt.images, ["https://example.com/back.jpg"]);
  const medium = shirt.options.find((option) => option.label === "M");

  // The cart needs an option, and checks that option's stock.
  assert.equal((await request("/cart", buyer, { product_id: shirt.id, quantity: 1 })).status, 400);
  assert.equal((await request("/cart", buyer, { product_id: shirt.id, quantity: 6, option_id: medium.id })).status, 409);
  assert.equal((await request("/cart", buyer, { product_id: shirt.id, quantity: 2, option_id: medium.id })).status, 200);
  assert.equal((await request("/cart", buyer)).data.find((item) => item.product_id === shirt.id).option_label, "M");
  await request("/cart/clear", buyer, null, "DELETE");

  // Ordering charges the sale price, names the option, and takes that option's stock (5 → 2 = low).
  const order = (await request("/orders", buyer, { items: [{ product_id: shirt.id, option_id: medium.id, quantity: 3 }], fulfillment: "pickup" })).data.order;
  assert.equal(Number(order.total), 900);
  assert.equal(order.items[0].name, "Org Shirt (M)");
  let after = (await request(`/products/${shirt.id}`)).data;
  assert.equal(after.options.find((option) => option.label === "M").stock, 2);
  assert.equal(after.stock, 4);
  assert.ok((await notes(seller, "stock")).some((item) => item.title === "Org Shirt (M) is running low"));

  // Sellers must give a reason to cancel; the buyer sees it and the option's stock comes back.
  assert.equal((await request(`/orders/${order.id}/status`, seller, { status: "cancelled" }, "PUT")).status, 400);
  assert.equal((await request(`/orders/${order.id}/status`, seller, { status: "cancelled", cancel_reason: "Size M sold out at the fair" }, "PUT")).status, 200);
  assert.ok((await notes(buyer, "order")).some((item) => item.status === "cancelled" && item.body.includes("Size M sold out at the fair")));
  assert.equal((await request(`/products/${shirt.id}`)).data.options.find((option) => option.label === "M").stock, 5);

  // Confirming with a ready time: stored on the order and told to the buyer.
  const second = (await request("/orders", buyer, { items: [{ product_id: shirt.id, option_id: medium.id, quantity: 1 }], fulfillment: "pickup" })).data.order;
  assert.equal((await request(`/orders/${second.id}/status`, seller, { status: "confirmed", ready_in_minutes: 0 }, "PUT")).status, 400);
  const confirmed = await request(`/orders/${second.id}/status`, seller, { status: "confirmed", ready_in_minutes: 15 }, "PUT");
  assert.equal(confirmed.status, 200);
  const minutesLeft = (Date.parse(confirmed.data.ready_by) - Date.now()) / 60000;
  assert.ok(minutesLeft > 13 && minutesLeft <= 15, `ready_by ${confirmed.data.ready_by}`);
  assert.ok((await notes(buyer, "order")).some((item) => item.status === "confirmed" && /ready around/.test(item.body)));

  // Notification settings are saved on the server and respected.
  const prefs = await request("/auth/notification-preferences", seller, { reviewAlerts: false, orderUpdates: false, unknown: true }, "PUT");
  assert.deepEqual(prefs.data.notification_prefs, { reviewAlerts: false, orderUpdates: false });
  const newOrderNotes = (await notes(seller, "order")).length;
  const third = (await request("/orders", buyer, { items: [{ product_id: shirt.id, option_id: medium.id, quantity: 1 }], fulfillment: "pickup" })).data.order;
  assert.equal((await notes(seller, "order")).length, newOrderNotes, "Order updates are off");

  // Review on a received order: no seller alert (turned off); the seller's reply reaches the buyer.
  const code = (await request("/orders/buyer", buyer)).data.find((item) => item.id === third.id).pickup_code;
  for (const status of ["confirmed", "ready"]) await request(`/orders/${third.id}/status`, seller, { status }, "PUT");
  assert.equal((await request(`/orders/${third.id}/status`, seller, { status: "delivered", pickup_code: code }, "PUT")).status, 200);
  const review = (await request("/reviews", buyer, { order_id: third.id, product_id: shirt.id, rating: 4, comment: "Nice print, runs small" })).data;
  assert.equal((await notes(seller, "review")).length, 0);
  assert.equal((await request(`/reviews/${review.id}/reply`, buyer, { reply: "hi" }, "PUT")).status, 403);
  const replied = await request(`/reviews/${review.id}/reply`, seller, { reply: "Thanks! Size up if you're between sizes." }, "PUT");
  assert.equal(replied.data.seller_reply, "Thanks! Size up if you're between sizes.");
  assert.equal((await request(`/products/${shirt.id}`)).data.reviews[0].seller_reply, "Thanks! Size up if you're between sizes.");
  assert.equal((await notes(buyer, "review")).filter((item) => item.status === "review_reply").length, 1);

  // Counter sales use options and the sale price too.
  const sale = await request("/pos/sales", seller, { request_id: randomUUID(), buyer_id: buyerId, items: [{ product_id: shirt.id, option_id: medium.id, quantity: 1 }], cash_received: 500 });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  assert.equal(Number(sale.data.total), 300);
  assert.equal(sale.data.items[0].name, "Org Shirt (M)");

  // Editing options: S is dropped, L added, M kept; stock follows. Removing the sale price.
  const edited = await request(`/products/${shirt.id}`, seller, { options: [{ label: "M", stock: 4 }, { label: "L", stock: 1 }], sale_price: null }, "PUT");
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.deepEqual(edited.data.options.map((option) => [option.label, option.stock]), [["M", 4], ["L", 1]]);
  assert.equal(edited.data.options.find((option) => option.label === "M").id, medium.id, "Kept options keep their ID");
  assert.equal(edited.data.stock, 5);
  assert.equal(edited.data.sale_price, null);
});
