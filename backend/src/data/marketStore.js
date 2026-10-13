/**
 * marketStore.js — all marketplace data access, backed by PostgreSQL (see src/db).
 *
 * Every store keeps the same method names and response shapes the controllers
 * already use. Anything that touches stock runs in a transaction with row locks,
 * so concurrent orders can never oversell or restore stock twice.
 */
import bcrypt from "bcryptjs";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { getPlan, PLANS } from "../config/plans.js";
import { PERMISSION_KEYS, describeShift, generateStarterPassword, isOnShift } from "../config/admins.js";
import { cancellationDeadline, canBuyerCancel, LOCKED_STATUSES } from "../config/orderCancellation.js";
import { getDb, query, transaction } from "../db/index.js";
import { getRecommendedProductIds, getSimilarProductIds } from "../services/aiService.js";
import { buyerOrderMessage, sellerCancelledMessage, sellerNewOrderMessage } from "../services/orderNotifications.js";
import { isStallOpen } from "../services/openingHours.js";

// ── Errors ────────────────────────────────────────────────────────────────────
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

// Translate Postgres constraint errors into HTTP-friendly ones.
const DB_ERRORS = {
  23505: ["This record already exists.", 409],
  23503: ["A related record was not found.", 404],
  23514: ["Invalid value.", 400],
  "22P02": ["Invalid value.", 400],
  22003: ["Value is out of range.", 400],
};
const mapDbError = (error) => {
  const mapped = !error.status && DB_ERRORS[error.code];
  return mapped ? Object.assign(new Error(mapped[0]), { status: mapped[1], cause: error }) : error;
};

// ── Startup: demo data and first administrator ───────────────────────────────
const seedPassword = process.env.SEED_PASSWORD || randomUUID();

const seedDemoData = async (q) => {
  const hash = bcrypt.hashSync(seedPassword, 12);
  const [admin, buyer, seller] = [randomUUID(), randomUUID(), randomUUID()];
  const stall = randomUUID();
  for (const [id, name, email, role] of [
    [admin, "System Admin", "admin@campusmarket.test", "admin"],
    [buyer, "Maria Santos", "buyer@campusmarket.test", "buyer"],
    [seller, "Jayson Cruz", "seller@campusmarket.test", "seller"],
  ]) {
    await q("INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5, 'approved')", [id, name, email, hash, role]);
  }
  await q(`INSERT INTO stalls (id, owner_id, name, logo_url, description, banner_url, location, category, status, tier, is_active)
           VALUES ($1, $2, 'Campus Eats', '/images/buyer/campus-eats-logo.png', 'Fresh student favorites and snacks',
                   '/images/buyer/campus-eats-banner.png', 'Main Canteen', 'food', 'approved', 'premium', TRUE)`, [stall, seller]);
  for (const [name, description, price, stock, category, image, featured, views] of [
    ["Adobong Rice Bucket", "Hearty rice meal with chicken adobo.", 89, 15, "food", "product-adobo.png", true, 42],
    ["Campus Hoodie", "Comfortable hoodie for everyday campus wear.", 450, 8, "clothing", "product-hoodie.png", false, 21],
    ["USB-C Charger", "Fast charging USB-C power adapter.", 299, 10, "electronics", "product-charger.png", true, 33],
  ]) {
    await q(`INSERT INTO products (stall_id, name, description, price, stock, category, image_url, is_featured, view_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [stall, name, description, price, stock, category, `/images/buyer/${image}`, featured, views]);
  }
  await q(`INSERT INTO events (name, date, location, description) VALUES
           ('Spring Fair', '2026-05-01', 'CSUCC Grounds', 'A fun spring event featuring local student stalls.'),
           ('Summer Fest', '2026-06-15', 'CSUCC Covered Court', 'Enjoy summer vibes with food, music, and merch.')`);
  if (!process.env.SEED_PASSWORD) console.log(`[seed] Demo accounts (admin/buyer/seller@campusmarket.test) password: ${seedPassword}`);
};

const bootstrap = async () => {
  await getDb();
  await transaction(async (q) => {
    // Creates the first administrator in a fresh database (e.g. a new Supabase project).
    const { BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
    if (email && password) {
      await q(`INSERT INTO users (name, email, password_hash, role, status) VALUES ('Administrator', $1, $2, 'admin', 'approved')
               ON CONFLICT (email) DO NOTHING`, [email.trim().toLowerCase(), bcrypt.hashSync(password, 12)]);
    }
    const seedEnabled = process.env.SEED_DEMO !== "false" && process.env.NODE_ENV !== "production";
    const [{ count }] = await q("SELECT count(*) FROM users");
    if (seedEnabled && count === 0) await seedDemoData(q);
  });
};

let readyPromise = null;
/** Connect, apply the schema and seed. Safe to call repeatedly. */
export const ready = () => {
  readyPromise ??= bootstrap().catch((error) => { readyPromise = null; throw error; });
  return readyPromise;
};

/** Query helper: rows. */
const q = async (text, params) => {
  await ready();
  try { return await query(text, params); } catch (error) { throw mapDbError(error); }
};
/** Query helper: first row or null. */
const q1 = async (text, params) => (await q(text, params))[0] ?? null;
/** Transaction helper: fn receives a query function that returns rows. */
const tx = async (fn) => {
  await ready();
  try { return await transaction(fn); } catch (error) { throw mapDbError(error); }
};

// ── Shared SQL fragments ──────────────────────────────────────────────────────
const USER_COLUMNS = `id, name, email, role, status, campus_id, affiliation, department, campus, avatar_url, phone, address, notification_prefs,
  is_banned, review_note, reviewed_by, reviewed_at, password_changed_at, created_at, username, shift_start, shift_end,
  permissions, must_setup, created_by, last_login_at, deleted_at, deleted_by, delete_reason,
  (recovery_questions IS NOT NULL) AS has_recovery_questions`;
const publicUser = (user) => user ? { id: user.id, name: user.name, role: user.role, avatar_url: user.avatar_url } : null;

// A stall is publicly visible when approved, active and owned by an approved, unbanned user.
const PUBLIC_STALL = "s.status = 'approved' AND s.is_active AND o.status = 'approved' AND NOT o.is_banned";
const STALL_SELECT = `SELECT s.*, coalesce(o.name, 'Campus seller') AS seller_name,
  (SELECT count(*) FROM products c WHERE c.stall_id = s.id) AS product_count
  FROM stalls s LEFT JOIN users o ON o.id = s.owner_id`;
const withPlan = (stall) => stall && { ...stall, plan: getPlan(stall.tier) };
const PRODUCT_SELECT = `SELECT p.*, to_jsonb(s) AS stalls,
  (SELECT round(avg(r.rating)::numeric, 1)::float FROM reviews r WHERE r.product_id = p.id) AS avg_rating,
  (SELECT count(*)::int FROM reviews r WHERE r.product_id = p.id) AS review_count,
  (SELECT coalesce(json_agg(json_build_object('id', po.id, 'label', po.label, 'stock', po.stock) ORDER BY po.position, po.label), '[]'::json)
     FROM product_options po WHERE po.product_id = p.id) AS options
  FROM products p
  JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id`;

const isApprovedUser = async (run, id) =>
  Boolean((await run("SELECT 1 FROM users WHERE id = $1 AND status = 'approved' AND NOT is_banned", [id]))[0]);

const audit = (run, actorId, action, targetId, note = null) =>
  run("INSERT INTO audit_log (actor_id, action, target_id, note) VALUES ($1, $2, $3, $4)", [actorId, action, targetId, note]);

/** Optional notifications a user can turn off (Settings). A missing key means "on". */
export const NOTIFICATION_PREFS = ["orderUpdates", "reviewAlerts", "stockAlerts"];
const wantsNotice = async (run, userId, key) => {
  const [row] = await run("SELECT notification_prefs ->> $2 AS value FROM users WHERE id = $1", [userId, key]);
  return row?.value !== "false";
};

// ── Products: sale price, options, low-stock alerts ──────────────────────────
/** What a buyer pays: the sale price when one is set below the regular price. */
const unitPrice = (product) => (product.sale_price != null && Number(product.sale_price) < Number(product.price) ? product.sale_price : product.price);
export const LOW_STOCK_AT = 3;

/** Keeps products.stock equal to the total of its options (no-op for products without options). */
const syncOptionStock = (run, productId) => run(
  `UPDATE products SET stock = (SELECT sum(stock) FROM product_options WHERE product_id = $1)
   WHERE id = $1 AND EXISTS (SELECT 1 FROM product_options WHERE product_id = $1)`, [productId]);

/** Replaces a product's options; options keep their IDs (and cart lines) when the label stays the same. */
const saveOptions = async (run, productId, options) => {
  const clean = [];
  const seen = new Set();
  for (const option of options) {
    const label = String(option.label || "").trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    clean.push({ label, stock: Math.max(0, Math.floor(Number(option.stock) || 0)) });
  }
  await run("DELETE FROM product_options WHERE product_id = $1 AND NOT (label = ANY($2))", [productId, clean.map((option) => option.label)]);
  for (const [position, option] of clean.entries()) {
    await run(
      `INSERT INTO product_options (product_id, label, stock, position) VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, label) DO UPDATE SET stock = EXCLUDED.stock, position = EXCLUDED.position`,
      [productId, option.label, option.stock, position],
    );
  }
  await syncOptionStock(run, productId);
};

/** Tells the seller when a product (or one of its options) drops to the low-stock line or sells out. */
const lowStockNotice = async (run, productId, before, after, optionLabel = null) => {
  if (!(before > LOW_STOCK_AT && after <= LOW_STOCK_AT) && !(before > 0 && after === 0)) return;
  const [product] = await run("SELECT p.name, s.owner_id FROM products p JOIN stalls s ON s.id = p.stall_id WHERE p.id = $1", [productId]);
  if (!product || !(await wantsNotice(run, product.owner_id, "stockAlerts"))) return;
  const name = optionLabel ? `${product.name} (${optionLabel})` : product.name;
  await run(
    `INSERT INTO notifications (user_id, type, status, title, body, link) VALUES ($1, 'stock', $2, $3, $4, '/seller/products')`,
    [product.owner_id, after === 0 ? "sold_out" : "low_stock",
      after === 0 ? `${name} is sold out` : `${name} is running low`,
      after === 0 ? "Buyers can't order it until you add more stock." : `Only ${after} left. Restock it in Products.`],
  );
};

/** Takes stock for a product or one of its options, alerting the seller if it gets low. */
const takeStock = async (run, productId, optionId, quantity) => {
  if (optionId) {
    const [option] = await run("UPDATE product_options SET stock = stock - $2 WHERE id = $1 RETURNING label, stock", [optionId, quantity]);
    await lowStockNotice(run, productId, option.stock + quantity, option.stock, option.label);
    const [{ stock: before }] = await run("SELECT stock FROM products WHERE id = $1", [productId]);
    await syncOptionStock(run, productId);
    const [{ stock: after }] = await run("SELECT stock FROM products WHERE id = $1", [productId]);
    if (after === 0) await lowStockNotice(run, productId, before, after);
    return;
  }
  const [{ stock }] = await run("UPDATE products SET stock = stock - $2 WHERE id = $1 RETURNING stock", [productId, quantity]);
  await lowStockNotice(run, productId, stock + quantity, stock);
};

/** Gives stock back (cancelled orders); an option that was since removed returns nothing. */
const returnStock = async (run, productId, optionId, quantity) => {
  if (optionId) {
    await run("UPDATE product_options SET stock = stock + $2 WHERE id = $1", [optionId, quantity]);
    await syncOptionStock(run, productId);
    return;
  }
  await run("UPDATE products SET stock = stock + $2 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM product_options WHERE product_id = $1)", [productId, quantity]);
};

/** Checks a requested product/option line against what's in stock; returns the matching option (or null). */
const pickOption = (product, options, optionId) => {
  const own = options.filter((option) => option.product_id === product.id);
  if (!own.length) {
    if (optionId) fail(`${product.name} has no options to choose from.`);
    return null;
  }
  const option = own.find((entry) => entry.id === optionId);
  if (!option) fail(`Choose an option for ${product.name}.`);
  return option;
};
/** A sale price must be below the regular price; empty means no sale. */
const checkedSalePrice = (salePrice, price) => {
  if (salePrice == null || salePrice === "") return null;
  if (Number(salePrice) >= Number(price)) fail("The sale price must be lower than the regular price.");
  return Number(salePrice);
};
const lineName = (product, option) => (option ? `${product.name} (${option.label})` : product.name);

const escapeLike = (value) => String(value).replace(/[\\%_]/g, "\\$&");
const pageParams = (page, limit, max = 100) => {
  const size = Math.min(max, Math.max(1, Number(limit) || 20));
  const number = Math.max(1, Number(page) || 1);
  return { size, number, offset: (number - 1) * size };
};
const cents = (amount) => Math.round(Number(amount) * 100);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const CODE_TTL_MINUTES = 10;
const CODE_RESEND_SECONDS = 60;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_HOUR = 6;
// Wrong passwords: two free tries, then a cooldown that doubles each time (5s, 10s, 20s … 15 min).
const LOGIN_FREE_FAILURES = 2;
const LOGIN_COOLDOWN_BASE_SECONDS = 5;
const LOGIN_COOLDOWN_MAX_SECONDS = 15 * 60;
export const loginCooldownSeconds = (failures) => (failures <= LOGIN_FREE_FAILURES ? 0
  : Math.min(LOGIN_COOLDOWN_MAX_SECONDS, LOGIN_COOLDOWN_BASE_SECONDS * 2 ** (failures - LOGIN_FREE_FAILURES - 1)));

const hashCode = (code) => createHmac("sha256", process.env.JWT_SECRET || "campus-market-codes").update(String(code)).digest("hex");
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Answers are compared case- and spacing-insensitively so "  Mang Juan" matches "mang juan".
const normalizeAnswer = (answer) => String(answer).trim().toLowerCase().replace(/\s+/g, " ");
const hashRecoveryQuestions = (items) => items.map(({ question, answer }) => ({ question, answer_hash: bcrypt.hashSync(normalizeAnswer(answer), 12) }));
const RECOVERY_ANSWERS_NEEDED = 2;
/** Recovery questions for a user: the three from registration, or the single older one. */
const recoveryQuestionsOf = (user) => user.recovery_questions?.length ? user.recovery_questions
  : user.security_answer_hash ? [{ question: user.security_question, answer_hash: user.security_answer_hash }] : [];
/** Two of three right (or the single older question) — answers are matched by position. */
const recoveryAnswersPass = (user, answers = []) => {
  const questions = recoveryQuestionsOf(user);
  if (!questions.length) return true;
  const right = questions.filter((item, i) => answers[i] && bcrypt.compareSync(normalizeAnswer(answers[i]), item.answer_hash)).length;
  return right >= Math.min(RECOVERY_ANSWERS_NEEDED, questions.length);
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const secondsUntil = (time) => Math.max(1, Math.ceil((Date.parse(time) - Date.now()) / 1000));
const describeWait = (seconds) => (seconds < 60 ? plural(seconds, "second") : plural(Math.ceil(seconds / 60), "minute"));

/**
 * Spends one try against the newest unused code for email+purpose. The attempt counter
 * is committed before the error is thrown, so wrong guesses can't be rolled back.
 */
const attemptCode = async (email, purpose, matches, wrongMessage, { consume = true } = {}) => {
  const outcome = await tx(async (run) => {
    const [row] = await run(`SELECT * FROM auth_codes WHERE email = $1 AND purpose = $2 AND used_at IS NULL
                             ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [email, purpose]);
    if (!row || Date.parse(row.expires_at) <= Date.now()) return { error: ["This code has expired. Send a new one.", 400] };
    if (row.attempts >= CODE_MAX_ATTEMPTS) return { error: ["Too many wrong tries. Send a new code.", 429] };
    if (matches(row)) {
      if (consume) await run("UPDATE auth_codes SET used_at = now() WHERE id = $1", [row.id]);
      return {};
    }
    const [{ attempts }] = await run("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts", [row.id]);
    const left = CODE_MAX_ATTEMPTS - attempts;
    return { error: left > 0 ? [`${wrongMessage} ${plural(left, "try", "tries")} left.`, 400] : ["Too many wrong tries. Send a new code.", 429] };
  });
  if (outcome.error) fail(...outcome.error);
};

