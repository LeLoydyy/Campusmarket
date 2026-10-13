import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

test("CSUCC registration, store plans, ownership, public visibility, messaging and POS", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-requirements-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "false", BOOTSTRAP_ADMIN_EMAIL: "admin@test.invalid", BOOTSTRAP_ADMIN_PASSWORD: "testpassword", PRODUCT_PHOTO_DIR: path.join(directory, "photos"), JWT_SECRET: "requirements-test-only-secret", NODE_ENV: "test", EMAIL_PROVIDER: "console", ALLOWED_EMAIL_DOMAIN: "test.invalid" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    // Only remove the exact test directory returned by mkdtemp.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("campus-requirements-"));
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
  // Sign-up confirms the email with a code first; sign-in asks for a code after the password.
  // With EMAIL_PROVIDER=console outside production the API echoes the code as dev_code.
  const signUp = async (body) => {
    const sent = await request("/auth/email/send-code", null, { email: body.email });
    if (sent.status !== 200) return sent;
    const { data } = await request("/auth/email/verify", null, { email: body.email, code: sent.data.dev_code });
    return request("/auth/register", null, { ...body, email_token: data.email_token, security_questions: [{ question: "What was the name of your first pet?", answer: "Bantay" }, { question: "What was your childhood nickname?", answer: "Jun" }, { question: "What is the name of your favorite teacher?", answer: "Mrs. Reyes" }] });
  };
  const signIn = async (email, password) => {
    const first = await request("/auth/login", null, { email, password });
    if (first.data?.accessToken) return first; // admins skip the code outside production
    return first.status === 200 ? request("/auth/login/verify", null, { challenge: first.data.challenge, code: first.data.dev_code }) : first;
  };
  const admin = (await signIn("admin@test.invalid", "testpassword")).data.accessToken;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
  const uploadPhoto = async (token, bytes = png, type = "image/png") => {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type }), "product.png");
    const response = await fetch(`http://127.0.0.1:${port}/api/products/image`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    return { status: response.status, data: await response.json() };
  };
  const register = async (role, suffix) => signUp({
    name: `Test ${suffix}`, email: `${suffix}@test.invalid`, password: "testpassword1", role,
    campus_id: `CSUCC-${suffix}`, affiliation: "student", department: "College of Computing",
    ...(role === "seller" ? { store_name: `${suffix} Store`, campus_location: "Main Canteen" } : {}),
  });
  const review = async (id) => request(`/admin/users/${id}/review`, admin, { status: "approved", note: "Checked against campus test roster.", credentials_checked: true }, "PUT");
  const buyer = await register("buyer", "buyer");
  const seller = await register("seller", "seller");
  assert.equal(buyer.status, 201); assert.equal(seller.status, 201);
  assert.equal(buyer.data.user.status, "pending"); assert.equal(seller.data.user.status, "pending");
  assert.equal(buyer.data.user.password_hash, undefined);
  const bt = buyer.data.accessToken, st = seller.data.accessToken;
  assert.equal((await request("/auth/me", bt)).status, 200);
  assert.equal((await request("/cart", bt)).status, 403);
  assert.equal((await request("/stalls/my", st)).status, 403);
  assert.equal((await request("/auth/me", buyer.data.refreshToken)).status, 401);
  assert.equal((await request("/auth/register", null, { name: "No ID", email: "missing@test.invalid", password: "testpassword" })).status, 400);
  assert.equal((await register("buyer", "buyer")).status, 409);
  assert.equal((await request(`/admin/users/${buyer.data.user.id}/review`, admin, { status: "approved", note: "Not checked" }, "PUT")).status, 400);
  assert.equal((await review(buyer.data.user.id)).status, 200);
  assert.equal((await review(seller.data.user.id)).status, 200);
  assert.equal((await request("/cart", bt)).status, 200, "Existing access tokens use current approval status");
  const stall = (await request("/stalls/my", st)).data;
  assert.equal(stall.location, "Main Canteen");
  assert.equal((await request("/stalls")).data.length, 0);
  const productPayload = { name: "Rice Meal", price: 89.25, stock: 10, category: "food", stall_id: stall.id, image_url: "/images/buyer/product-adobo.png" };
  assert.equal((await request("/products", st, productPayload)).status, 403);
  assert.equal((await request(`/stalls/${stall.id}/status`, admin, { status: "approved" }, "PUT")).status, 200);
  assert.equal((await uploadPhoto()).status, 401);
  assert.equal((await uploadPhoto(bt)).status, 403);
  assert.equal((await uploadPhoto(st, Buffer.from("not a photo"))).status, 400);
  assert.equal((await uploadPhoto(st, Buffer.from("<svg></svg>"), "image/svg+xml")).status, 400);
  assert.equal((await uploadPhoto(st, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 400);
  const uploadedPhoto = await uploadPhoto(st);
  assert.equal(uploadedPhoto.status, 201);
  assert.match(uploadedPhoto.data.image_url, /^\/api\/product-images\/[a-f0-9-]+\.png$/);
  const servedPhoto = await fetch(`http://127.0.0.1:${port}${uploadedPhoto.data.image_url}`);
  assert.equal(servedPhoto.status, 200);
  assert.match(servedPhoto.headers.get("content-type"), /image\/png/);
  assert.deepEqual(Buffer.from(await servedPhoto.arrayBuffer()), png);
  assert.equal(fs.readdirSync(path.join(directory, "photos")).length, 1);
  productPayload.image_url = uploadedPhoto.data.image_url;
  const created = await request("/products", st, productPayload);
  assert.equal(created.status, 201);
  const product = created.data;
  assert.equal((await request("/stalls")).data.length, 1);
  assert.equal((await request("/products?max_price=80")).data.total, 0);
  assert.equal((await request("/products?q=seller%20Store")).data.total, 1);
  assert.equal((await request("/analytics/sales", st)).status, 403);
  assert.equal((await request(`/stalls/${stall.id}`, st, { tier: "premium", status: "approved", owner_id: buyer.data.user.id }, "PUT")).data.tier, "free");
  for (let i = 1; i < 5; i++) assert.equal((await request("/products", st, { ...productPayload, name: `Product ${i}` })).status, 201);
  assert.equal((await request("/products", st, productPayload)).status, 403);
  assert.equal((await request(`/admin/stalls/${stall.id}/plan`, admin, { tier: "premium" }, "PUT")).status, 200);
  for (let i = 5; i < 25; i++) assert.equal((await request("/products", st, { ...productPayload, name: `Product ${i}` })).status, 201);
  assert.equal((await request("/products", st, productPayload)).status, 403);
  // Only products the stall picks are featured (moving to Free is covered in premium-downgrade.test.js).
  assert.equal((await request("/products?featured=true")).data.total, 0);
  assert.equal((await request(`/products/${product.id}/featured`, st, { featured: true }, "PUT")).status, 200);
  assert.equal((await request("/products?featured=true")).data.total, 1);
  const other = await register("seller", "other"); await review(other.data.user.id);
  const ot = other.data.accessToken;
  assert.equal((await request(`/products/${product.id}`, ot, { price: 1 }, "PUT")).status, 403);
  assert.equal((await request(`/products/${product.id}`, ot, undefined, "DELETE")).status, 403);
  assert.equal((await request(`/products/${product.id}`, st, { price: -1 }, "PUT")).status, 400);
  const saleBody = { request_id: randomUUID(), buyer_id: buyer.data.user.id, items: [{ product_id: product.id, quantity: 2 }], cash_received: 200 };
  assert.equal((await request("/pos/sales", bt, saleBody)).status, 403);
  assert.equal((await request("/pos/sales", st, { ...saleBody, items: [...saleBody.items, ...saleBody.items] })).status, 400);
  assert.equal((await request("/pos/sales", st, { ...saleBody, cash_received: 10 })).status, 400);
  assert.equal((await request("/pos/sales", st, { ...saleBody, items: [{ product_id: product.id, quantity: 11 }] })).status, 409);
  assert.equal((await request(`/products/${product.id}`)).data.stock, 10);
  const sale = await request("/pos/sales", st, saleBody);
  assert.equal(sale.status, 201); assert.equal(sale.data.total, 178.5); assert.equal(sale.data.change, 21.5);
  assert.equal((await request("/pos/sales", st, saleBody)).data.id, sale.data.id);
  assert.equal((await request(`/products/${product.id}`)).data.stock, 8);
  assert.equal((await request("/pos/sales", ot)).data.length, 0);
  // The point of sale is Premium-only; Free sellers can still read past receipts.
  assert.equal((await request("/pos/sales", ot, { ...saleBody, request_id: randomUUID() })).data.code, "PREMIUM_REQUIRED");
  assert.equal((await request("/pos/customers?q=CSUCC-buyer", ot)).status, 403);
  assert.equal((await request("/analytics/sales", st)).data.total_revenue, 178.5);
  const onlineOrder = await request("/orders", bt, { items: [{ product_id: product.id, quantity: 1 }], notes: "No onions, please.\nMeet at the library.", fulfillment: "delivery", delivery_address: "Library lobby" });
  assert.equal(onlineOrder.status, 201);
  assert.equal(onlineOrder.data.order.delivery_notes, "No onions, please.\nMeet at the library.");
  assert.equal(onlineOrder.data.order.fulfillment, "delivery");
  assert.equal(onlineOrder.data.order.items[0].name, "Rice Meal");
  await request(`/products/${product.id}`, st, { name: "Renamed Rice Meal" }, "PUT");
  const buyerHistory = await request("/orders/buyer", bt);
  assert.equal(buyerHistory.status, 200);
  assert.equal(buyerHistory.data.find((order) => order.id === onlineOrder.data.order.id).stall.name, "seller Store");
  assert.equal(buyerHistory.data.find((order) => order.id === onlineOrder.data.order.id).stall.location, "Main Canteen");
  const savedItem = buyerHistory.data.find((order) => order.id === onlineOrder.data.order.id).items[0];
  assert.equal(savedItem.product.name, "Rice Meal", "Order history keeps the name at purchase time");
  assert.equal(savedItem.product.image_url, productPayload.image_url);
  assert.equal(savedItem.unit_price, 89.25);
  const sellerHistory = await request("/orders/seller", st);
  assert.equal(sellerHistory.data.find((order) => order.id === onlineOrder.data.order.id).delivery_notes, "No onions, please.\nMeet at the library.");
  assert.equal(buyerHistory.data.find((order) => order.id === onlineOrder.data.order.id).can_cancel, true);
  assert.equal(sellerHistory.data.find((order) => order.id === onlineOrder.data.order.id).items[0].product.name, "Rice Meal");
  assert.equal((await request("/analytics/sales", st)).data.total_revenue, 178.5, "Pending orders are not revenue");
  assert.equal((await request(`/orders/${onlineOrder.data.order.id}/status`, bt, { status: "delivered" }, "PUT")).status, 403);
  for (const status of ["confirmed", "ready", "delivered"]) {
    assert.equal((await request(`/orders/${onlineOrder.data.order.id}/status`, st, { status }, "PUT")).status, 200);
  }
  const salesSummary = (await request("/analytics/sales", st)).data;
  assert.equal(salesSummary.total_revenue, 267.75);
  assert.equal(salesSummary.online_orders, 1);
  assert.equal(salesSummary.pos_sales, 1);
  assert.deepEqual(salesSummary.previous, { revenue: 0, orders: 0, avg_order_value: 0 });
  assert.equal(salesSummary.timeline.reduce((sum, day) => sum + day.orders, 0), 2);
  assert.equal((await request("/pos/customers?q=CSUCC-buyer", st)).data[0].campus_id, undefined);
  assert.equal((await request("/messages", bt, { receiver_id: seller.data.user.id, content: "Is rice available?" })).status, 201);
  const messages = await request("/messages", st);
  assert.ok(!JSON.stringify(messages.data).includes("password_hash"));
  assert.ok(!JSON.stringify(messages.data).includes("CSUCC-buyer"));
  await request(`/products/${product.id}`, st, { is_active: false }, "PUT");
  assert.equal((await request(`/products/${product.id}`)).status, 404);
  assert.equal((await request("/products?mine=true&limit=100", st)).data.total, 25);
  const pending = await register("buyer", "rejected");
  await request(`/admin/users/${pending.data.user.id}/review`, admin, { status: "rejected", note: "Please correct the campus ID." }, "PUT");
  assert.equal((await request("/auth/credentials", pending.data.accessToken, { campus_id: "CORRECTED-ID", affiliation: "faculty", department: "Engineering" }, "PUT")).data.status, "pending");
  await request(`/admin/users/${buyer.data.user.id}/ban`, admin, { ban: true }, "PUT");
  assert.equal((await request("/cart", bt)).status, 403);
  assert.equal((await request("/auth/refresh", null, { refreshToken: buyer.data.refreshToken })).status, 403);
  await request(`/stalls/${stall.id}/status`, admin, { status: "suspended" }, "PUT");
  assert.equal((await request("/stalls")).data.length, 0);
  assert.equal((await request("/products")).data.total, 0);
  assert.equal((await request(`/stalls/${stall.id}`)).status, 404);
  const futureSeller = await register("buyer", "futureSeller"); await review(futureSeller.data.user.id);
  const opened = await request("/auth/start-selling", futureSeller.data.accessToken, { name: "Faculty Crafts", location: "Engineering Lobby", category: "merchandise" });
  assert.equal(opened.status, 201); assert.equal(opened.data.stall.status, "pending");
  assert.equal(opened.data.user.role, "seller");
  assert.equal((await request("/stalls/my", futureSeller.data.accessToken)).status, 200, "Role changes use current stored role");
  assert.equal((await request("/auth/start-selling", futureSeller.data.accessToken, { name: "Duplicate", location: "Lobby" })).status, 409);
  const renamed = await request("/auth/profile", futureSeller.data.accessToken, { name: "Corrected Full Name" }, "PUT");
  assert.equal(renamed.data.status, "pending");
  assert.equal((await request("/stalls/my", futureSeller.data.accessToken)).status, 403);
});
