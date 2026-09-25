import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");

test("sellers upload, replace and remove their stall logo and cover photo", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-branding-"));
  const photos = path.join(directory, "photos");
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "false",
      BOOTSTRAP_ADMIN_EMAIL: "admin@test.invalid", BOOTSTRAP_ADMIN_PASSWORD: "testpassword",
      PRODUCT_PHOTO_DIR: photos, PHOTO_STORAGE: "", JWT_SECRET: "branding-test-secret", NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    assert.ok(path.basename(directory).startsWith("campus-branding-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Test server did not start: ${diagnostics}`)), 30000);
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("Server running")) { clearTimeout(timeout); resolve(); } });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(diagnostics)); });
  });

  const base = `http://127.0.0.1:${port}/api`;
  const request = async (url, token, body, method = body ? "POST" : "GET") => {
    const response = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const upload = async (kind, token, bytes = png, type = "image/png") => {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type }), "image.png");
    const response = await fetch(`${base}/stalls/my/branding/${kind}`, { method: "PUT", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
    return { status: response.status, data: await response.json() };
  };
  const remove = async (kind, token) => {
    const response = await fetch(`${base}/stalls/my/branding/${kind}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, data: await response.json() };
  };
  const register = (role, suffix) => request("/auth/register", null, {
    name: `Test ${suffix}`, email: `${suffix}@test.invalid`, password: "testpassword", role,
    campus_id: `CSUCC-${suffix}`, affiliation: "student", department: "College of Computing",
    ...(role === "seller" ? { store_name: `${suffix} Store`, campus_location: "Main Canteen" } : {}),
  });
  const admin = (await request("/auth/login", null, { email: "admin@test.invalid", password: "testpassword" })).data.accessToken;
  const approve = (id) => request(`/admin/users/${id}/review`, admin, { status: "approved", note: "Checked against campus test roster.", credentials_checked: true }, "PUT");
  const seller = await register("seller", "seller");
  const buyer = await register("buyer", "buyer");
  await approve(seller.data.user.id);
  await approve(buyer.data.user.id);
  const st = seller.data.accessToken;
  const files = () => (fs.existsSync(photos) ? fs.readdirSync(photos).sort() : []);

  // Only signed-in sellers, only known image kinds, only real images.
  assert.equal((await upload("logo")).status, 401);
  assert.equal((await upload("logo", buyer.data.accessToken)).status, 403);
  assert.equal((await upload("avatar", st)).status, 404);
  assert.equal((await upload("logo", st, Buffer.from("<svg></svg>"), "image/svg+xml")).status, 400);
  assert.equal((await upload("cover", st, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 400);
  assert.deepEqual(files(), [], "Rejected uploads store nothing");

  // A pending stall can already be branded before approval.
  const logo = await upload("logo", st);
  assert.equal(logo.status, 200);
  assert.equal(logo.data.status, "pending");
  assert.match(logo.data.logo_url, /^\/api\/product-images\/[a-f0-9-]+\.png$/);
  const served = await fetch(`http://127.0.0.1:${port}${logo.data.logo_url}`);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);

  const cover = await upload("cover", st);
  assert.equal(cover.status, 200);
  assert.match(cover.data.banner_url, /^\/api\/product-images\/[a-f0-9-]+\.png$/);
  assert.equal(cover.data.logo_url, logo.data.logo_url, "Uploading a cover keeps the logo");
  assert.equal(files().length, 2);

  // Replacing deletes the old file; removing clears the field and the file.
  const newLogo = await upload("logo", st);
  assert.notEqual(newLogo.data.logo_url, logo.data.logo_url);
  assert.equal(files().length, 2);
  assert.ok(!files().includes(path.basename(logo.data.logo_url)));
  const removed = await remove("cover", st);
  assert.equal(removed.status, 200);
  assert.equal(removed.data.banner_url, "");
  assert.deepEqual(files(), [path.basename(newLogo.data.logo_url)]);
  assert.equal((await request("/stalls/my", st)).data.logo_url, newLogo.data.logo_url);

  // Buyers see the branding once the stall is approved.
  const stallId = logo.data.id;
  await request(`/stalls/${stallId}/status`, admin, { status: "approved" }, "PUT");
  assert.equal((await request(`/stalls/${stallId}`)).data.logo_url, newLogo.data.logo_url);
  // Editing other profile details keeps the uploaded logo.
  assert.equal((await request(`/stalls/${stallId}`, st, { description: "Fresh snacks" }, "PUT")).data.logo_url, newLogo.data.logo_url);
});
