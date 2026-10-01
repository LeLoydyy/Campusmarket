import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

test("campus email codes, sign-in codes, security question fallback and lockout", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-auth-"));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ["src/app.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env, PORT: String(port), DATABASE_URL: "", PGLITE_DIR: path.join(directory, "db"), SEED_DEMO: "false",
      PRODUCT_PHOTO_DIR: path.join(directory, "photos"), JWT_SECRET: "auth-test-secret", NODE_ENV: "test",
      EMAIL_PROVIDER: "console", ALLOWED_EMAIL_DOMAIN: "csucc.edu.ph",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk; });
  t.after(async () => {
    if (child.exitCode === null) { const closed = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await closed; }
    assert.ok(path.basename(directory).startsWith("campus-auth-"));
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
  const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

  // Sign-up only accepts the campus domain, and only after the emailed code is confirmed.
  assert.equal((await request("/auth/email/send-code", null, { email: "juan@gmail.com" })).status, 400);
  const email = "Juan.DelaCruz@CSUCC.edu.ph";
  const sent = await request("/auth/email/send-code", null, { email });
  assert.equal(sent.status, 200);
  assert.match(sent.data.dev_code, /^\d{6}$/);
  assert.equal(sent.data.sent_to, "juan.delacruz@csucc.edu.ph");
  assert.equal((await request("/auth/email/send-code", null, { email })).status, 429, "Resend has a cooldown");
  const wrong = await request("/auth/email/verify", null, { email, code: wrongCode(sent.data.dev_code) });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.error, /4 tries left/);
  const { data: { email_token } } = await request("/auth/email/verify", null, { email, code: sent.data.dev_code });
  assert.ok(email_token);
  assert.equal((await request("/auth/email/verify", null, { email, code: sent.data.dev_code })).status, 400, "Codes are single-use");
  assert.equal((await request("/auth/me", email_token)).status, 401, "Email tokens are not sessions");

  const account = {
    name: "Juan Dela Cruz", email, password: "campus-pass-1", role: "buyer", campus_id: "2024-00001", affiliation: "student",
    department: "BSIT", security_question: "What was the name of your first pet?", security_answer: "Mang  Kiko",
  };
  assert.equal((await request("/auth/register", null, account)).status, 400, "Registration needs the email token");
  assert.equal((await request("/auth/register", null, { ...account, email_token: "forged" })).status, 400);
  assert.equal((await request("/auth/register", null, { ...account, password: "allletters", email_token })).status, 400, "Password needs a number");
  const created = await request("/auth/register", null, { ...account, email_token });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.security_answer_hash, undefined);
  assert.equal((await request("/auth/email/send-code", null, { email })).status, 409);

  // A correct password alone never returns a session.
  const first = await request("/auth/login", null, { email, password: account.password });
  assert.equal(first.status, 200);
  assert.equal(first.data.accessToken, undefined);
  assert.equal(first.data.sent_to, "j••••••z@csucc.edu.ph");
  assert.equal(first.data.security_question, account.security_question);
  assert.equal((await request("/auth/me", first.data.challenge)).status, 401, "Challenge tokens are not sessions");
  assert.equal((await request("/auth/refresh", null, { refreshToken: first.data.challenge })).status, 401);
  assert.equal((await request("/auth/login/verify", null, { challenge: first.data.challenge, code: wrongCode(first.data.dev_code) })).status, 400);
  const signedIn = await request("/auth/login/verify", null, { challenge: first.data.challenge, code: first.data.dev_code });
  assert.equal(signedIn.status, 200);
  assert.equal((await request("/auth/me", signedIn.data.accessToken)).data.email, "juan.delacruz@csucc.edu.ph");

  // Fallback: the security question, case- and spacing-insensitive.
  const second = await request("/auth/login", null, { email, password: account.password });
  assert.equal(second.status, 200, "A used code doesn't hold back the next sign-in");
  const again = await request("/auth/login", null, { email, password: account.password });
  assert.equal(again.data.reused, true, "Re-entering the password within a minute keeps the emailed code");
  assert.equal(again.data.dev_code, undefined);
  assert.equal((await request("/auth/login/verify", null, { challenge: second.data.challenge, security_answer: "kiko" })).status, 400);
  const byAnswer = await request("/auth/login/verify", null, { challenge: second.data.challenge, security_answer: "  mang kiko " });
  assert.equal(byAnswer.status, 200);
  assert.ok(byAnswer.data.accessToken);
  assert.equal((await request("/auth/login/verify", null, { challenge: "nope", code: "123456" })).status, 401);

  // Two free wrong passwords, then a cooldown that doubles: 5s, 10s, 20s …
  const wrongPassword = () => request("/auth/login", null, { email, password: "wrong-password" });
  assert.equal((await wrongPassword()).status, 401);
  assert.equal((await wrongPassword()).status, 401);
  const third = await wrongPassword();
  assert.equal(third.status, 423);
  assert.equal(third.data.retry_after, 5);
  assert.match(third.data.error, /5 seconds/);
  const waiting = await request("/auth/login", null, { email, password: account.password });
  assert.equal(waiting.status, 423, "Even the right password waits out the cooldown");
  assert.ok(waiting.data.retry_after <= 5);
  await new Promise((resolve) => setTimeout(resolve, 5200));
  const fourth = await wrongPassword();
  assert.equal(fourth.data.retry_after, 10, "The cooldown doubles");
  await new Promise((resolve) => setTimeout(resolve, 10200));
  assert.equal((await request("/auth/login", null, { email, password: account.password })).status, 200, "The right password works once it ends");
});

test("sign-in cooldown schedule", async () => {
  const { loginCooldownSeconds } = await import("../src/data/marketStore.js");
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(loginCooldownSeconds), [0, 0, 5, 10, 20, 40]);
  assert.equal(loginCooldownSeconds(30), 15 * 60, "Capped at 15 minutes");
});
