import { test } from "node:test";
import assert from "node:assert/strict";
import { personName, registerSchema } from "../src/middleware/validate.js";

test("names are letters only, first + last, each word capitalised", () => {
  const ok = (input) => personName.parse(input);
  const bad = (input) => personName.safeParse(input).success;

  assert.equal(ok("juan dela cruz"), "Juan Dela Cruz");
  assert.equal(ok("  MARIA   clara  SANTOS "), "Maria Clara Santos");
  assert.equal(ok("josé peñaranda"), "José Peñaranda");
  assert.equal(ok("Princess Angelika C Dedumo"), "Princess Angelika C Dedumo", "a middle initial is fine");

  assert.equal(bad("Juan"), false, "first name only");
  assert.equal(bad("J Dela Cruz"), false, "first name as an initial");
  assert.equal(bad("Juan C"), false, "last name as an initial");
  assert.equal(bad("Juan2 Cruz"), false, "numbers");
  assert.equal(bad("Juan C. Cruz"), false, "symbols");
  assert.equal(bad("Juan_Cruz Santos"), false, "symbols");
  assert.equal(bad("x".repeat(41) + " " + "y".repeat(41)), false, "too long");

  const signup = registerSchema.safeParse({ name: "juan", email: "juan@gmail.com", password: "password1", role: "buyer" });
  assert.equal(signup.success, false);
  assert.ok(signup.error.issues.some((issue) => issue.path[0] === "name"), "sign-up rejects a one-word name");
});