export const authStore = {
  /**
   * Creates a 6-digit code (replacing any unused one) and returns it for emailing.
   * While a code sent under a minute ago is still unused, a resend is refused — or, with
   * `reusePending`, that code stays valid and `{ reused: true }` is returned instead.
   */
  async issueCode(email, purpose, { reusePending = false } = {}) {
    return tx(async (run) => {
      await run("DELETE FROM auth_codes WHERE created_at < now() - interval '1 day'");
      const [recent] = await run(`SELECT count(*) AS sent, max(created_at) FILTER (WHERE used_at IS NULL) AS pending
                                  FROM auth_codes WHERE email = $1 AND purpose = $2 AND created_at > now() - interval '1 hour'`, [email, purpose]);
      const wait = recent.pending ? CODE_RESEND_SECONDS - Math.floor((Date.now() - Date.parse(recent.pending)) / 1000) : 0;
      if (wait > 0 && reusePending) {
        return { reused: true, expires_in: CODE_TTL_MINUTES * 60 - (CODE_RESEND_SECONDS - wait), resend_in: wait };
      }
      if (wait > 0) fail(`Please wait ${plural(wait, "second")} before requesting another code.`, 429);
      if (recent.sent >= CODES_PER_HOUR) fail("Too many codes requested. Please try again in an hour.", 429);
      await run("UPDATE auth_codes SET used_at = now() WHERE email = $1 AND purpose = $2 AND used_at IS NULL", [email, purpose]);
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await run(`INSERT INTO auth_codes (email, purpose, code_hash, expires_at)
                 VALUES ($1, $2, $3, now() + make_interval(mins => $4))`, [email, purpose, hashCode(code), CODE_TTL_MINUTES]);
      return { code, expires_in: CODE_TTL_MINUTES * 60, resend_in: CODE_RESEND_SECONDS };
    });
  },

  /** Withdraws the newest unused code (e.g. the email couldn't be sent), freeing the resend cooldown. */
  async discardCode(email, purpose) {
    await q(`DELETE FROM auth_codes WHERE id = (SELECT id FROM auth_codes WHERE email = $1 AND purpose = $2 AND used_at IS NULL
             ORDER BY created_at DESC LIMIT 1)`, [email, purpose]);
  },

  async verifyCode(email, purpose, code) {
    await attemptCode(email, purpose, (row) => sameHash(row.code_hash, hashCode(code)), "That code isn't right.");
  },

  /** Security-question fallback for a sign-in code; shares the code's try budget. */
  async verifySecurityAnswer(user, answer) {
    if (!user.security_answer_hash) fail("This account has no security question. Use the emailed code.");
    await attemptCode(user.email, "login", () => bcrypt.compareSync(normalizeAnswer(answer), user.security_answer_hash), "That answer isn't right.");
  },

  async emailRegistered(email) {
    return Boolean(await q1("SELECT 1 FROM users WHERE email = $1", [email]));
  },

  async markEmailVerified(userId) {
    await q("UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1", [userId]);
  },

  async startSelling(userId, payload) {
    return tx(async (run) => {
      const [user] = await run("SELECT role FROM users WHERE id = $1 AND status = 'approved' AND NOT is_banned FOR UPDATE", [userId]);
      if (!user || !["buyer", "seller"].includes(user.role)) fail("An approved campus account is required.", 403);
      const stall = await insertStall(run, userId, payload);
      const [updated] = await run(`UPDATE users SET role = 'seller' WHERE id = $1 RETURNING ${USER_COLUMNS}`, [userId]);
      return { user: updated, stall };
    });
  },

  async registerUser({ name, email, password, role = "buyer", campus_id, affiliation, department, store_name, campus_location,
    security_question = null, security_answer = null, security_questions = null, email_verified = false }) {
    const passwordHash = bcrypt.hashSync(password, 12);
    const recovery = security_questions ? hashRecoveryQuestions(security_questions) : null;
    // The first of the three also serves the sign-in "answer your security question" option.
    if (security_questions) [security_question, security_answer] = [security_questions[0].question, security_questions[0].answer];
    const answerHash = security_answer ? bcrypt.hashSync(normalizeAnswer(security_answer), 12) : null;
    return tx(async (run) => {
      if ((await run("SELECT 1 FROM users WHERE email = $1", [email]))[0]) fail("Email already registered", 409);
      if ((await run("SELECT 1 FROM users WHERE lower(campus_id) = lower($1)", [campus_id]))[0]) fail("This campus ID is already registered.", 409);
      const [user] = await run(
        `INSERT INTO users (name, email, password_hash, role, campus_id, affiliation, department, campus,
                            security_question, security_answer_hash, email_verified_at, recovery_questions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CSUCC', $8, $9, CASE WHEN $10::boolean THEN now() END, $11) RETURNING ${USER_COLUMNS}`,
        [name, email, passwordHash, role, campus_id, affiliation, department, security_question, answerHash, email_verified,
          recovery && JSON.stringify(recovery)],
      );
      if (role === "seller") {
        await run("INSERT INTO stalls (owner_id, name, location) VALUES ($1, $2, $3)", [user.id, store_name, campus_location]);
      }
      return user;
    });
  },

  /** `email` may also be an administrator's username. */
  async loginUser(email, password) {
    const user = await q1("SELECT * FROM users WHERE email = $1 OR lower(username) = $1 LIMIT 1", [email]);
    // Always run bcrypt so response time doesn't reveal whether the email exists
    const valid = bcrypt.compareSync(password, user?.password_hash || DUMMY_HASH);
    // 423 with retry_after (seconds) so the sign-in page can count down.
    const paused = (seconds) => {
      throw Object.assign(new Error(`Too many wrong passwords. Try again in ${describeWait(seconds)}.`), { status: 423, retryAfter: seconds });
    };
    // While cooling down even the right password waits, and the attempt doesn't count.
    if (user?.locked_until && Date.parse(user.locked_until) > Date.now()) paused(secondsUntil(user.locked_until));
    if (!user || !valid) {
      if (user) {
        const [{ failed_logins: failures }] = await q("UPDATE users SET failed_logins = failed_logins + 1 WHERE id = $1 RETURNING failed_logins", [user.id]);
        const cooldown = loginCooldownSeconds(failures);
        if (cooldown) {
          await q("UPDATE users SET locked_until = now() + make_interval(secs => $2) WHERE id = $1", [user.id, cooldown]);
          paused(cooldown);
        }
      }
      fail("Invalid email or password", 401);
    }
    if (user.deleted_at) fail("This account was removed by an administrator.", 403);
    if (user.is_banned) fail("Account suspended", 403);
    if (!isOnShift(user)) {
      throw Object.assign(new Error(`You're off duty. Your shift is ${describeShift(user)} (Philippine time) — sign in then.`), { status: 403, code: "OFF_SHIFT" });
    }
    if (user.failed_logins || user.locked_until) await q("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [user.id]);
    return user;
  },

  async changePassword(userId, currentPassword, newPassword) {
    const user = await q1("SELECT password_hash FROM users WHERE id = $1", [userId]);
    if (!user) fail("User not found", 404);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) fail("Current password is incorrect.", 401);
    if (currentPassword === newPassword) fail("Choose a password different from your current one.");
    return q1(`UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [userId, bcrypt.hashSync(newPassword, 12)]);
  },

  /** Full row including hashes — for sign-in checks only, never send it to a client. */
  async getUserWithSecrets(userId) {
    const user = await q1("SELECT * FROM users WHERE id = $1", [userId]);
    if (!user) fail("User not found", 404);
    return user;
  },

  async getUserById(userId) {
    const user = await q1(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
    if (!user) fail("User not found", 404);
    return user;
  },

  /** Saves which optional notifications the user wants (merged with what was saved before). */
  async setNotificationPrefs(userId, prefs) {
    const allowed = Object.fromEntries(NOTIFICATION_PREFS.filter((key) => typeof prefs[key] === "boolean").map((key) => [key, prefs[key]]));
    const [user] = await q(`UPDATE users SET notification_prefs = notification_prefs || $2::jsonb WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [userId, JSON.stringify(allowed)]);
    if (!user) fail("User not found", 404);
    return user;
  },

  async updateUserProfile(userId, updates) {
    return tx(async (run) => {
      const [user] = await run("SELECT name, role FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user) fail("User not found", 404);
      const sets = [];
      const params = [userId];
      if (updates.name) {
        const name = typeof updates.name === "string" ? updates.name.trim() : "";
        if (name.length < 2 || name.length > 80) fail("Enter a valid full name.");
        params.push(name);
        sets.push(`name = $${params.length}`);
        // A new legal name must be rechecked against campus records.
        if (name !== user.name && user.role !== "admin") {
          sets.push("status = 'pending'", "review_note = 'Your name changed. An administrator will recheck your campus credentials.'");
        }
      }
      for (const key of ["avatar_url", "phone", "address"]) {
        if (updates[key] === undefined) continue;
        params.push(updates[key]);
        sets.push(`${key} = $${params.length}`);
      }
      if (!sets.length) return (await run(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]))[0];
      return (await run(`UPDATE users SET ${sets.join(", ")} WHERE id = $1 RETURNING ${USER_COLUMNS}`, params))[0];
    });
  },

  /**
   * Accounts for the admin list. `q` matches name, email, ID number (campus/employee ID) or username;
   * `month` (YYYY-MM) and `date` (YYYY-MM-DD) filter by registration day in Philippine time.
   * status "removed" lists removed accounts; every other view hides them.
   */
  async listUsers({ role, status, q: search, month, date, page = 1, limit = 20 } = {}) {
    const { size, number, offset } = pageParams(page, limit);
    const removed = status === "removed";
    const day = manilaTime("created_at");
    const where = `($1::text IS NULL OR role = $1) AND ($2::text IS NULL OR status = $2)
      AND ($3::text IS NULL OR concat_ws(' ', name, email, campus_id, username) ILIKE '%' || $3 || '%')
      AND (deleted_at IS NOT NULL) = $4
      AND ($5::text IS NULL OR to_char(${day}, 'YYYY-MM') = $5) AND ($6::text IS NULL OR to_char(${day}, 'YYYY-MM-DD') = $6)`;
    const params = [role || null, removed ? null : status || null, search ? escapeLike(search) : null, removed, month || null, date || null];
    const [{ count }] = await q(`SELECT count(*) FROM users WHERE ${where}`, params);
    const order = removed ? "deleted_at DESC" : status === "pending" ? "created_at" : "created_at DESC";
    const data = await q(`SELECT ${USER_COLUMNS} FROM users WHERE ${where} ORDER BY ${order}, id LIMIT $7 OFFSET $8`, [...params, size, offset]);
    return { data, total: count, page: number };
  },

  async submitCredentials(userId, payload) {
    return tx(async (run) => {
      const [user] = await run("SELECT status, is_banned FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user || user.is_banned) fail("Account unavailable.", 403);
      if (user.status === "approved") fail("Approved credentials cannot be changed here.", 409);
      if ((await run("SELECT 1 FROM users WHERE id <> $1 AND lower(campus_id) = lower($2)", [userId, payload.campus_id]))[0]) {
        fail("This campus ID is already registered.", 409);
      }
      return (await run(
        `UPDATE users SET campus_id = $2, affiliation = $3, department = $4, status = 'pending', review_note = '', campus = 'CSUCC'
         WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [userId, payload.campus_id, payload.affiliation, payload.department],
      ))[0];
    });
  },

  async reviewRegistration(userId, actorId, { status, note, credentials_checked }) {
    return tx(async (run) => {
      const [user] = await run("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user || user.role === "admin") fail("Registration not found.", 404);
      if (user.status !== "pending") fail("This registration has already been reviewed.", 409);
      if (status === "approved" && (!credentials_checked || !user.campus_id || !user.affiliation || !user.department)) {
        fail("Check complete credentials against CSUCC records before approving.");
      }
      const [updated] = await run(
        `UPDATE users SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [userId, status, note, actorId],
      );
      await audit(run, actorId, `registration.${status}`, userId, note);
      return updated;
    });
  },

  /** Blocks or unblocks any account, administrators included (never yourself, never the last admin manager). */
  async banUser(userId, ban, actorId) {
    return tx(async (run) => {
      const [user] = await run("SELECT role, deleted_at FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user || user.deleted_at) fail("User not found", 404);
      if (userId === actorId) fail("You can't block your own account.", 403);
      if (ban && user.role === "admin") await keepAnAdminManager(run, userId);
      const [updated] = await run(`UPDATE users SET is_banned = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`, [userId, Boolean(ban)]);
      if (ban) await closeSessions(run, userId, "blocked");
      await audit(run, actorId, ban ? "account.blocked" : "account.unblocked", userId);
      return updated;
    });
  },

  /** Saves the user's three recovery questions (answers hashed); the first also backs the sign-in fallback. */
  async setRecoveryQuestions(userId, currentPassword, questions) {
    const user = await q1("SELECT password_hash FROM users WHERE id = $1", [userId]);
    if (!user) fail("User not found", 404);
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) fail("Current password is incorrect.", 401);
    return q1(`UPDATE users SET recovery_questions = $2, security_question = $3, security_answer_hash = $4
               WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [userId, JSON.stringify(hashRecoveryQuestions(questions)), questions[0].question, bcrypt.hashSync(normalizeAnswer(questions[0].answer), 12)]);
  },

  // ── Forgot password: emailed code → 2 of 3 recovery answers → new password ──
  async resetAccount(email) {
    return q1("SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL", [email]);
  },

  /** Checks the emailed code without using it up, then reveals the account's question texts. */
  async checkResetCode(email, code) {
    await attemptCode(email, "reset", (row) => sameHash(row.code_hash, hashCode(code)), "That code isn't right.", { consume: false });
    const user = await q1("SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL", [email]);
    if (!user) fail("This code has expired. Send a new one.");
    const questions = recoveryQuestionsOf(user).map((item) => item.question);
    return { questions, answers_needed: Math.min(RECOVERY_ANSWERS_NEEDED, questions.length) };
  },

  /** Wrong answers spend the same 5-try budget as wrong codes. */
  async completeReset(email, code, answers, newPassword) {
    const user = await q1("SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL", [email]);
    if (!user) fail("This code has expired. Send a new one.");
    await attemptCode(email, "reset", (row) => sameHash(row.code_hash, hashCode(code)) && recoveryAnswersPass(user, answers),
      "Those answers don't match our records.");
    if (bcrypt.compareSync(newPassword, user.password_hash)) fail("Choose a password different from your current one.");
    return tx(async (run) => {
      await run(`UPDATE users SET password_hash = $2, password_changed_at = now(), failed_logins = 0, locked_until = NULL,
                 email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1`, [user.id, bcrypt.hashSync(newPassword, 12)]);
      await closeSessions(run, user.id, "password_reset");
      await audit(run, user.id, "password.reset", user.id, "Reset with emailed code and recovery questions");
    });
  },

  /** First sign-in of an admin created by another admin: real name, employee ID, own password, recovery questions. */
  async completeSetup(userId, { name, employee_id, new_password, security_questions }) {
    return tx(async (run) => {
      const [user] = await run("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user?.must_setup) fail("This account is already set up.", 409);
      if (bcrypt.compareSync(new_password, user.password_hash)) fail("Choose a new password — not the one you were given.");
      if ((await run("SELECT 1 FROM users WHERE id <> $1 AND lower(campus_id) = lower($2)", [userId, employee_id]))[0]) {
        fail("This employee ID is already used by another account.", 409);
      }
      const [updated] = await run(
        `UPDATE users SET name = $2, campus_id = $3, password_hash = $4, password_changed_at = now(), must_setup = FALSE,
                recovery_questions = $5, security_question = $6, security_answer_hash = $7, affiliation = 'employee',
                email_verified_at = coalesce(email_verified_at, now())
         WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [userId, name, employee_id, bcrypt.hashSync(new_password, 12), JSON.stringify(hashRecoveryQuestions(security_questions)),
          security_questions[0].question, bcrypt.hashSync(normalizeAnswer(security_questions[0].answer), 12)],
      );
      // The sign-in that led here was logged under the placeholder name; show the real one.
      await run("UPDATE login_logs SET full_name = $2, id_no = $3 WHERE user_id = $1 AND time_out IS NULL", [userId, name, employee_id]);
      await audit(run, userId, "admin.setup_completed", userId);
      return updated;
    });
  },
};

