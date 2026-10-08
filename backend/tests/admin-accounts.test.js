import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { generateStarterPassword, isOnShift } from "../src/config/admins.js";

test("starter passwords look like @kamot482- and shifts wrap past midnight", () => {
  for (let i = 0; i < 50; i++) assert.match(generateStarterPassword(), /^[@#$!?][a-z]{5}\d{3}-$/);
  // 00:00 UTC = 08:00 in Manila; 12:00 UTC = 20:00 in Manila.
  const morning = { role: "admin", shift_start: 480, shift_end: 1020 };
  const evening = { role: "admin", shift_start: 1020, shift_end: 1440 };
  const night = { role: "admin", shift_start: 22 * 60, shift_end: 6 * 60 };
  assert.equal(isOnShift(morning, new Date("2026-10-01T00:00:00Z")), true);
  assert.equal(isOnShift(morning, new Date("2026-10-01T12:00:00Z")), false);
  assert.equal(isOnShift(evening, new Date("2026-10-01T12:00:00Z")), true);
  assert.equal(isOnShift(evening, new Date("2026-10-01T16:00:00Z")), false, "Midnight ends the evening shift");
  assert.equal(isOnShift(night, new Date("2026-10-01T16:00:00Z")), true, "00:00 is inside 22:00–06:00");
  assert.equal(isOnShift({ role: "buyer", shift_start: 480, shift_end: 1020 }, new Date("2026-10-01T12:00:00Z")), true);
});

test("admins: create with starter password, first-login setup, privileges, block, remove, logs, forgot password", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-admins-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "false", BOOTSTRAP_ADMIN_EMAIL: "root@test.invalid", BOOTSTRAP_ADMIN_PASSWORD: "testpassword1", JWT_SECRET: "admin-test-only-secret", NODE_ENV: "test", EMAIL_PROVIDER: "console", ALLOWED_EMAIL_DOMAIN: "test.invalid" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("campus-admins-"));
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
  const questions = [
    { question: "What was the name of your first pet?", answer: "Bantay" },
    { question: "What was your childhood nickname?", answer: "Jun" },
    { question: "What is the name of your favorite teacher?", answer: "Mrs. Reyes" },
  ];

  // Admins sign in without a code outside production.
  const rootLogin = await request("/auth/login", null, { email: "root@test.invalid", password: "testpassword1" });
  assert.equal(rootLogin.status, 200);
  const root = rootLogin.data.accessToken;
  assert.equal(rootLogin.data.user.shift.label, "Any time");

  // Create an admin: unique username, starter password, campus email, shift and privileges.
  const created = await request("/admin/admins", root, {
    username: "Evening.Admin", email: "evening@test.invalid", employee_id: "EMP-0002", shift_start: 0, shift_end: 1440, permissions: ["approve", "logs"],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.match(created.data.password, /^[@#$!?][a-z]{5}\d{3}-$/);
  assert.equal(created.data.user.username, "evening.admin");
  assert.equal(created.data.user.must_setup, true);
  assert.equal(created.data.emailed, true);
  assert.equal((await request("/admin/admins", root, { username: "evening.admin", email: "other@test.invalid" })).status, 409, "Usernames are unique");
  assert.equal((await request("/admin/admins", root, { username: "x2", email: "x2@gmail.com" })).status, 400, "Campus email only");

  // First sign-in by username; everything but setup is locked until it's done.
  const first = await request("/auth/login", null, { email: "EVENING.ADMIN", password: created.data.password });
  assert.equal(first.status, 200);
  assert.equal(first.data.user.must_setup, true);
  assert.equal((await request("/admin/users", first.data.accessToken)).data.code, "SETUP_REQUIRED");
  // Tokens carry whole seconds; let a second pass so the password change clearly postdates them.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1100));
  await tick();
  const setupBody = { name: "Ana Reyes", employee_id: "EMP-0002", new_password: "night-shift-9", security_questions: questions };
  assert.equal((await request("/auth/setup", first.data.accessToken, { ...setupBody, new_password: created.data.password }, "PUT")).status, 400, "Must pick a new password");
  assert.equal((await request("/auth/setup", first.data.accessToken, { ...setupBody, security_questions: questions.slice(0, 2) }, "PUT")).status, 400);
  const setup = await request("/auth/setup", first.data.accessToken, setupBody, "PUT");
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  assert.equal(setup.data.user.must_setup, false);
  assert.equal(setup.data.user.has_recovery_questions, true);
  const evening = setup.data.accessToken;
  assert.equal((await request("/auth/me", first.data.accessToken)).status, 401, "Pre-setup tokens stop working");

  // Privileges: approve + logs only.
  assert.equal((await request("/admin/users?status=pending", evening)).status, 200);
  assert.equal((await request("/admin/logs", evening)).status, 200);
  assert.equal((await request("/admin/admins", evening, { username: "nope", email: "nope@test.invalid" })).data.code, "NO_PRIVILEGE");

  // Registrations with three hashed recovery questions.
  const sent = await request("/auth/email/send-code", null, { email: "maria@test.invalid" });
  const { data: { email_token } } = await request("/auth/email/verify", null, { email: "maria@test.invalid", code: sent.data.dev_code });
  const registered = await request("/auth/register", null, {
    name: "Maria Santos", email: "maria@test.invalid", email_token, password: "campus-pass-1", role: "buyer",
    campus_id: "2024-00077", affiliation: "student", department: "BSIT", security_questions: questions,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  assert.equal(registered.data.user.recovery_questions, undefined, "Hashes never reach the browser");
  const maria = registered.data.user.id;

  // Filter accounts by ID number and registration date.
  const byId = await request("/admin/users?q=2024-00077", root);
  assert.equal(byId.data.total, 1);
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  assert.equal((await request(`/admin/users?date=${today}&status=pending`, root)).data.total, 1);
  assert.equal((await request("/admin/users?date=2001-01-01", root)).data.total, 0);

  // Edit, block / unblock, remove with a reason, restore.
  const edited = await request(`/admin/users/${maria}`, root, { department: "BS Computer Science" }, "PUT");
  assert.equal(edited.data.department, "BS Computer Science");
  assert.equal((await request(`/admin/users/${maria}/ban`, root, { ban: true }, "PUT")).data.is_banned, true);
  assert.equal((await request("/auth/login", null, { email: "maria@test.invalid", password: "campus-pass-1" })).status, 403);
  await request(`/admin/users/${maria}/ban`, root, { ban: false }, "PUT");
  assert.equal((await request(`/admin/users/${maria}`, root, { reason: "short" }, "DELETE")).status, 400, "A reason is required");
  assert.equal((await request(`/admin/users/${maria}`, evening, { reason: "Duplicate account created by mistake" }, "DELETE")).status, 403, "Needs the delete privilege");
  const removed = await request(`/admin/users/${maria}`, root, { reason: "Duplicate account created by mistake" }, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal((await request("/admin/users?status=removed", root)).data.data[0].delete_reason, "Duplicate account created by mistake");
  assert.equal((await request("/auth/login", null, { email: "maria@test.invalid", password: "campus-pass-1" })).data.error, "This account was removed by an administrator.");
  assert.equal((await request(`/admin/users/${maria}/restore`, root, {})).status, 200);

  // The last admin who can manage admins can't be blocked or removed, and nobody can block themselves.
  const rootId = rootLogin.data.user.id;
  assert.equal((await request(`/admin/users/${rootId}/ban`, root, { ban: true }, "PUT")).status, 403);
  const eveningId = setup.data.user.id;
  assert.equal((await request(`/admin/admins/${rootId}`, root, { permissions: ["logs"] }, "PUT")).status, 409, "Keeps one admin manager");

  // Shift change takes effect immediately: an off-duty admin is signed out and can't sign in.
  const now = new Date(Date.now() + 8 * 3600000);
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const offStart = (minute + 120) % 1440;
  const offEnd = (minute + 180) % 1440;
  assert.equal((await request(`/admin/admins/${eveningId}`, root, { shift_start: offStart, shift_end: offEnd }, "PUT")).status, 200);
  assert.equal((await request("/auth/me", evening)).data.code, "SHIFT_ENDED");
  const offDuty = await request("/auth/login", null, { email: "evening.admin", password: "night-shift-9" });
  assert.equal(offDuty.status, 403);
  assert.equal(offDuty.data.code, "OFF_SHIFT");

  // Reset an admin's password: new starter password and setup again.
  await request(`/admin/admins/${eveningId}`, root, { shift_start: null, shift_end: null }, "PUT");
  const reset = await request(`/admin/admins/${eveningId}/reset-password`, root, {});
  assert.match(reset.data.password, /^[@#$!?][a-z]{5}\d{3}-$/);
  assert.equal((await request("/auth/login", null, { email: "evening.admin", password: reset.data.password })).data.user.must_setup, true);

  // Login logs: time in/out, logout closes the session and its refresh token.
  const session = await request("/auth/login", null, { email: "root@test.invalid", password: "testpassword1" });
  assert.equal((await request("/auth/logout", session.data.accessToken, {})).status, 200);
  assert.equal((await request("/auth/refresh", null, { refreshToken: session.data.refreshToken })).status, 401, "Logged-out sessions can't refresh");
  const logs = await request(`/admin/logs?role=admin&month=${today.slice(0, 7)}`, root);
  assert.ok(logs.data.total >= 3);
  assert.ok(logs.data.data.some((row) => row.end_reason === "logout" && row.time_out));
  assert.ok(logs.data.data.some((row) => row.end_reason === "shift_changed"));
  assert.ok(logs.data.data.every((row) => row.full_name && row.time_in));
  const activity = await request("/admin/activity", root);
  assert.ok(["admin.created", "account.removed", "account.restored", "account.blocked"].every((action) => activity.data.data.some((row) => row.action === action)));

  // Users see only their own sign-ins.
  const mariaLogin = await request("/auth/login", null, { email: "maria@test.invalid", password: "campus-pass-1" });
  const mariaSession = await request("/auth/login/verify", null, { challenge: mariaLogin.data.challenge, code: mariaLogin.data.dev_code });
  const own = await request("/auth/logins", mariaSession.data.accessToken);
  assert.ok(own.data.total >= 1 && own.data.data.every((row) => row.user_id === maria));
  assert.equal((await request("/admin/logs", mariaSession.data.accessToken)).status, 403);

  // Forgot password: emailed code, then 2 of 3 answers.
  assert.equal((await request("/auth/forgot/start", null, { email: "nobody@test.invalid" })).status, 200, "Unknown emails look the same");
  const started = await request("/auth/forgot/start", null, { email: "maria@test.invalid" });
  const checked = await request("/auth/forgot/verify", null, { email: "maria@test.invalid", code: started.data.dev_code });
  assert.deepEqual(checked.data, { questions: questions.map((item) => item.question), answers_needed: 2 });
  const oneRight = await request("/auth/forgot/complete", null, { email: "maria@test.invalid", code: started.data.dev_code, answers: ["bantay", "wrong", "wrong"], new_password: "new-pass-22" });
  assert.equal(oneRight.status, 400);
  assert.match(oneRight.data.error, /don't match/);
  await tick();
  const twoRight = await request("/auth/forgot/complete", null, { email: "maria@test.invalid", code: started.data.dev_code, answers: [" BANTAY ", "wrong", "mrs.  reyes"], new_password: "new-pass-22" });
  assert.equal(twoRight.status, 200, JSON.stringify(twoRight.data));
  assert.equal((await request("/auth/me", mariaSession.data.accessToken)).status, 401, "A reset signs out old sessions");
  assert.equal((await request("/auth/login", null, { email: "maria@test.invalid", password: "new-pass-22" })).status, 200);
});
