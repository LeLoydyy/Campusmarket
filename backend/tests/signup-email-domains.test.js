import { test } from "node:test";
import assert from "node:assert/strict";

test("buyers may sign up with Gmail; sellers and admins need the campus email", async () => {
  delete process.env.ALLOWED_EMAIL_DOMAIN;
  delete process.env.BUYER_EMAIL_DOMAINS;
  const { createAdminSchema, registerSchema, sendCodeSchema, verifyEmailSchema } = await import("../src/middleware/validate.js");
  const account = {
    name: "Juan Dela Cruz", password: "campus-pass-1", campus_id: "2024-00001", affiliation: "student", department: "BSIT",
    security_questions: [{ question: "What was the name of your first pet?", answer: "Kiko" }],
  };
  const ok = (schema, value) => schema.safeParse(value).success;
  const message = (schema, value) => schema.safeParse(value).error?.issues.map((issue) => issue.message).join(" ");

  // Email code steps (role not known yet): campus or Gmail, nothing else.
  assert.ok(ok(sendCodeSchema, { email: "Juan@GMAIL.com" }));
  assert.ok(ok(sendCodeSchema, { email: "juan@csucc.edu.ph" }));
  assert.ok(ok(verifyEmailSchema, { email: "juan@gmail.com", code: "123456" }));
  assert.match(message(sendCodeSchema, { email: "juan@yahoo.com" }), /@csucc\.edu\.ph or @gmail\.com/);
  assert.ok(!ok(sendCodeSchema, { email: "juan@notgmail.com" }), "Lookalike domains are rejected");

  // Registering: buyers either domain, sellers campus only.
  assert.equal(registerSchema.parse({ ...account, email: "Juan@Gmail.com", role: "buyer" }).email, "juan@gmail.com");
  assert.ok(ok(registerSchema, { ...account, email: "juan@csucc.edu.ph", role: "buyer" }));
  const seller = { ...account, role: "seller", store_name: "Sweet Finds", campus_location: "Main Canteen" };
  assert.ok(ok(registerSchema, { ...seller, email: "juan@csucc.edu.ph" }));
  assert.match(message(registerSchema, { ...seller, email: "juan@gmail.com" }), /Sellers must sign up with their @csucc\.edu\.ph/);

  // Administrators stay campus-only.
  assert.ok(!ok(createAdminSchema, { username: "staff1", email: "staff@gmail.com" }));
});

test("Gmail buyers skip the CSUCC ID: they get an automatic buyer ID and an admin still approves them", async (t) => {
  process.env.PGLITE_DIR = "memory://";
  process.env.SEED_DEMO = "false";
  delete process.env.DATABASE_URL;
  const { closeDb, query } = await import("../src/db/index.js");
  const { authStore, ready } = await import("../src/data/marketStore.js");
  const { registerSchema, credentialsSchema } = await import("../src/middleware/validate.js");
  t.after(closeDb);
  await ready();
  await query("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ('adm', 'Admin', 'adm@csucc.edu.ph', 'x', 'admin', 'approved')");
  const base = { name: "Ana Reyes", password: "open-pass-1", security_questions: [{ question: "What was the name of your first pet?", answer: "Kiko" }] };

  // The schema drops any CSUCC fields a Gmail buyer sends, and still requires them for campus emails.
  const gmail = registerSchema.parse({ ...base, email: "ana@gmail.com", campus_id: "2024-1", affiliation: "student", department: "BSIT" });
  assert.deepEqual([gmail.campus_id, gmail.affiliation, gmail.department], [undefined, undefined, undefined]);
  const campus = registerSchema.safeParse({ ...base, email: "ana@csucc.edu.ph" });
  assert.deepEqual(campus.error.issues.map((issue) => issue.path[0]).sort(), ["affiliation", "campus_id", "department"]);

  const first = await authStore.registerUser(gmail);
  const second = await authStore.registerUser(registerSchema.parse({ ...base, email: "ben@gmail.com" }));
  assert.deepEqual([first.campus_id, first.affiliation, first.department, first.campus, first.status], ["CMB-000001", "public", null, null, "pending"]);
  assert.equal(second.campus_id, "CMB-000002", "IDs count up");

  // Approval needs the admin's check, but no CSUCC details.
  await assert.rejects(authStore.reviewRegistration(first.id, "adm", { status: "approved", note: "Looks fine", credentials_checked: false }), /checked this registration/);
  assert.equal((await authStore.reviewRegistration(first.id, "adm", { status: "approved", note: "Email confirmed", credentials_checked: true })).status, "approved");

  // A public buyer asked for a correction can send it back for review without a CSUCC ID.
  await authStore.reviewRegistration(second.id, "adm", { status: "rejected", note: "Please use your real name" });
  assert.equal((await authStore.submitCredentials(second.id, credentialsSchema.parse({}))).status, "pending");
});