// ── Sign-in sessions and login logs ───────────────────────────────────────────
const closeSessions = (run, userId, reason) =>
  run("UPDATE login_logs SET time_out = now(), end_reason = $2 WHERE user_id = $1 AND time_out IS NULL", [userId, reason]);

/** Philippine time (UTC+8, no daylight saving) for date filters; avoids relying on the database's time zone files. */
const manilaTime = (column) => `((${column} AT TIME ZONE 'UTC') + interval '8 hours')`;

/** Refuses a change that would leave no active administrator able to manage admins. */
const keepAnAdminManager = async (run, excludingId) => {
  const [{ count }] = await run(
    `SELECT count(*) FROM users WHERE role = 'admin' AND id <> $1 AND deleted_at IS NULL AND NOT is_banned
       AND (permissions IS NULL OR permissions ? 'admins')`, [excludingId]);
  if (!count) fail("Keep at least one active administrator who can manage admins.", 409);
};

export const sessionStore = {
  /** Records a sign-in and returns its id (carried in the session's tokens as `sid`). */
  async start(user, { ip = null, userAgent = null } = {}) {
    const [row] = await q(
      `INSERT INTO login_logs (user_id, id_no, full_name, role, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [user.id, user.campus_id || user.username || null, user.name, user.role, ip, userAgent ? String(userAgent).slice(0, 300) : null],
    );
    await q("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    return row.id;
  },

  /** True while the sign-in hasn't been closed by logout, a block, a password reset or the end of a shift. */
  async isOpen(sid, userId) {
    return Boolean(await q1("SELECT 1 FROM login_logs WHERE id = $1 AND user_id = $2 AND time_out IS NULL", [sid, userId]));
  },

  async touch(sid, userId) {
    await q("UPDATE login_logs SET last_seen_at = now() WHERE id = $1 AND user_id = $2 AND time_out IS NULL", [sid, userId]);
  },

  async end(sid, userId, reason = "logout") {
    await q("UPDATE login_logs SET time_out = now(), end_reason = $3 WHERE id = $1 AND user_id = $2 AND time_out IS NULL", [sid, userId, reason]);
  },

  async endAll(userId, reason) {
    await closeSessions(q, userId, reason);
  },

  /** Every other sign-in of this user (e.g. after a password change on this device). */
  async endOthers(userId, keepSid, reason) {
    await q("UPDATE login_logs SET time_out = now(), end_reason = $3 WHERE user_id = $1 AND id IS DISTINCT FROM $2 AND time_out IS NULL",
      [userId, keepSid, reason]);
  },

  /** Login log page. `userId` limits it to one person (what non-admins see). */
  async list({ userId = null, role, month, date, q: search, page = 1, limit = 20 } = {}) {
    const { size, number, offset } = pageParams(page, limit);
    const day = manilaTime("time_in");
    const where = `($1::text IS NULL OR user_id = $1) AND ($2::text IS NULL OR role = $2)
      AND ($3::text IS NULL OR to_char(${day}, 'YYYY-MM') = $3) AND ($4::text IS NULL OR to_char(${day}, 'YYYY-MM-DD') = $4)
      AND ($5::text IS NULL OR concat_ws(' ', full_name, id_no) ILIKE '%' || $5 || '%')`;
    const params = [userId, role || null, month || null, date || null, search ? escapeLike(search) : null];
    const [{ count }] = await q(`SELECT count(*) FROM login_logs WHERE ${where}`, params);
    const data = await q(
      `SELECT id, user_id, id_no, full_name, role, time_in, time_out, last_seen_at, end_reason, ip, user_agent
       FROM login_logs WHERE ${where} ORDER BY time_in DESC, id LIMIT $6 OFFSET $7`, [...params, size, offset]);
    return { data, total: count, page: number };
  },

  /** Admin actions (approvals, blocks, removals, admin changes) with who did them. */
  async activity({ month, date, q: search, page = 1, limit = 20 } = {}) {
    const { size, number, offset } = pageParams(page, limit);
    const day = manilaTime("a.created_at");
    const where = `($1::text IS NULL OR to_char(${day}, 'YYYY-MM') = $1) AND ($2::text IS NULL OR to_char(${day}, 'YYYY-MM-DD') = $2)
      AND ($3::text IS NULL OR concat_ws(' ', a.action, a.note, actor.name, target.name, target.email) ILIKE '%' || $3 || '%')`;
    const from = "FROM audit_log a LEFT JOIN users actor ON actor.id = a.actor_id LEFT JOIN users target ON target.id = a.target_id";
    const params = [month || null, date || null, search ? escapeLike(search) : null];
    const [{ count }] = await q(`SELECT count(*) ${from} WHERE ${where}`, params);
    const data = await q(
      `SELECT a.id, a.action, a.note, a.created_at, a.actor_id, actor.name AS actor_name, actor.campus_id AS actor_id_no,
              a.target_id, target.name AS target_name, target.email AS target_email
       ${from} WHERE ${where} ORDER BY a.created_at DESC, a.id LIMIT $4 OFFSET $5`, [...params, size, offset]);
    return { data, total: count, page: number };
  },
};

// ── Administrators and account management ────────────────────────────────────
const cleanPermissions = (permissions) => (permissions == null ? null : [...new Set(permissions)].filter((p) => PERMISSION_KEYS.includes(p)));
const grants = (permissions, key) => permissions == null || permissions.includes(key);

/** Unique email / username / ID number checks shared by create and edit. */
const assertAccountUnique = async (run, { id = null, email, username, campus_id }) => {
  if (email && (await run("SELECT 1 FROM users WHERE email = $1 AND id IS DISTINCT FROM $2", [email, id]))[0]) fail("This email already has an account.", 409);
  if (username && (await run("SELECT 1 FROM users WHERE lower(username) = lower($1) AND id IS DISTINCT FROM $2", [username, id]))[0]) {
    fail("This username is taken.", 409);
  }
  if (campus_id && (await run("SELECT 1 FROM users WHERE lower(campus_id) = lower($1) AND id IS DISTINCT FROM $2", [campus_id, id]))[0]) {
    fail("This ID number is already used by another account.", 409);
  }
};

export const staffStore = {
  async list() {
    return q(`SELECT ${USER_COLUMNS} FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at, id`);
  },

  /** Creates an admin with a starter password; they finish their details at the first sign-in. */
  async create(actorId, { name, username, email, employee_id = null, shift_start = null, shift_end = null, permissions = null }) {
    const password = generateStarterPassword();
    return tx(async (run) => {
      await assertAccountUnique(run, { email, username, campus_id: employee_id });
      const [user] = await run(
        `INSERT INTO users (name, email, username, password_hash, role, status, campus, campus_id, affiliation,
                            shift_start, shift_end, permissions, must_setup, created_by)
         VALUES ($1, $2, $3, $4, 'admin', 'approved', 'CSUCC', $5, 'employee', $6, $7, $8, TRUE, $9) RETURNING ${USER_COLUMNS}`,
        [name || username, email, username, bcrypt.hashSync(password, 12), employee_id, shift_start, shift_end,
          permissions == null ? null : JSON.stringify(cleanPermissions(permissions)), actorId],
      );
      await audit(run, actorId, "admin.created", user.id, `${username} · ${email}`);
      return { user, password };
    });
  },

  async update(actorId, adminId, changes) {
    return tx(async (run) => {
      const [admin] = await run("SELECT * FROM users WHERE id = $1 AND role = 'admin' AND deleted_at IS NULL FOR UPDATE", [adminId]);
      if (!admin) fail("Administrator not found.", 404);
      const next = { ...changes, campus_id: changes.employee_id };
      await assertAccountUnique(run, { id: adminId, email: next.email, username: next.username, campus_id: next.campus_id });
      if (next.permissions !== undefined) {
        next.permissions = cleanPermissions(next.permissions);
        if (!grants(next.permissions, "admins") && grants(admin.permissions, "admins")) await keepAnAdminManager(run, adminId);
      }
      const fields = ["name", "email", "username", "campus_id", "shift_start", "shift_end", "permissions"].filter((key) => next[key] !== undefined);
      if (!fields.length) return (await run(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [adminId]))[0];
      const values = fields.map((key) => (key === "permissions" && next[key] != null ? JSON.stringify(next[key]) : next[key]));
      const [updated] = await run(
        `UPDATE users SET ${fields.map((key, i) => `${key} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [adminId, ...values],
      );
      // A new shift applies from the next request; close the sign-in if it's now off duty.
      if (!isOnShift(updated)) await closeSessions(run, adminId, "shift_changed");
      await audit(run, actorId, "admin.updated", adminId, `Changed ${fields.map((key) => key.replace("campus_id", "employee ID").replace("_", " ")).join(", ")}`);
      return updated;
    });
  },

  /** New starter password; the admin repeats the first-login setup. Signs them out everywhere. */
  async resetPassword(actorId, adminId) {
    const password = generateStarterPassword();
    return tx(async (run) => {
      const [user] = await run(
        `UPDATE users SET password_hash = $2, password_changed_at = now(), must_setup = TRUE, failed_logins = 0, locked_until = NULL
         WHERE id = $1 AND role = 'admin' AND deleted_at IS NULL RETURNING ${USER_COLUMNS}`,
        [adminId, bcrypt.hashSync(password, 12)],
      );
      if (!user) fail("Administrator not found.", 404);
      await closeSessions(run, adminId, "password_reset");
      await audit(run, actorId, "admin.password_reset", adminId);
      return { user, password };
    });
  },
};

export const accountStore = {
  /** Admin edit of anyone's details. Changing an ID number on an approved account keeps it approved — the admin vouches for it. */
  async update(actorId, userId, changes) {
    return tx(async (run) => {
      const [user] = await run("SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [userId]);
      if (!user) fail("User not found", 404);
      await assertAccountUnique(run, { id: userId, email: changes.email, campus_id: changes.campus_id });
      const fields = ["name", "email", "campus_id", "affiliation", "department"].filter((key) => changes[key] !== undefined);
      if (!fields.length) return (await run(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]))[0];
      const [updated] = await run(
        `UPDATE users SET ${fields.map((key, i) => `${key} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [userId, ...fields.map((key) => changes[key])],
      );
      await audit(run, actorId, "account.updated", userId, `Changed ${fields.map((key) => key.replace("campus_id", "ID number")).join(", ")}`);
      return updated;
    });
  },

  /** Removes an account from the platform but keeps the record (and its orders) with the reason. */
  async remove(actorId, userId, reason) {
    return tx(async (run) => {
      const [user] = await run("SELECT role, deleted_at FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!user || user.deleted_at) fail("User not found", 404);
      if (userId === actorId) fail("You can't remove your own account.", 403);
      if (user.role === "admin") await keepAnAdminManager(run, userId);
      const [updated] = await run(
        `UPDATE users SET deleted_at = now(), deleted_by = $2, delete_reason = $3, is_banned = TRUE WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [userId, actorId, reason],
      );
      await closeSessions(run, userId, "removed");
      await audit(run, actorId, "account.removed", userId, reason);
      return updated;
    });
  },

  async restore(actorId, userId) {
    return tx(async (run) => {
      const [updated] = await run(
        `UPDATE users SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, is_banned = FALSE
         WHERE id = $1 AND deleted_at IS NOT NULL RETURNING ${USER_COLUMNS}`, [userId]);
      if (!updated) fail("Removed account not found.", 404);
      await audit(run, actorId, "account.restored", userId);
      return updated;
    });
  },
};

// Used when an email doesn't exist, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 12);

// ── Stalls ────────────────────────────────────────────────────────────────────
const getStallDetails = async (run, where, params) =>
  withPlan((await run(`${STALL_SELECT} WHERE ${where}`, params))[0] ?? null);

const insertStall = async (run, ownerId, payload) => {
  if ((await run("SELECT 1 FROM stalls WHERE owner_id = $1", [ownerId]))[0]) fail("You already have a stall", 409);
  const [stall] = await run(
    `INSERT INTO stalls (owner_id, name, description, banner_url, location, logo_url, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ownerId, payload.name, payload.description || "", payload.banner_url || "", payload.location, payload.logo_url || "", payload.category || "other"],
  );
  return getStallDetails(run, "s.id = $1", [stall.id]);
};

export const stallStore = {
  async listStalls({ q: search = "", status, activeOnly = false } = {}) {
    const rows = await q(
      `${STALL_SELECT}
       WHERE ($1::text IS NULL OR s.status = $1) AND (NOT $2 OR s.is_active)
         AND ($3::text IS NULL OR (s.name || ' ' || s.location) ILIKE '%' || $3 || '%')
       ORDER BY s.created_at, s.id`,
      [status || null, Boolean(activeOnly), search ? escapeLike(search) : null],
    );
    return rows.map(withPlan);
  },

  async getById(stallId) {
    const stall = await getStallDetails(q, "s.id = $1", [stallId]);
    if (!stall) fail("Stall not found", 404);
    return stall;
  },

  async getMy(ownerId) {
    return getStallDetails(q, "s.owner_id = $1", [ownerId]);
  },

  async create(ownerId, payload) {
    return tx((run) => insertStall(run, ownerId, payload));
  },

  async update(stallId, ownerId, payload) {
    return tx(async (run) => {
      const [stall] = await run("SELECT owner_id FROM stalls WHERE id = $1 FOR UPDATE", [stallId]);
      if (!stall) fail("Stall not found", 404);
      if (stall.owner_id !== ownerId) fail("Forbidden", 403);
      const allowed = ["name", "description", "banner_url", "logo_url", "location", "category", "contact_number", "operating_hours", "is_active"];
      const params = [stallId];
      const sets = [];
      for (const key of allowed) {
        if (payload[key] === undefined) continue;
        params.push(payload[key]);
        sets.push(`${key} = $${params.length}`);
      }
      if (sets.length) await run(`UPDATE stalls SET ${sets.join(", ")} WHERE id = $1`, params);
      // Only approved stalls may be visible.
      await run("UPDATE stalls SET is_active = FALSE WHERE id = $1 AND status <> 'approved'", [stallId]);
      return getStallDetails(run, "s.id = $1", [stallId]);
    });
  },

  /**
   * Set or clear (url = "") the owner's stall logo or cover photo.
   * Returns the updated stall and the replaced URL, so the caller can delete the old file.
   */
  async setBranding(ownerId, field, url) {
    if (!["logo_url", "banner_url"].includes(field)) fail("Unknown stall image.");
    return tx(async (run) => {
      const [stall] = await run(`SELECT id, ${field} AS previous FROM stalls WHERE owner_id = $1 FOR UPDATE`, [ownerId]);
      if (!stall) fail("Create your stall first.", 404);
      await run(`UPDATE stalls SET ${field} = $2 WHERE id = $1`, [stall.id, url]);
      return { stall: await getStallDetails(run, "s.id = $1", [stall.id]), previous: stall.previous };
    });
  },

  /** Admin switch: Free, Premium (optionally until a date), or a new end date for a Premium stall. The seller is told. */
  async setPlan(stallId, { tier, premium_until = null, note = "" }, actorId) {
    return tx(async (run) => {
      const [stall] = await run("SELECT id, owner_id, tier, premium_until FROM stalls WHERE id = $1 FOR UPDATE", [stallId]);
      if (!stall) fail("Stall not found.", 404);
      if (!["free", "premium"].includes(tier)) fail("Invalid plan.");
      const until = tier === "premium" ? endOfDay(premium_until) : null;
      const extending = tier === "premium" && stall.tier === "premium";
      const hidden = await changeTier(run, stallId, tier, until);
      const adminNote = note ? ` Note from the admin: ${note}` : "";
      if (tier === "premium") {
        // A manual switch settles any request that was waiting.
        await run(`UPDATE plan_requests SET status = 'approved', reviewed_by = $2, reviewed_at = now(), premium_until = $3,
                   review_note = 'Switched to Premium in Stores & Plans' WHERE stall_id = $1 AND status = 'pending'`, [stallId, actorId, until]);
        const ends = until ? `until ${formatDay(until)}` : "with no end date";
        if (extending) {
          await insertPlanNotification(run, stall.owner_id, "plan_extended", "Your Premium plan was updated", `Your stall stays on Premium ${ends}.${adminNote}`);
        } else {
          await insertPlanNotification(run, stall.owner_id, "plan_approved", "Your stall is now Premium 🎉",
            `An administrator moved your stall to Premium ${ends}: up to 25 listings, analytics, the point of sale and featured products.${adminNote}`);
        }
      } else if (stall.tier === "premium") {
        await insertPlanNotification(run, stall.owner_id, "plan_downgraded", "Your stall is now on Free",
          `An administrator moved your stall to the Free plan.${hiddenListingsNote(hidden)}${adminNote}`);
      }
      await audit(run, actorId, extending ? "stall.plan_extended" : "stall.plan", stallId,
        [tier, until && `until ${until.slice(0, 10)}`, hidden.length && `${hidden.length} hidden`].filter(Boolean).join(" · "));
      return getStallDetails(run, "s.id = $1", [stallId]);
    });
  },

  async updateStatus(stallId, status) {
    return tx(async (run) => {
      const [stall] = await run("SELECT owner_id FROM stalls WHERE id = $1 FOR UPDATE", [stallId]);
      if (!stall) fail("Stall not found", 404);
      if (!["approved", "rejected", "suspended"].includes(status)) fail("Invalid stall status.");
      if (status === "approved" && !(await isApprovedUser(run, stall.owner_id))) fail("Approve the owner's campus registration first.", 403);
      await run("UPDATE stalls SET status = $2, is_active = ($2 = 'approved') WHERE id = $1", [stallId, status]);
      return getStallDetails(run, "s.id = $1", [stallId]);
    });
  },
};

// ── Products ──────────────────────────────────────────────────────────────────
// Whitelisted ORDER BY clauses for ?sort= (never interpolate user input).
const PRODUCT_SORTS = {
  default: "p.created_at, p.id",
  newest: "p.created_at DESC, p.id",
  price_asc: "p.price, p.id",
  price_desc: "p.price DESC, p.id",
  popular: "p.view_count DESC, p.created_at DESC, p.id",
};

/** Load the given product IDs that are publicly visible, keeping the given order. */
const visibleProductsInOrder = async (ids, limit) => {
  if (!ids.length) return [];
  const rows = await q(`${PRODUCT_SELECT} WHERE p.id = ANY($1) AND p.is_active AND ${PUBLIC_STALL}`, [ids]);
  return ids.map((id) => rows.find((row) => row.id === id)).filter(Boolean).slice(0, limit);
};

export const productStore = {
  async listProducts({
    q: search = "", category, page = 1, limit = 20, stallId,
    activeOnly = true, publicOnly = true, featured = false, min_price, max_price,
    sort, location, openNow = false,
  } = {}) {
    const { size, number, offset } = pageParams(page, limit);
    const params = [
      Boolean(publicOnly), Boolean(activeOnly),
      min_price == null || min_price === "" ? null : Number(min_price),
      max_price == null || max_price === "" ? null : Number(max_price),
      Boolean(featured), category || null, stallId || null,
      search ? escapeLike(search) : null,
      location || null,
    ];
    const where = `(NOT $1 OR (${PUBLIC_STALL})) AND (NOT $2 OR p.is_active)
      AND ($3::numeric IS NULL OR p.price >= $3) AND ($4::numeric IS NULL OR p.price <= $4)
      AND (NOT $5 OR (s.tier = 'premium' AND p.is_featured)) AND ($6::text IS NULL OR p.category = $6)
      AND ($7::text IS NULL OR p.stall_id = $7)
      AND ($8::text IS NULL OR (p.name || ' ' || p.description || ' ' || s.name) ILIKE '%' || $8 || '%')
      AND ($9::text IS NULL OR s.location = $9)`;
    const order = PRODUCT_SORTS[sort] || PRODUCT_SORTS.default;
    const from = "FROM products p JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id";
    if (openNow) {
      // Opening hours are free text, so "open now" is decided in JS (campus time) before paging.
      const rows = (await q(`${PRODUCT_SELECT} WHERE ${where} ORDER BY ${order}`, params)).filter((row) => isStallOpen(row.stalls));
      return { data: rows.slice(offset, offset + size), total: rows.length, page: number };
    }
    const [{ count }] = await q(`SELECT count(*) ${from} WHERE ${where}`, params);
    const data = await q(`${PRODUCT_SELECT} WHERE ${where} ORDER BY ${order} LIMIT $10 OFFSET $11`, [...params, size, offset]);
    return { data, total: count, page: number };
  },

  /** Distinct pickup locations of public stalls, for the Browse filter. */
  async listLocations() {
    const rows = await q(`SELECT DISTINCT s.location FROM stalls s LEFT JOIN users o ON o.id = s.owner_id
      WHERE ${PUBLIC_STALL} AND s.location <> '' ORDER BY s.location`);
    return rows.map((row) => row.location);
  },

  async getById(productId, actor, { countView = true } = {}) {
    const product = await q1(`${PRODUCT_SELECT} WHERE p.id = $1`, [productId]);
    if (!product) fail("Product not found", 404);
    const visible = await q1(`SELECT 1 FROM stalls s LEFT JOIN users o ON o.id = s.owner_id WHERE s.id = $1 AND ${PUBLIC_STALL}`, [product.stall_id]);
    if ((!product.is_active || !visible) && actor?.role !== "admin" && actor?.id !== product.stalls.owner_id) fail("Product not found.", 404);
    const reviews = await q(`${REVIEW_SELECT} WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [productId]);
    // Previews (e.g. the product pinned in a chat) don't count as views.
    if (!countView) return { ...product, reviews };
    const [{ view_count }] = await q("UPDATE products SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count", [productId]);
    return { ...product, reviews, view_count };
  },

  async create(stallId, payload) {
    return tx(async (run) => {
      // Lock the stall so two simultaneous creates can't both slip under the plan limit.
      const [stall] = await run("SELECT * FROM stalls WHERE id = $1 FOR UPDATE", [stallId]);
      if (!stall) fail("Stall not found", 404);
      if (stall.status !== "approved" || !(await isApprovedUser(run, stall.owner_id))) fail("An approved store and account are required.", 403);
      const plan = getPlan(stall.tier);
      const [{ count }] = await run("SELECT count(*) FROM products WHERE stall_id = $1", [stallId]);
      if (count >= plan.listing_limit) fail(`${plan.name} plan limit of ${plan.listing_limit} listings reached`, 403);
      const [product] = await run(
        `INSERT INTO products (stall_id, name, description, price, stock, category, image_url, is_active, sale_price, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [stallId, payload.name, payload.description || "", Number(payload.price), Number(payload.stock),
          payload.category || "other", payload.image_url || "", payload.is_active !== false,
          checkedSalePrice(payload.sale_price, payload.price), JSON.stringify(payload.images || [])],
      );
      if (payload.options?.length) await saveOptions(run, product.id, payload.options);
      // Free stalls hear about Premium as they run out of listing slots.
      if (stall.tier !== "premium") {
        if (count + 1 === plan.listing_limit - 1) await nudgeSeller(run, stall.owner_id, "listings_almost");
        if (count + 1 >= plan.listing_limit) await nudgeSeller(run, stall.owner_id, "listings_full");
      }
      return { ...product, stalls: stall };
    });
  },

  async update(productId, payload, actor) {
    return tx(async (run) => {
      const [product] = await run(
        `SELECT p.id, p.stall_id, p.is_active, s.owner_id, s.tier FROM products p JOIN stalls s ON s.id = p.stall_id
         WHERE p.id = $1 FOR UPDATE OF p, s`, [productId]);
      if (!product) fail("Product not found", 404);
      if (actor?.role !== "admin" && actor?.id !== product.owner_id) fail("You can only edit your own products.", 403);
      if (payload.is_active === true && !product.is_active) {
        const plan = getPlan(product.tier);
        const [{ count }] = await run("SELECT count(*)::int AS count FROM products WHERE stall_id = $1 AND is_active", [product.stall_id]);
        if (count >= plan.listing_limit) fail(`The ${plan.name} plan shows up to ${plan.listing_limit} products. Hide another product first.`, 403);
      }
      const params = [productId];
      const sets = [];
      for (const key of ["name", "description", "price", "stock", "category", "image_url", "is_active"]) {
        if (payload[key] === undefined) continue;
        params.push(payload[key]);
        sets.push(`${key} = $${params.length}`);
      }
      if (payload.sale_price !== undefined) {
        const [{ price }] = await run("SELECT price FROM products WHERE id = $1", [productId]);
        params.push(checkedSalePrice(payload.sale_price, payload.price ?? price));
        sets.push(`sale_price = $${params.length}`);
      }
      if (payload.images !== undefined) {
        params.push(JSON.stringify(payload.images));
        sets.push(`images = $${params.length}::jsonb`);
      }
      // Showing or hiding by hand ends any plan hiding; a hidden product can't stay featured.
      if (payload.is_active !== undefined) sets.push("hidden_by_plan = FALSE");
      if (payload.is_active === false) sets.push("is_featured = FALSE");
      if (sets.length) await run(`UPDATE products SET ${sets.join(", ")} WHERE id = $1`, params);
      if (payload.options !== undefined) await saveOptions(run, productId, payload.options);
      // A lowered regular price can't sit under an old sale price.
      await run("UPDATE products SET sale_price = NULL WHERE id = $1 AND sale_price >= price", [productId]);
      return (await run(`${PRODUCT_SELECT} WHERE p.id = $1`, [productId]))[0];
    });
  },

  /** Premium stalls pick up to `featured_limit` visible products for the buyer home page. */
  async setFeatured(productId, featured, actor) {
    return tx(async (run) => {
      const [product] = await run(
        `SELECT p.id, p.stall_id, p.is_active, s.owner_id, s.tier FROM products p JOIN stalls s ON s.id = p.stall_id
         WHERE p.id = $1 FOR UPDATE OF p, s`, [productId]);
      if (!product) fail("Product not found", 404);
      if (actor?.role !== "admin" && actor?.id !== product.owner_id) fail("You can only feature your own products.", 403);
      if (featured) {
        const plan = getPlan(product.tier);
        if (!plan.featured_limit) fail("Featured products are included in Premium. Request Premium from the Plans page.", 403);
        if (!product.is_active) fail("Show this product to buyers before featuring it.", 409);
        const [{ count }] = await run("SELECT count(*)::int AS count FROM products WHERE stall_id = $1 AND is_featured AND id <> $2", [product.stall_id, productId]);
        if (count >= plan.featured_limit) fail(`You can feature up to ${plan.featured_limit} products. Stop featuring one first.`, 409);
      }
      await run("UPDATE products SET is_featured = $2 WHERE id = $1", [productId, Boolean(featured)]);
      return (await run(`${PRODUCT_SELECT} WHERE p.id = $1`, [productId]))[0];
    });
  },

  /**
   * After a move to Free: the seller picks which products stay visible. Picked ones are shown;
   * other visible or plan-hidden ones are hidden (and come back on Premium). Ones the seller hid stay hidden.
   */
  async chooseVisible(ownerId, productIds) {
    return tx(async (run) => {
      const [stall] = await run("SELECT id, tier FROM stalls WHERE owner_id = $1 FOR UPDATE", [ownerId]);
      if (!stall) fail("Create your stall first.", 404);
      const plan = getPlan(stall.tier);
      const ids = [...new Set(productIds.map(String))];
      if (ids.length > plan.listing_limit) fail(`Pick up to ${plan.listing_limit} products.`);
      const owned = await run("SELECT id FROM products WHERE stall_id = $1 AND id = ANY($2)", [stall.id, ids]);
      if (owned.length !== ids.length) fail("Pick products from your own stall.", 403);
      await run(
        `UPDATE products SET
           is_active = (id = ANY($2)),
           hidden_by_plan = NOT (id = ANY($2)),
           is_featured = is_featured AND id = ANY($2)
         WHERE stall_id = $1 AND (id = ANY($2) OR is_active OR hidden_by_plan)`,
        [stall.id, ids],
      );
      return run(`${PRODUCT_SELECT} WHERE p.stall_id = $1 ORDER BY p.created_at DESC`, [stall.id]);
    });
  },

  async remove(productId, actor) {
    const product = await q1("SELECT s.owner_id FROM products p JOIN stalls s ON s.id = p.stall_id WHERE p.id = $1", [productId]);
    if (!product) fail("Product not found", 404);
    if (actor?.role !== "admin" && actor?.id !== product.owner_id) fail("You can only delete your own products.", 403);
    await q("DELETE FROM products WHERE id = $1", [productId]);
    return true;
  },

  // AI suggestions first (visible products only, in AI order), topped up by simple rules.
  async getRecommendations(userId) {
    const limit = 8;
    const picked = await visibleProductsInOrder(await getRecommendedProductIds(userId, limit), limit);
    if (picked.length >= limit) return picked;
    const fallback = await q(
      `${PRODUCT_SELECT} WHERE p.is_active AND ${PUBLIC_STALL} AND NOT (p.id = ANY($1))
       ORDER BY p.view_count DESC, p.created_at, p.id LIMIT $2`,
      [picked.map((product) => product.id), limit - picked.length],
    );
    return [...picked, ...fallback];
  },

  async getSimilar(productId) {
    const limit = 4;
    const picked = await visibleProductsInOrder((await getSimilarProductIds(productId, limit)).filter((id) => id !== productId), limit);
    if (picked.length >= limit) return picked;
    const fallback = await q(
      `${PRODUCT_SELECT}
       WHERE p.is_active AND ${PUBLIC_STALL} AND p.id <> $1 AND NOT (p.id = ANY($2))
         AND p.category = (SELECT category FROM products WHERE id = $1)
       ORDER BY p.created_at, p.id LIMIT $3`,
      [productId, picked.map((product) => product.id), limit - picked.length],
    );
    return [...picked, ...fallback];
  },
};

// ── Cart ──────────────────────────────────────────────────────────────────────
const assertQuantity = (quantity) => {
  if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) fail("Quantity must be a positive whole number.");
  return Number(quantity);
};

export const cartStore = {
  async list(userId) {
    return q(
      `SELECT c.id, c.user_id, c.product_id, c.option_id, po.label AS option_label, po.stock AS option_stock, c.quantity, to_jsonb(p) AS products
       FROM cart_items c LEFT JOIN products p ON p.id = c.product_id LEFT JOIN product_options po ON po.id = c.option_id
       WHERE c.user_id = $1 ORDER BY c.created_at, c.id`,
      [userId],
    );
  },

  async add(userId, productId, quantity = 1, optionId = null) {
    return tx(async (run) => {
      const [product] = await run(
        `SELECT p.*, (p.is_active AND ${PUBLIC_STALL}) AS available FROM products p
         JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id WHERE p.id = $1`, [productId || null]);
      if (!product) fail("Product not found", 404);
      if (!product.available) fail("Product is unavailable.", 409);
      const amount = assertQuantity(quantity);
      const option = pickOption(product, await run("SELECT * FROM product_options WHERE product_id = $1", [productId]), optionId || null);
      const [existing] = await run(
        "SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 AND coalesce(option_id, '') = coalesce($3, '') FOR UPDATE",
        [userId, productId, option?.id || null]);
      if ((existing?.quantity || 0) + amount > (option ? option.stock : product.stock)) fail("Insufficient stock.", 409);
      const [entry] = existing
        ? await run("UPDATE cart_items SET quantity = quantity + $2 WHERE id = $1 RETURNING id, user_id, product_id, option_id, quantity", [existing.id, amount])
        : await run("INSERT INTO cart_items (user_id, product_id, option_id, quantity) VALUES ($1, $2, $3, $4) RETURNING id, user_id, product_id, option_id, quantity",
          [userId, productId, option?.id || null, amount]);
      const { available: _, ...products } = product;
      return { ...entry, products };
    });
  },

  async update(userId, itemId, quantity) {
    return tx(async (run) => {
      const [entry] = await run("SELECT product_id, option_id FROM cart_items WHERE id = $1 AND user_id = $2 FOR UPDATE", [itemId, userId]);
      if (!entry) fail("Cart item not found", 404);
      const amount = assertQuantity(quantity);
      const [product] = await run(
        `SELECT coalesce((SELECT stock FROM product_options WHERE id = $2), p.stock) AS stock
         FROM products p JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id
         WHERE p.id = $1 AND p.is_active AND ${PUBLIC_STALL}`, [entry.product_id, entry.option_id]);
      if (!product || amount > product.stock) fail("Product or quantity unavailable.", 409);
      return (await run("UPDATE cart_items SET quantity = $2 WHERE id = $1 RETURNING id, user_id, product_id, option_id, quantity", [itemId, amount]))[0];
    });
  },

  async remove(userId, itemId) {
    const removed = await q("DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id", [itemId, userId]);
    if (!removed.length) fail("Cart item not found", 404);
    return true;
  },

  async clear(userId) {
    await q("DELETE FROM cart_items WHERE user_id = $1", [userId]);
    return true;
  },
};

// ── Orders ────────────────────────────────────────────────────────────────────
const ORDER_COLUMNS = "id, buyer_id, seller_id, stall_id, total, status, delivery_notes, fulfillment, delivery_address, buyer_phone, pickup_code, ready_by, cancelled_at, cancel_reason, created_at";
/** The pickup code is the buyer's proof of collection, so sellers never receive it. */
const withoutPickupCode = ({ pickup_code, ...order }) => ({ ...order, has_pickup_code: Boolean(pickup_code) });
const HANDOVER_STATUSES = new Set(["completed", "delivered"]);

/** Attach items (purchase-time snapshots) to order rows. */
const attachOrderItems = async (run, orders) => {
  if (!orders.length) return [];
  const items = await run(
    "SELECT order_id, product_id, option_id, option_label, name, image_url, quantity, unit_price FROM order_items WHERE order_id = ANY($1) ORDER BY id",
    [orders.map((order) => order.id)],
  );
  return orders.map((order) => ({
    ...order,
    items: items.filter((item) => item.order_id === order.id).map(({ order_id: _, ...item }) => item),
  }));
};

const listOrders = async (where, params) => {
  const orders = await q(
    `SELECT o.*, b.name AS buyer_name, CASE WHEN st.id IS NULL THEN NULL ELSE json_build_object('id', st.id, 'name', st.name, 'location', st.location) END AS stall
     FROM orders o LEFT JOIN stalls st ON st.id = o.stall_id LEFT JOIN users b ON b.id = o.buyer_id WHERE ${where} ORDER BY o.created_at DESC, o.id`,
    params,
  );
  const withItems = await attachOrderItems(q, orders);
  const productIds = [...new Set(withItems.flatMap((order) => order.items.map((item) => item.product_id)))];
  const products = productIds.length ? await q("SELECT id, name, image_url FROM products WHERE id = ANY($1)", [productIds]) : [];
  return withItems.map((order) => {
    const deadline = cancellationDeadline(order);
    return {
      ...order,
      cancellation_deadline: deadline === null ? null : new Date(deadline).toISOString(),
      can_cancel: canBuyerCancel(order),
      items: order.items.map((item) => {
        const product = products.find((entry) => entry.id === item.product_id);
        return {
          ...item,
          product: {
            id: item.product_id,
            name: item.name || product?.name || "Item details unavailable",
            image_url: item.image_url ?? product?.image_url ?? null,
          },
        };
      }),
    };
  });
};

const ORDER_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "ready", "cancelled"],
  preparing: ["ready"],
  ready: ["completed", "delivered"],
};

export const orderStore = {
  async create(buyerId, items, deliveryNotes = "", fulfillment = "pickup", deliveryAddress = null) {
    return tx(async (run) => {
      if (!(await isApprovedUser(run, buyerId))) fail("An approved buyer account is required.", 403);
      const [buyer] = await run("SELECT phone, address FROM users WHERE id = $1", [buyerId]);
      // Delivery goes to the location given at checkout, or the one saved in the buyer's profile.
      const address = String(deliveryAddress ?? buyer.address ?? "").trim();
      if (fulfillment === "delivery" && !address) fail("Add a campus delivery location, or choose pickup.");
      const productIds = [...new Set(items.map((item) => item.product_id))];
      // Lock the product rows until commit so concurrent orders can't oversell.
      const products = await run(
        `SELECT p.*, s.owner_id, (p.is_active AND ${PUBLIC_STALL}) AS available
         FROM products p JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id
         WHERE p.id = ANY($1) ORDER BY p.id FOR UPDATE OF p`,
        [productIds],
      );
      if (products.length !== productIds.length) fail("One or more products were not found", 404);

      const options = await run("SELECT * FROM product_options WHERE product_id = ANY($1) ORDER BY id FOR UPDATE", [productIds]);
      // One entry per product/option line, with the total asked for.
      const requested = new Map();
      for (const item of items) {
        const product = products.find((entry) => entry.id === item.product_id);
        if (!product) continue;
        const option = pickOption(product, options, item.option_id || null);
        const key = `${product.id}:${option?.id || ""}`;
        const line = requested.get(key) || { product, option, quantity: 0 };
        line.quantity += item.quantity;
        requested.set(key, line);
      }
      for (const product of products) if (!product.available) fail("A selected product is no longer available.", 409);
      for (const { product, option, quantity } of requested.values()) {
        if ((option ? option.stock : product.stock) < quantity) fail(`Insufficient stock for ${lineName(product, option)}.`, 409);
      }
      const sellers = new Set(products.map((product) => product.owner_id));
      if (sellers.size !== 1) fail("Place a separate order for each store.");

      const lines = [...requested.values()].map(({ product, option, quantity }) => ({
        product_id: product.id, option_id: option?.id || null, option_label: option?.label || null,
        name: lineName(product, option), image_url: product.image_url || null, quantity, unit_price: unitPrice(product),
      }));
      // Sum in cents to avoid floating-point drift (e.g. 0.1 + 0.2)
      const total = lines.reduce((sum, line) => sum + cents(line.unit_price) * line.quantity, 0) / 100;

      for (const line of lines) await takeStock(run, line.product_id, line.option_id, line.quantity);
      const [order] = await run(
        `INSERT INTO orders (buyer_id, seller_id, stall_id, total, delivery_notes, fulfillment, delivery_address, buyer_phone, pickup_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${ORDER_COLUMNS}`,
        [buyerId, [...sellers][0], products[0].stall_id, total, deliveryNotes || "", fulfillment,
          fulfillment === "delivery" ? address : "", buyer.phone || "", String(randomInt(1000, 10000))],
      );
      for (const line of lines) {
        await run(
          "INSERT INTO order_items (order_id, product_id, option_id, option_label, name, image_url, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
          [order.id, line.product_id, line.option_id, line.option_label, line.name, line.image_url, line.quantity, line.unit_price],
        );
      }
      await notifyOrderParties(run, order, lines, "created");
      return { ...order, items: lines };
    });
  },

  /** Buyer's orders; items on finished orders carry the buyer's review (or null) so they can rate them. */
  async listBuyer(buyerId) {
    const orders = await listOrders("o.buyer_id = $1", [buyerId]);
    const reviews = await q("SELECT order_id, product_id, rating, comment FROM reviews WHERE buyer_id = $1", [buyerId]);
    const byKey = new Map(reviews.map((review) => [`${review.order_id}:${review.product_id}`, review]));
    return orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item, review: byKey.get(`${order.id}:${item.product_id}`) || null })),
    }));
  },

  async listSeller(sellerId, status) {
    const orders = await listOrders("o.seller_id = $1 AND ($2::text IS NULL OR o.status = $2)", [sellerId, status || null]);
    return orders.map(withoutPickupCode);
  },

  async updateStatus(orderId, status, actorId, actorRole, cancelReason = null, pickupCode = null, readyInMinutes = null) {
    return tx(async (run) => {
      // Row lock: a repeated cancel waits, then sees "cancelled" and can't restore stock twice.
      const [order] = await run(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
      if (!order) fail("Order not found", 404);
      if (actorId !== order.buyer_id && actorId !== order.seller_id && actorRole !== "admin") fail("Not authorized", 403);
      const [withItems] = await attachOrderItems(run, [order]);

      const buyerCancellation = actorId === order.buyer_id && actorRole !== "admin";
      if (buyerCancellation) {
        if (status !== "cancelled") fail("Buyers can only cancel their orders.", 403);
        if (LOCKED_STATUSES.has(order.status)) fail("The seller has already prepared this order, so it can no longer be cancelled.", 409);
        if (!canBuyerCancel(order)) fail("You can cancel an unfinished order only within 10 minutes of placing it.", 409);
      } else if (!(ORDER_TRANSITIONS[order.status] || []).includes(status)) {
        fail("Invalid order status transition.");
      }
      // Handing over a pickup order: the seller checks the buyer's code (admins can override).
      const sellerHandover = actorId === order.seller_id && actorRole !== "admin" && HANDOVER_STATUSES.has(status);
      if (sellerHandover && order.fulfillment === "pickup" && order.pickup_code && String(pickupCode || "").trim() !== order.pickup_code) {
        fail(pickupCode ? "That pickup code doesn't match. Ask the buyer to show the code on their Orders page." : "Enter the buyer's pickup code to hand over this order.", 400);
      }

      if (status === "cancelled") {
        const items = await run("SELECT product_id, option_id, quantity FROM order_items WHERE order_id = $1", [orderId]);
        for (const item of items) await returnStock(run, item.product_id, item.option_id, item.quantity);
      }
      // Confirming can promise a ready time (minutes from now); the buyer sees it.
      const minutes = status === "confirmed" && readyInMinutes ? Math.min(24 * 60, Math.max(1, Math.round(Number(readyInMinutes)))) : null;
      const [updated] = await run(
        `UPDATE orders SET status = $2, cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END,
           cancel_reason = CASE WHEN $2 = 'cancelled' THEN $3 ELSE cancel_reason END,
           ready_by = CASE WHEN $4::int IS NOT NULL THEN now() + make_interval(mins => $4::int) ELSE ready_by END
         WHERE id = $1 RETURNING ${ORDER_COLUMNS}`,
        [orderId, status, cancelReason || null, minutes],
      );
      await notifyOrderParties(run, updated, withItems.items, buyerCancellation ? "buyer_cancelled" : "status_changed");
      if (["completed", "delivered"].includes(status)) {
        const [{ count }] = await run("SELECT count(*) FROM orders WHERE seller_id = $1 AND status IN ('completed', 'delivered')", [order.seller_id]);
        if (count >= FIRST_SALES_NUDGE_AT) await nudgeSeller(run, order.seller_id, "first_sales");
      }
      const result = { ...updated, items: withItems.items };
      return actorId === order.buyer_id ? result : withoutPickupCode(result);
    });
  },
};

// ── Reviews ───────────────────────────────────────────────────────────────────
const REVIEW_SELECT = `SELECT r.id, r.product_id, r.order_id, r.rating, r.comment, r.created_at, r.updated_at, r.seller_reply, r.seller_replied_at,
  json_build_object('name', u.name, 'avatar_url', u.avatar_url) AS users
  FROM reviews r JOIN users u ON u.id = r.buyer_id`;

export const reviewStore = {
  /** Rate a product from one of the buyer's finished orders; saving again edits the review. */
  async save(buyerId, { order_id: orderId, product_id: productId, rating, comment = "" }) {
    return tx(async (run) => {
      const [order] = await run("SELECT id, buyer_id, seller_id, status FROM orders WHERE id = $1", [orderId]);
      if (!order || order.buyer_id !== buyerId) fail("Order not found.", 404);
      if (!HANDOVER_STATUSES.has(order.status)) fail("You can review a product once you've received your order.", 409);
      const [item] = await run("SELECT name FROM order_items WHERE order_id = $1 AND product_id = $2 LIMIT 1", [orderId, productId]);
      if (!item) fail("That product isn't part of this order.", 404);
      if (!(await run("SELECT 1 FROM products WHERE id = $1", [productId]))[0]) fail("This product is no longer listed, so it can't be reviewed.", 410);
      const text = String(comment || "").trim();
      const [saved] = await run(
        `INSERT INTO reviews (product_id, order_id, buyer_id, rating, comment) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_id, product_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
         RETURNING id, (xmax = 0) AS created`,
        [productId, orderId, buyerId, rating, text],
      );
      // Sellers hear about new reviews (not edits).
      if (saved.created && (await wantsNotice(run, order.seller_id, "reviewAlerts"))) {
        await run(
          `INSERT INTO notifications (user_id, type, status, title, body, link) VALUES ($1, 'review', 'review_new', $2, $3, '/seller/reviews')`,
          [order.seller_id, `New ${rating}★ review on ${item.name}`, text ? `“${text.slice(0, 140)}${text.length > 140 ? "…" : ""}”` : "A buyer rated this product."],
        );
      }
      return (await run(`${REVIEW_SELECT} WHERE r.id = $1`, [saved.id]))[0];
    });
  },

  /** The seller answers a review publicly (empty text removes the reply); the buyer is told about a new reply. */
  async reply(sellerId, reviewId, text) {
    return tx(async (run) => {
      const [review] = await run(
        `SELECT r.id, r.buyer_id, r.product_id, r.seller_reply, p.name, s.owner_id FROM reviews r
         JOIN products p ON p.id = r.product_id JOIN stalls s ON s.id = p.stall_id WHERE r.id = $1 FOR UPDATE OF r`, [reviewId]);
      if (!review || review.owner_id !== sellerId) fail("Review not found.", 404);
      const reply = String(text || "").trim();
      await run("UPDATE reviews SET seller_reply = $2, seller_replied_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1",
        [reviewId, reply || null]);
      if (reply && !review.seller_reply) {
        await run(
          `INSERT INTO notifications (user_id, type, status, title, body, link) VALUES ($1, 'review', 'review_reply', $2, $3, $4)`,
          [review.buyer_id, `The seller replied to your review of ${review.name}`, `“${reply.slice(0, 140)}${reply.length > 140 ? "…" : ""}”`, `/products/${review.product_id}`],
        );
      }
      return (await run(`${REVIEW_SELECT} WHERE r.id = $1`, [reviewId]))[0];
    });
  },

  /** Every review on the seller's products, newest first, with the product attached. */
  async listForSeller(ownerId) {
    return q(
      `SELECT x.*, json_build_object('id', p.id, 'name', p.name, 'image_url', p.image_url) AS product
       FROM (${REVIEW_SELECT}) x JOIN products p ON p.id = x.product_id JOIN stalls s ON s.id = p.stall_id
       WHERE s.owner_id = $1 ORDER BY x.created_at DESC LIMIT 500`,
      [ownerId],
    );
  },
};

// ── Favorites ─────────────────────────────────────────────────────────────────
export const favoriteStore = {
  /** Saved products that buyers can still see, most recently saved first. */
  async list(userId) {
    return q(
      `${PRODUCT_SELECT} JOIN favorites f ON f.product_id = p.id AND f.user_id = $1
       WHERE p.is_active AND ${PUBLIC_STALL} ORDER BY f.created_at DESC`,
      [userId],
    );
  },

  async ids(userId) {
    return (await q("SELECT product_id FROM favorites WHERE user_id = $1", [userId])).map((row) => row.product_id);
  },

  /** Saves one or more products (unknown IDs are skipped, so old browser lists import safely). */
  async add(userId, productIds) {
    const ids = [...new Set(productIds.map(String))].slice(0, 200);
    if (ids.length) {
      await q(
        `INSERT INTO favorites (user_id, product_id) SELECT $1, id FROM products WHERE id = ANY($2) ON CONFLICT DO NOTHING`,
        [userId, ids],
      );
    }
    return this.ids(userId);
  },

  async remove(userId, productId) {
    await q("DELETE FROM favorites WHERE user_id = $1 AND product_id = $2", [userId, String(productId)]);
    return this.ids(userId);
  },
};

// ── Notifications ─────────────────────────────────────────────────────────────
const NOTIFICATION_ORDER = `CASE WHEN o.id IS NULL THEN NULL ELSE json_build_object(
    'id', o.id, 'status', o.status, 'fulfillment', o.fulfillment, 'total', o.total, 'created_at', o.created_at,
    'stall_name', st.name, 'stall_logo', st.logo_url, 'stall_location', st.location,
    'item_count', (SELECT coalesce(sum(quantity), 0) FROM order_items WHERE order_id = o.id),
    'first_item', (SELECT json_build_object('name', i.name, 'image_url', coalesce(i.image_url, p.image_url))
                   FROM order_items i LEFT JOIN products p ON p.id = i.product_id
                   WHERE i.order_id = o.id ORDER BY i.id LIMIT 1)
  ) END`;

const insertNotification = (run, { userId, orderId, status, title, body, link }) =>
  run("INSERT INTO notifications (user_id, type, order_id, status, title, body, link) VALUES ($1, 'order', $2, $3, $4, $5, $6)",
    [userId, orderId, status, title, body, link]);

/**
 * Tell the right people about an order change, inside the same transaction:
 * created → buyer ("Order placed") + seller ("New order");
 * status_changed → buyer; buyer_cancelled → seller.
 */
const notifyOrderParties = async (run, order, lines, event) => {
  const [info] = await run(
    `SELECT st.name AS stall_name, st.location AS stall_location, b.name AS buyer_name
     FROM orders o LEFT JOIN stalls st ON st.id = o.stall_id JOIN users b ON b.id = o.buyer_id WHERE o.id = $1`,
    [order.id],
  );
  const context = {
    stallName: info?.stall_name, stallLocation: info?.stall_location, buyerName: info?.buyer_name,
    itemCount: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
  };
  if (event !== "buyer_cancelled") {
    await insertNotification(run, { userId: order.buyer_id, orderId: order.id, status: order.status, link: "/orders", ...buyerOrderMessage(order, context) });
  }
  const sellerWants = event !== "status_changed" && (await wantsNotice(run, order.seller_id, "orderUpdates"));
  if (event === "created" && sellerWants) {
    await insertNotification(run, { userId: order.seller_id, orderId: order.id, status: order.status, link: "/seller/orders", ...sellerNewOrderMessage(order, context) });
  }
  if (event === "buyer_cancelled" && sellerWants) {
    await insertNotification(run, { userId: order.seller_id, orderId: order.id, status: order.status, link: "/seller/orders", ...sellerCancelledMessage(order, context) });
  }
};

// ── Premium plan: nudges, requests, expiry ────────────────────────────────────
// Upgrade nudges are notifications of type "plan" sent at most once per seller per kind,
// and only while the stall is on Free.
const PLAN_NUDGES = {
  listings_almost: ["One listing slot left", "You've used 4 of your 5 Free listings. Premium gives you up to 25, plus analytics and the point of sale."],
  listings_full: ["You've reached 5 listings", "Your Free plan is full. Request Premium to list up to 25 products."],
  locked_analytics: ["Unlock product analytics", "See your best sellers, revenue trends and counter sales with Premium."],
  locked_pos: ["Sell at the counter with Premium", "The point of sale records cash sales and prints receipts. Request Premium to use it."],
  first_sales: ["3 completed orders — nice!", "See which products sell best with Premium analytics."],
};
const FIRST_SALES_NUDGE_AT = 3;

const insertPlanNotification = (run, userId, kind, title, body) =>
  run("INSERT INTO notifications (user_id, type, status, title, body, link) VALUES ($1, 'plan', $2, $3, $4, '/seller/plans')",
    [userId, kind, title, body]);

/** Sends one upgrade nudge if this seller is on Free and hasn't had this kind before. */
const nudgeSeller = async (run, ownerId, kind) => {
  const [stall] = await run("SELECT tier FROM stalls WHERE owner_id = $1", [ownerId]);
  if (!stall || stall.tier === "premium") return false;
  const [fresh] = await run("INSERT INTO plan_nudges (user_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING kind", [ownerId, kind]);
  if (!fresh) return false;
  await insertPlanNotification(run, ownerId, kind, ...PLAN_NUDGES[kind]);
  return true;
};

/**
 * Puts a stall on a plan. Moving to Free hides visible listings beyond the Free limit (the newest
 * stay) and clears featured picks; moving to Premium brings back whatever a downgrade hid.
 * Returns the names of the listings it hid.
 */
const changeTier = async (run, stallId, tier, until = null) => {
  await run("UPDATE stalls SET tier = $2, premium_until = $3 WHERE id = $1", [stallId, tier, tier === "premium" ? until : null]);
  if (tier === "premium") {
    await run("UPDATE products SET is_active = TRUE, hidden_by_plan = FALSE WHERE stall_id = $1 AND hidden_by_plan", [stallId]);
    return [];
  }
  await run("UPDATE products SET is_featured = FALSE WHERE stall_id = $1 AND is_featured", [stallId]);
  const hidden = await run(
    `UPDATE products SET is_active = FALSE, hidden_by_plan = TRUE WHERE id IN (
       SELECT id FROM products WHERE stall_id = $1 AND is_active ORDER BY created_at DESC, id OFFSET $2)
     RETURNING name`,
    [stallId, PLANS.free.listing_limit],
  );
  return hidden.map((row) => row.name);
};

/** " We hid A, B and 3 more …" — appended to Free notifications when listings were hidden. */
const hiddenListingsNote = (names) => {
  if (!names.length) return "";
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return ` Free shows ${PLANS.free.listing_limit} products, so we hid ${shown}${more}. Choose which ${PLANS.free.listing_limit} stay visible in Products.`;
};

/** End of that day in Philippine time, as an ISO string; null for no end date. */
const endOfDay = (day) => {
  if (!day) return null;
  const until = new Date(`${day}T23:59:59+08:00`).toISOString();
  if (Date.parse(until) <= Date.now()) fail("Pick an end date in the future.");
  return until;
};

const formatDay = (value) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
const REQUEST_SELECT = `SELECT r.*, s.name AS stall_name, s.location AS stall_location, s.tier, s.premium_until AS current_premium_until,
  u.name AS seller_name, u.email AS seller_email, u.campus_id AS seller_id_no, a.name AS reviewer_name,
  (SELECT count(*) FROM products p WHERE p.stall_id = s.id) AS listings
  FROM plan_requests r JOIN stalls s ON s.id = r.stall_id JOIN users u ON u.id = r.seller_id LEFT JOIN users a ON a.id = r.reviewed_by`;

export const planStore = {
  /** Premium that ran past its end date drops back to Free; the seller is told. Safe to call often. */
  async expireDue() {
    return tx(async (run) => {
      const expired = await run(`SELECT id, owner_id FROM stalls
                                 WHERE tier = 'premium' AND premium_until IS NOT NULL AND premium_until <= now() FOR UPDATE`);
      for (const stall of expired) {
        const hidden = await changeTier(run, stall.id, "free");
        await insertPlanNotification(run, stall.owner_id, "plan_expired", "Your Premium plan has ended",
          `Your stall is back on Free.${hiddenListingsNote(hidden)} Request Premium again to keep analytics, the point of sale and featured products.`);
        await audit(run, null, "stall.plan_expired", stall.id, hidden.length ? `${hidden.length} hidden` : null);
      }
      return expired.length;
    });
  },

  /** What the seller's Plans page shows. `feature` (analytics | pos) records that they tried a locked page. */
  async overview(ownerId, { feature } = {}) {
    await this.expireDue();
    const stall = await stallStore.getMy(ownerId);
    const base = { plans: PLANS, price: process.env.PREMIUM_PRICE || "", payment_info: process.env.PREMIUM_PAYMENT_INFO || "" };
    if (!stall) return { ...base, stall: null, listings: 0, pending: null, history: [] };
    if (["analytics", "pos"].includes(feature)) await tx((run) => nudgeSeller(run, ownerId, `locked_${feature}`));
    const [{ count }] = await q("SELECT count(*) FROM products WHERE stall_id = $1", [stall.id]);
    const history = await q(`${REQUEST_SELECT} WHERE r.stall_id = $1 ORDER BY r.created_at DESC LIMIT 5`, [stall.id]);
    return {
      ...base,
      stall: { id: stall.id, name: stall.name, status: stall.status, tier: stall.tier, premium_until: stall.premium_until, plan: stall.plan },
      listings: count,
      pending: history.find((item) => item.status === "pending") || null,
      history,
    };
  },

  async request(ownerId, { note = "", payment_reference = null }) {
    return tx(async (run) => {
      const [stall] = await run("SELECT * FROM stalls WHERE owner_id = $1 FOR UPDATE", [ownerId]);
      if (!stall) fail("Create your stall first.", 404);
      if (stall.status !== "approved") fail("Your stall needs to be approved before you can request Premium.", 403);
      // Renewal opens 30 days before an end date; otherwise Premium stalls don't need to ask.
      const renewing = stall.tier === "premium" && stall.premium_until && Date.parse(stall.premium_until) - Date.now() < 30 * 86400000;
      if (stall.tier === "premium" && !renewing) fail("Your stall is already on Premium.", 409);
      if ((await run("SELECT 1 FROM plan_requests WHERE stall_id = $1 AND status = 'pending'", [stall.id]))[0]) {
        fail("You already have a Premium request waiting for review.", 409);
      }
      const [row] = await run(
        "INSERT INTO plan_requests (stall_id, seller_id, note, payment_reference) VALUES ($1, $2, $3, $4) RETURNING id",
        [stall.id, ownerId, note, payment_reference || null],
      );
      await audit(run, ownerId, "plan.requested", stall.id, note || null);
      return (await run(`${REQUEST_SELECT} WHERE r.id = $1`, [row.id]))[0];
    });
  },

  async cancel(ownerId) {
    const row = await q1("UPDATE plan_requests SET status = 'cancelled' WHERE seller_id = $1 AND status = 'pending' RETURNING id", [ownerId]);
    if (!row) fail("No pending request to cancel.", 404);
    return { ok: true };
  },

  async listRequests({ status = "pending" } = {}) {
    const rows = await q(
      `${REQUEST_SELECT} WHERE ($1::text = 'all' OR r.status = $1) ORDER BY (r.status = 'pending') DESC, r.created_at ${status === "pending" ? "" : "DESC"} LIMIT 100`,
      [status],
    );
    return rows;
  },

  /** Approve (optionally until a date) or decline; the seller gets a notification either way. */
  async review(actorId, requestId, { decision, note = "", premium_until = null }) {
    return tx(async (run) => {
      const [request] = await run("SELECT * FROM plan_requests WHERE id = $1 FOR UPDATE", [requestId]);
      if (!request) fail("Request not found.", 404);
      if (request.status !== "pending") fail("This request has already been handled.", 409);
      const until = decision === "approved" ? endOfDay(premium_until) : null;
      if (decision === "approved") {
        await changeTier(run, request.stall_id, "premium", until);
        await insertPlanNotification(run, request.seller_id, "plan_approved", "Your stall is now Premium 🎉",
          `You can now list up to 25 products, feature 3 on the home page, and use analytics and the point of sale${until ? ` until ${formatDay(until)}` : ""}.${note ? ` Note from the admin: ${note}` : ""}`);
      } else {
        await insertPlanNotification(run, request.seller_id, "plan_declined", "Premium request not approved",
          note || "An administrator didn't approve this request. You can send a new one.");
      }
      await run(`UPDATE plan_requests SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(), premium_until = $5 WHERE id = $1`,
        [requestId, decision, note || null, actorId, decision === "approved" ? until : null]);
      await audit(run, actorId, `plan.${decision}`, request.stall_id, note || null);
      return (await run(`${REQUEST_SELECT} WHERE r.id = $1`, [requestId]))[0];
    });
  },
};

export const notificationStore = {
  async list(userId, { limit = 30 } = {}) {
    const size = Math.min(100, Math.max(1, Number(limit) || 30));
    return q(
      `SELECT n.id, n.type, n.order_id, n.status, n.title, n.body, n.link, n.read_at, n.created_at,
              (n.read_at IS NOT NULL) AS read, ${NOTIFICATION_ORDER} AS "order"
       FROM notifications n
       LEFT JOIN orders o ON o.id = n.order_id
       LEFT JOIN stalls st ON st.id = o.stall_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC, n.id DESC LIMIT $2`,
      [userId, size],
    );
  },

  /** Cheap polling check: unread count plus the newest notification's id. */
  async summary(userId) {
    const [row] = await q(
      `SELECT (SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL) AS unread,
              (SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1) AS latest_id`,
      [userId],
    );
    return row;
  },

  async markRead(userId, notificationId) {
    const [row] = await q(
      "UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id",
      [notificationId, userId],
    );
    if (!row) fail("Notification not found", 404);
    return true;
  },

  async markAllRead(userId) {
    await q("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
    return true;
  },
};

// ── Messages ──────────────────────────────────────────────────────────────────
export const messageStore = {
  async listConversations(userId) {
    const rows = await q(
      `SELECT DISTINCT ON (partner_id) partner_id, to_jsonb(m) AS last_message
       FROM (SELECT *, CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS partner_id
             FROM messages WHERE sender_id = $1 OR receiver_id = $1) m
       ORDER BY partner_id, sent_at DESC, id`,
      [userId],
    );
    const partners = rows.length
      ? await q("SELECT id, name, role, avatar_url FROM users WHERE id = ANY($1)", [rows.map((row) => row.partner_id)])
      : [];
    return rows
      .sort((a, b) => b.last_message.sent_at.localeCompare(a.last_message.sent_at))
      .map(({ partner_id, last_message: { partner_id: _, ...last_message } }) => ({
        partner: publicUser(partners.find((user) => user.id === partner_id)),
        last_message,
      }));
  },

  async listThread(userId, partnerId) {
    return q(
      `SELECT * FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY sent_at, id`,
      [userId, partnerId],
    );
  },

  async send(userId, receiverId, content, productId = null) {
    const users = await q("SELECT id, role FROM users WHERE id = ANY($1) AND status = 'approved' AND NOT is_banned", [[userId, receiverId]]);
    const sender = users.find((user) => user.id === userId);
    const receiver = users.find((user) => user.id === receiverId);
    if (!sender || !receiver) fail("Messaging requires approved campus accounts.", 403);
    if (userId === receiverId || !["buyer", "seller"].every((role) => [sender.role, receiver.role].includes(role))) {
      fail("Messages must be between a buyer and a seller.");
    }
    return q1(
      "INSERT INTO messages (sender_id, receiver_id, product_id, content) VALUES ($1, $2, $3, $4) RETURNING *",
      [userId, receiverId, productId, content],
    );
  },
};

// ── Events ────────────────────────────────────────────────────────────────────
const EVENT_STALL_COLUMNS = ["id", "event_id", "stall_number", "category", "status", "size", "price", "stall_id", "seller_id", "name", "description", "location", "x", "y", "w", "h"];

// Stall map grid (cells). Geometry is optional: spaces without it are auto-placed by number.
export const MAP_COLS = 24;
export const MAP_ROWS = 16;
const LANDMARK_TYPES = ["stage", "entrance", "exit", "restroom", "info", "custom"];

/** Validated {x,y,w,h} inside the grid, or all-null when the item has no position yet. */
const mapGeometry = (item, what) => {
  const values = ["x", "y", "w", "h"].map((key) => item[key]);
  if (values.every((value) => value === undefined || value === null)) return { x: null, y: null, w: null, h: null };
  const [x, y, w, h] = values;
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > MAP_COLS || y + h > MAP_ROWS) {
    fail(`${what} must sit inside the ${MAP_COLS}×${MAP_ROWS} map grid.`);
  }
  return { x, y, w, h };
};
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const eventStore = {
  async saveEvent(payload, actorId) {
    const name = String(payload.name || "").trim();
    const location = String(payload.location || "").trim();
    if (!name || name.length > 120 || !location || location.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date || "") || !Number.isFinite(Date.parse(payload.date))) {
      fail("Provide an event name, location and valid date.");
    }
    if (new Date(payload.date).toISOString().slice(0, 10) !== payload.date) fail("Provide a valid calendar date.");
    return tx(async (run) => {
      const [event] = await run(
        "INSERT INTO events (name, location, date, description) VALUES ($1, $2, $3, $4) RETURNING *",
        [name, location, payload.date, String(payload.description || "").slice(0, 2000)],
      );
      await audit(run, actorId, "event.created", event.id);
      return event;
    });
  },

  async saveLayout(eventId, payload, actorId) {
    return tx(async (run) => {
      const [event] = await run("SELECT * FROM events WHERE id = $1 FOR UPDATE", [String(eventId)]);
      if (!event) fail("Event not found", 404);
      if (event.layout_version !== payload.version) fail("This layout changed. Reload before saving.", 409);
      if (!Array.isArray(payload.stalls) || payload.stalls.length > 200) fail("A layout supports up to 200 spaces.");
      const existing = await run("SELECT * FROM event_stalls WHERE event_id = $1", [event.id]);
      const numbers = new Set();
      const ids = new Set();
      const next = payload.stalls.map((item) => {
        const prior = existing.find((entry) => entry.id === item.id);
        if (!Number.isInteger(item.stall_number) || item.stall_number < 1 || numbers.has(item.stall_number)) fail("Stall numbers must be positive and unique.");
        if (ids.has(item.id)) fail("Duplicate space ID.");
        ids.add(item.id); numbers.add(item.stall_number);
        if ((!["food", "merchandise", "mixed"].includes(item.category) && item.category !== prior?.category)
          || (!["available", "reserved", "occupied"].includes(item.status) && item.status !== prior?.status)) fail("Invalid category or status.");
        if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price < 0 || item.price > 1000000
          || !String(item.size || "").trim() || String(item.size).length > 40) fail("Provide a size and valid non-negative price.");
        if (prior?.seller_id && item.status !== prior.status) fail("Assigned spaces cannot change status in the layout editor.", 409);
        return { ...prior, id: prior?.id || randomUUID(), event_id: event.id, stall_number: item.stall_number,
          category: item.category, status: item.status, size: item.size.trim(), price: item.price,
          ...mapGeometry(item, `Space ${item.stall_number}`) };
      });
      if (existing.some((item) => !ids.has(item.id))) fail("Existing spaces cannot be removed from this editor.");

      let landmarks = event.landmarks || [];
      if (payload.landmarks !== undefined) {
        if (!Array.isArray(payload.landmarks) || payload.landmarks.length > 20) fail("A map supports up to 20 landmarks.");
        landmarks = payload.landmarks.map((item) => {
          const label = String(item.label || "").trim();
          if (!LANDMARK_TYPES.includes(item.type) || !label || label.length > 40) fail("Each landmark needs a type and a short label.");
          const geometry = mapGeometry(item, `Landmark "${label}"`);
          if (geometry.x === null) fail(`Place landmark "${label}" on the map.`);
          return { id: String(item.id || randomUUID()).slice(0, 64), type: item.type, label, ...geometry };
        });
      }
      const placed = [...next.filter((item) => item.x !== null).map((item) => ({ ...item, what: `Space ${item.stall_number}` })),
        ...landmarks.map((item) => ({ ...item, what: item.label }))];
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          if (overlaps(placed[i], placed[j])) fail(`${placed[i].what} overlaps ${placed[j].what}.`);
        }
      }

      await run("DELETE FROM event_stalls WHERE event_id = $1", [event.id]);
      for (const stall of next) {
        await run(
          `INSERT INTO event_stalls (${EVENT_STALL_COLUMNS.join(", ")}) VALUES (${EVENT_STALL_COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})`,
          EVENT_STALL_COLUMNS.map((column) => stall[column] ?? null),
        );
      }
      const [updated] = await run("UPDATE events SET layout_version = layout_version + 1, landmarks = $2::jsonb WHERE id = $1 RETURNING *",
        [event.id, JSON.stringify(landmarks)]);
      await audit(run, actorId, "event.layout_saved", event.id);
      return { event: updated, stalls: next };
    });
  },

  async listEvents() {
    return q(`SELECT e.*, (SELECT count(*) FROM event_stalls es WHERE es.event_id = e.id) AS stall_count
              FROM events e ORDER BY e.date, e.created_at`);
  },

  async getById(eventId) {
    const event = await q1("SELECT * FROM events WHERE id = $1", [String(eventId)]);
    if (!event) fail("Event not found", 404);
    return event;
  },

  async listStallsForEvent(eventId) {
    if (!(await q1("SELECT 1 FROM events WHERE id = $1", [String(eventId)]))) fail("Event not found", 404);
    return q(
      `SELECT es.*, coalesce(u.name, '') AS "sellerName", s.id AS "sellerStallId", s.name AS "sellerStallName", s.logo_url AS "sellerLogo",
              coalesce((SELECT json_agg(p.name ORDER BY p.created_at) FROM products p WHERE p.stall_id = s.id), '[]'::json) AS "productsAvailable"
       FROM event_stalls es
       LEFT JOIN stalls s ON s.owner_id = es.seller_id
       LEFT JOIN users u ON u.id = s.owner_id
       WHERE es.event_id = $1 ORDER BY es.stall_number`,
      [String(eventId)],
    );
  },

  async submitApplication(sellerId, payload = {}) {
    const cleanText = (value) => String(value ?? "").trim();
    const eventId = cleanText(payload.eventId);
    const fields = {
      stall_name: cleanText(payload.stallName),
      business_name: cleanText(payload.businessName),
      product_category: cleanText(payload.productCategory),
      product_list: cleanText(payload.productList),
      contact_info: cleanText(payload.contactInfo),
    };
    if (!(await q1("SELECT 1 FROM events WHERE id = $1", [eventId]))) fail("Event not found", 404);
    if (Object.values(fields).some((value) => !value)) fail("Please complete all required application fields");
    if (Object.values(fields).some((value) => value.length > 2000)) fail("Application fields must be 2000 characters or fewer.");
    const stallSize = Number(payload.preferredStallSize);
    const duration = Number(payload.duration);
    if (!Number.isFinite(stallSize) || stallSize <= 0) fail("Preferred stall size must be greater than zero");
    if (!Number.isInteger(duration) || duration <= 0) fail("Duration must be a whole number of days");

    const duplicate = await q1(
      "SELECT 1 FROM seller_applications WHERE seller_id = $1 AND event_id = $2 AND lower(status) IN ('pending', 'approved', 'reserved')",
      [sellerId, eventId],
    );
    if (duplicate) fail("You already have an active application for this event", 409);
    return q1(
      `INSERT INTO seller_applications (seller_id, event_id, stall_name, business_name, product_category, product_list,
         preferred_stall_size, duration, contact_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [sellerId, eventId, fields.stall_name, fields.business_name, fields.product_category, fields.product_list, stallSize, duration, fields.contact_info],
    );
  },

  async reviewApplication(applicationId, actorId, { status, note }) {
    return tx(async (run) => {
      const [application] = await run("SELECT status FROM seller_applications WHERE id = $1 FOR UPDATE", [applicationId]);
      if (!application) fail("Application not found", 404);
      if (String(application.status).toLowerCase() !== "pending") fail("This application has already been reviewed.", 409);
      const [updated] = await run(
        `UPDATE seller_applications SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
         WHERE id = $1 RETURNING *`,
        [applicationId, status, note, actorId],
      );
      await audit(run, actorId, `application.${status}`, applicationId, note);
      return updated;
    });
  },

  async listApplications({ eventId, status, sellerId } = {}) {
    return q(
      `SELECT a.*, u.name AS seller_name, CASE WHEN e.id IS NULL THEN NULL ELSE json_build_object(
                'id', e.id, 'name', e.name, 'date', e.date, 'end_date', e.end_date,
                'location', coalesce(e.location, ''), 'description', coalesce(e.description, '')) END AS event
       FROM seller_applications a LEFT JOIN events e ON e.id = a.event_id LEFT JOIN users u ON u.id = a.seller_id
       WHERE ($1::text IS NULL OR a.event_id = $1) AND ($2::text IS NULL OR lower(a.status) = lower($2))
         AND ($3::text IS NULL OR a.seller_id = $3)
       ORDER BY a.created_at DESC`,
      [eventId || null, status || null, sellerId || null],
    );
  },
};

// ── Point of sale ─────────────────────────────────────────────────────────────
const getPosSale = async (run, where, params) => {
  const [sale] = await run(`SELECT * FROM pos_sales WHERE ${where}`, params);
  if (!sale) return null;
  const items = await run("SELECT product_id, name, quantity, unit_price FROM pos_sale_items WHERE sale_id = $1 ORDER BY id", [sale.id]);
  return { ...sale, items };
};

export const posStore = {
  async customers(search) {
    if (!search || search.trim().length < 3) return [];
    const rows = await q(
      `SELECT id, name, role, avatar_url FROM users
       WHERE role = 'buyer' AND status = 'approved' AND NOT is_banned AND (lower(email) = lower($1) OR lower(campus_id) = lower($1))`,
      [search.trim()],
    );
    return rows.map(publicUser);
  },

  async list(sellerId) {
    const sales = await q("SELECT * FROM pos_sales WHERE seller_id = $1 ORDER BY created_at DESC", [sellerId]);
    if (!sales.length) return [];
    const items = await q("SELECT sale_id, product_id, name, quantity, unit_price FROM pos_sale_items WHERE sale_id = ANY($1) ORDER BY id", [sales.map((sale) => sale.id)]);
    return sales.map((sale) => ({
      ...sale,
      items: items.filter((item) => item.sale_id === sale.id).map(({ sale_id: _, ...item }) => item),
    }));
  },

  async create(sellerId, { request_id, buyer_id, items, cash_received }) {
    try {
      return await tx(async (run) => {
        // Same request_id = the seller's retry of a sale already recorded.
        const prior = await getPosSale(run, "request_id = $1 AND seller_id = $2", [request_id, sellerId]);
        if (prior) return prior;
        const [stall] = await run(
          `SELECT s.* FROM stalls s LEFT JOIN users o ON o.id = s.owner_id WHERE s.owner_id = $1 AND ${PUBLIC_STALL}`, [sellerId]);
        if (!stall) fail("Open an approved stall before recording a sale.", 403);
        const [buyer] = await run("SELECT id, name FROM users WHERE id = $1 AND role = 'buyer' AND status = 'approved' AND NOT is_banned", [buyer_id]);
        if (!buyer) fail("Choose an approved CSUCC buyer.", 403);
        if (new Set(items.map((item) => `${item.product_id}:${item.option_id || ""}`)).size !== items.length) fail("Duplicate product lines are not allowed.");

        const productIds = [...new Set(items.map((item) => item.product_id))];
        const products = await run("SELECT * FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE", [productIds]);
        const options = await run("SELECT * FROM product_options WHERE product_id = ANY($1) ORDER BY id FOR UPDATE", [productIds]);
        const lines = items.map((item) => {
          const product = products.find((entry) => entry.id === item.product_id);
          if (!product || product.stall_id !== stall.id || !product.is_active) fail("Choose an active product from your own stall.", 403);
          const option = pickOption(product, options, item.option_id || null);
          if ((option ? option.stock : product.stock) < item.quantity) fail(`Insufficient stock for ${lineName(product, option)}.`, 409);
          return { product_id: product.id, option_id: option?.id || null, option_label: option?.label || null,
            name: lineName(product, option), quantity: item.quantity, unit_price: unitPrice(product) };
        });
        const totalCents = lines.reduce((sum, line) => sum + cents(line.unit_price) * line.quantity, 0);
        const cashCents = cents(cash_received);
        if (cashCents < totalCents) fail("Cash received is less than the sale total.");

        for (const line of lines) await takeStock(run, line.product_id, line.option_id, line.quantity);
        const [sale] = await run(
          `INSERT INTO pos_sales (request_id, seller_id, buyer_id, buyer_name, stall_id, stall_name, total, cash_received, change)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [request_id, sellerId, buyer.id, buyer.name, stall.id, stall.name, totalCents / 100, cashCents / 100, (cashCents - totalCents) / 100],
        );
        for (const line of lines) {
          await run("INSERT INTO pos_sale_items (sale_id, product_id, option_id, option_label, name, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [sale.id, line.product_id, line.option_id, line.option_label, line.name, line.quantity, line.unit_price]);
        }
        await audit(run, sellerId, "pos.sale", sale.id, "Cash sale recorded");
        return { ...sale, items: lines };
      });
    } catch (error) {
      // Two identical retries raced; the other one won, so return its sale.
      if (error.status === 409 && error.cause?.code === "23505") {
        const prior = await getPosSale(q, "request_id = $1 AND seller_id = $2", [request_id, sellerId]);
        if (prior) return prior;
      }
      throw error;
    }
  },
};

// ── Analytics ─────────────────────────────────────────────────────────────────
// Completed online orders plus POS sales, scoped to a seller (or everything for admins).
const SCOPED_SALES = `
  WITH sales AS (
    SELECT id, seller_id, total, status, created_at, 'order' AS kind FROM orders
    UNION ALL
    SELECT id, seller_id, total, status, created_at, 'pos' AS kind FROM pos_sales
  ), scoped AS (
    SELECT * FROM sales
    WHERE status IN ('completed', 'delivered') AND created_at >= $1 AND ($2::text IS NULL OR seller_id = $2)
  ), lines AS (
    SELECT i.product_id, i.quantity, i.unit_price FROM order_items i JOIN scoped s ON s.kind = 'order' AND s.id = i.order_id
    UNION ALL
    SELECT i.product_id, i.quantity, i.unit_price FROM pos_sale_items i JOIN scoped s ON s.kind = 'pos' AND s.id = i.sale_id
  )`;
const periodParams = (userId, role, period) => {
  const days = Math.max(1, Math.min(365, Number(period) || 30));
  return [new Date(Date.now() - days * 86400000).toISOString(), role === "admin" ? null : userId];
};
const money = (value) => Number(Number(value).toFixed(2));

export const analyticsStore = {
  /**
   * Daily totals in campus time (only days with sales; the page fills the gaps), the period's
   * totals split into online orders and counter sales, and the same totals for the period before.
   */
  async salesSummary(userId, role, period = 30) {
    const params = periodParams(userId, role, period);
    const timeline = await q(
      `${SCOPED_SALES}
       SELECT to_char(created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date, sum(total)::float AS revenue, count(*)::int AS orders
       FROM scoped GROUP BY 1 ORDER BY 1`,
      params,
    );
    const [split] = await q(
      `${SCOPED_SALES}
       SELECT count(*) FILTER (WHERE kind = 'order')::int AS online_orders, count(*) FILTER (WHERE kind = 'pos')::int AS pos_sales FROM scoped`,
      params,
    );
    const days = Math.max(1, Math.min(365, Number(period) || 30));
    const [previous] = await q(
      `SELECT coalesce(sum(total), 0)::float AS revenue, count(*)::int AS orders FROM (
         SELECT seller_id, total, status, created_at FROM orders
         UNION ALL SELECT seller_id, total, status, created_at FROM pos_sales
       ) sales
       WHERE status IN ('completed', 'delivered') AND created_at >= $1::timestamptz - make_interval(days => $3) AND created_at < $1
         AND ($2::text IS NULL OR seller_id = $2)`,
      [...params, days],
    );
    const totalRevenue = timeline.reduce((sum, day) => sum + Number(day.revenue), 0);
    const totalOrders = timeline.reduce((sum, day) => sum + Number(day.orders), 0);
    return {
      timeline,
      total_revenue: money(totalRevenue),
      total_orders: totalOrders,
      avg_order_value: totalOrders ? money(totalRevenue / totalOrders) : 0,
      online_orders: split.online_orders,
      pos_sales: split.pos_sales,
      previous: {
        revenue: money(previous.revenue),
        orders: previous.orders,
        avg_order_value: previous.orders ? money(previous.revenue / previous.orders) : 0,
      },
    };
  },

  async topProducts(userId, role, period = 30) {
    const rows = await q(
      `${SCOPED_SALES}
       SELECT l.product_id, to_jsonb(p) AS product, sum(l.quantity) AS total_sold, sum(l.quantity * l.unit_price) AS revenue
       FROM lines l LEFT JOIN products p ON p.id = l.product_id
       GROUP BY l.product_id, p.id ORDER BY total_sold DESC, l.product_id LIMIT 6`,
      periodParams(userId, role, period),
    );
    return rows.map((row) => ({ ...row, revenue: money(row.revenue) }));
  },

  async categoryBreakdown(userId, role, period = 30) {
    const rows = await q(
      `${SCOPED_SALES}
       SELECT coalesce(p.category, 'other') AS category, sum(l.quantity * l.unit_price) AS revenue
       FROM lines l LEFT JOIN products p ON p.id = l.product_id
       GROUP BY 1 ORDER BY revenue DESC`,
      periodParams(userId, role, period),
    );
    return rows.map((row) => ({ ...row, revenue: money(row.revenue) }));
  },
};

// ── Behaviour tracking (read by the AI service) ──────────────────────────────
export const behaviorStore = {
  async log(userId, productId, action) {
    await q("INSERT INTO user_behavior (user_id, product_id, action) VALUES ($1, $2, $3)", [userId, productId || null, action]);
    return true;
  },
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminStore = {
  async getStats() {
    const [stats] = await q(`
      SELECT (SELECT count(*) FROM users) AS total_users,
             (SELECT count(*) FROM stalls WHERE status = 'approved') AS active_stalls,
             (SELECT count(*) FROM orders) AS total_orders,
             (SELECT coalesce(sum(total), 0) FROM orders WHERE status IN ('completed', 'delivered')) AS total_revenue,
             (SELECT count(*) FROM orders WHERE status IN ('completed', 'delivered')) AS completed_orders,
             (SELECT count(*) FROM user_behavior) AS total_interactions,
             (SELECT count(*) FROM events) AS total_events,
             (SELECT coalesce(sum(total), 0) FROM pos_sales) AS pos_revenue,
             (SELECT count(*) FROM pos_sales) AS pos_sales,
             (SELECT count(*) FROM users WHERE status = 'pending' AND role <> 'admin') AS pending_registrations,
             (SELECT count(*) FROM stalls WHERE status = 'pending') AS pending_stalls,
             (SELECT count(*) FROM seller_applications WHERE lower(status) = 'pending') AS pending_event_applications,
             (SELECT count(*) FROM plan_requests WHERE status = 'pending') AS pending_plan_requests`);
    const roles = await q("SELECT role, count(*) AS value FROM users GROUP BY role");
    const monthly = await q(`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, sum(total) AS sales
      FROM orders WHERE status IN ('completed', 'delivered') GROUP BY 1`);
    return {
      ...stats,
      total_revenue: money(stats.total_revenue),
      pos_revenue: money(stats.pos_revenue),
      user_breakdown: ["buyer", "seller", "admin"].map((role) => ({ name: role, value: roles.find((row) => row.role === role)?.value || 0 })),
      sales_history: Array.from({ length: 6 }, (_, index) => {
        const date = new Date(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 5 + index);
        const month = date.toISOString().slice(0, 7);
        return { month, sales: monthly.find((row) => row.month === month)?.sales || 0 };
      }),
    };
  },

  async getPendingStalls() {
    return q("SELECT * FROM stalls WHERE status = 'pending' ORDER BY created_at");
  },
};

// ── Public marketplace stats (home page) ──────────────────────────────────────
export const statsStore = {
  /**
   * Counts for the home page plus recent orders reduced to product + time.
   * Nothing here identifies a buyer: no names, ids, amounts or stall owners.
   */
  async publicSummary() {
    const [counts] = await q(`
      SELECT (SELECT count(*) FROM stalls s LEFT JOIN users o ON o.id = s.owner_id WHERE ${PUBLIC_STALL}) AS active_stalls,
             (SELECT count(*) FROM products p JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id
               WHERE p.is_active AND ${PUBLIC_STALL}) AS products,
             (SELECT count(DISTINCT buyer_id) FROM (
                SELECT buyer_id FROM orders WHERE status <> 'cancelled'
                UNION SELECT buyer_id FROM pos_sales) b) AS students_served`);
    const recent = await q(`
      SELECT i.name AS product_name, coalesce(i.image_url, p.image_url) AS image_url, o.created_at AS ordered_at
      FROM orders o
      JOIN LATERAL (SELECT * FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) i ON TRUE
      LEFT JOIN products p ON p.id = i.product_id
      WHERE o.status <> 'cancelled' AND o.created_at > now() - interval '14 days'
      ORDER BY o.created_at DESC LIMIT 12`);
    return { ...counts, recent_orders: recent };
  },
};
