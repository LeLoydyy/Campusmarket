/**
 * marketStore.js — all marketplace data access, backed by PostgreSQL (see src/db).
 *
 * Every store keeps the same method names and response shapes the controllers
 * already use. Anything that touches stock runs in a transaction with row locks,
 * so concurrent orders can never oversell or restore stock twice.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getPlan } from "../config/plans.js";
import { cancellationDeadline, canBuyerCancel } from "../config/orderCancellation.js";
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
const USER_COLUMNS = `id, name, email, role, status, campus_id, affiliation, department, campus, avatar_url,
  is_banned, review_note, reviewed_by, reviewed_at, password_changed_at, created_at`;
const publicUser = (user) => user ? { id: user.id, name: user.name, role: user.role, avatar_url: user.avatar_url } : null;

// A stall is publicly visible when approved, active and owned by an approved, unbanned user.
const PUBLIC_STALL = "s.status = 'approved' AND s.is_active AND o.status = 'approved' AND NOT o.is_banned";
const STALL_SELECT = `SELECT s.*, coalesce(o.name, 'Campus seller') AS seller_name,
  (SELECT count(*) FROM products c WHERE c.stall_id = s.id) AS product_count
  FROM stalls s LEFT JOIN users o ON o.id = s.owner_id`;
const withPlan = (stall) => stall && { ...stall, plan: getPlan(stall.tier) };
const PRODUCT_SELECT = `SELECT p.*, to_jsonb(s) AS stalls FROM products p
  JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id`;

const isApprovedUser = async (run, id) =>
  Boolean((await run("SELECT 1 FROM users WHERE id = $1 AND status = 'approved' AND NOT is_banned", [id]))[0]);

const audit = (run, actorId, action, targetId, note = null) =>
  run("INSERT INTO audit_log (actor_id, action, target_id, note) VALUES ($1, $2, $3, $4)", [actorId, action, targetId, note]);

const escapeLike = (value) => String(value).replace(/[\\%_]/g, "\\$&");
const pageParams = (page, limit, max = 100) => {
  const size = Math.min(max, Math.max(1, Number(limit) || 20));
  const number = Math.max(1, Number(page) || 1);
  return { size, number, offset: (number - 1) * size };
};
const cents = (amount) => Math.round(Number(amount) * 100);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authStore = {
  async startSelling(userId, payload) {
    return tx(async (run) => {
      const [user] = await run("SELECT role FROM users WHERE id = $1 AND status = 'approved' AND NOT is_banned FOR UPDATE", [userId]);
      if (!user || !["buyer", "seller"].includes(user.role)) fail("An approved campus account is required.", 403);
      const stall = await insertStall(run, userId, payload);
      const [updated] = await run(`UPDATE users SET role = 'seller' WHERE id = $1 RETURNING ${USER_COLUMNS}`, [userId]);
      return { user: updated, stall };
    });
  },

  async registerUser({ name, email, password, role = "buyer", campus_id, affiliation, department, store_name, campus_location }) {
    const passwordHash = bcrypt.hashSync(password, 12);
    return tx(async (run) => {
      if ((await run("SELECT 1 FROM users WHERE email = $1", [email]))[0]) fail("Email already registered", 409);
      if ((await run("SELECT 1 FROM users WHERE lower(campus_id) = lower($1)", [campus_id]))[0]) fail("This campus ID is already registered.", 409);
      const [user] = await run(
        `INSERT INTO users (name, email, password_hash, role, campus_id, affiliation, department, campus)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CSUCC') RETURNING ${USER_COLUMNS}`,
        [name, email, passwordHash, role, campus_id, affiliation, department],
      );
      if (role === "seller") {
        await run("INSERT INTO stalls (owner_id, name, location) VALUES ($1, $2, $3)", [user.id, store_name, campus_location]);
      }
      return user;
    });
  },

  async loginUser(email, password) {
    const user = await q1("SELECT * FROM users WHERE email = $1", [email]);
    // Always run bcrypt so response time doesn't reveal whether the email exists
    const valid = bcrypt.compareSync(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid) fail("Invalid email or password", 401);
    if (user.is_banned) fail("Account suspended", 403);
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

  async getUserById(userId) {
    const user = await q1(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
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
      if (updates.avatar_url !== undefined) {
        params.push(updates.avatar_url);
        sets.push(`avatar_url = $${params.length}`);
      }
      if (!sets.length) return (await run(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]))[0];
      return (await run(`UPDATE users SET ${sets.join(", ")} WHERE id = $1 RETURNING ${USER_COLUMNS}`, params))[0];
    });
  },

  async listUsers({ role, status, q: search, page = 1, limit = 20 } = {}) {
    const { size, number, offset } = pageParams(page, limit);
    const where = `($1::text IS NULL OR role = $1) AND ($2::text IS NULL OR status = $2)
      AND ($3::text IS NULL OR (name || ' ' || email) ILIKE '%' || $3 || '%')`;
    const params = [role || null, status || null, search ? escapeLike(search) : null];
    const [{ count }] = await q(`SELECT count(*) FROM users WHERE ${where}`, params);
    const data = await q(`SELECT ${USER_COLUMNS} FROM users WHERE ${where} ORDER BY created_at, id LIMIT $4 OFFSET $5`, [...params, size, offset]);
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

  async banUser(userId, ban) {
    const user = await q1("SELECT role FROM users WHERE id = $1", [userId]);
    if (!user) fail("User not found", 404);
    if (user.role === "admin") fail("Administrator accounts cannot be suspended here.", 403);
    return q1(`UPDATE users SET is_banned = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`, [userId, Boolean(ban)]);
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

  async setPlan(stallId, tier, actorId) {
    return tx(async (run) => {
      const [stall] = await run("SELECT id FROM stalls WHERE id = $1 FOR UPDATE", [stallId]);
      if (!stall) fail("Stall not found.", 404);
      if (!["free", "premium"].includes(tier)) fail("Invalid plan.");
      const [{ count }] = await run("SELECT count(*) FROM products WHERE stall_id = $1", [stallId]);
      if (count > getPlan(tier).listing_limit) fail("Remove excess listings before changing to this plan.", 409);
      await run("UPDATE stalls SET tier = $2 WHERE id = $1", [stallId, tier]);
      await audit(run, actorId, "stall.plan", stallId, tier);
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
      AND (NOT $5 OR s.tier = 'premium') AND ($6::text IS NULL OR p.category = $6)
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

  async getById(productId, actor) {
    const product = await q1(`${PRODUCT_SELECT} WHERE p.id = $1`, [productId]);
    if (!product) fail("Product not found", 404);
    const visible = await q1(`SELECT 1 FROM stalls s LEFT JOIN users o ON o.id = s.owner_id WHERE s.id = $1 AND ${PUBLIC_STALL}`, [product.stall_id]);
    if ((!product.is_active || !visible) && actor?.role !== "admin" && actor?.id !== product.stalls.owner_id) fail("Product not found.", 404);
    const [{ view_count }] = await q("UPDATE products SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count", [productId]);
    return { ...product, view_count };
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
        `INSERT INTO products (stall_id, name, description, price, stock, category, image_url, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [stallId, payload.name, payload.description || "", Number(payload.price), Number(payload.stock),
          payload.category || "other", payload.image_url || "", payload.is_active !== false],
      );
      return { ...product, stalls: stall };
    });
  },

  async update(productId, payload, actor) {
    return tx(async (run) => {
      const [product] = await run(
        "SELECT p.id, s.owner_id FROM products p JOIN stalls s ON s.id = p.stall_id WHERE p.id = $1 FOR UPDATE OF p", [productId]);
      if (!product) fail("Product not found", 404);
      if (actor?.role !== "admin" && actor?.id !== product.owner_id) fail("You can only edit your own products.", 403);
      const params = [productId];
      const sets = [];
      for (const key of ["name", "description", "price", "stock", "category", "image_url", "is_active"]) {
        if (payload[key] === undefined) continue;
        params.push(payload[key]);
        sets.push(`${key} = $${params.length}`);
      }
      if (sets.length) await run(`UPDATE products SET ${sets.join(", ")} WHERE id = $1`, params);
      return (await run(`${PRODUCT_SELECT} WHERE p.id = $1`, [productId]))[0];
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
      `SELECT c.id, c.user_id, c.product_id, c.quantity, to_jsonb(p) AS products
       FROM cart_items c LEFT JOIN products p ON p.id = c.product_id
       WHERE c.user_id = $1 ORDER BY c.created_at, c.id`,
      [userId],
    );
  },

  async add(userId, productId, quantity = 1) {
    return tx(async (run) => {
      const [product] = await run(
        `SELECT p.*, (p.is_active AND ${PUBLIC_STALL}) AS available FROM products p
         JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id WHERE p.id = $1`, [productId || null]);
      if (!product) fail("Product not found", 404);
      if (!product.available) fail("Product is unavailable.", 409);
      const amount = assertQuantity(quantity);
      const [existing] = await run("SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2 FOR UPDATE", [userId, productId]);
      if ((existing?.quantity || 0) + amount > product.stock) fail("Insufficient stock.", 409);
      const [entry] = await run(
        `INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
         RETURNING id, user_id, product_id, quantity`,
        [userId, productId, amount],
      );
      const { available: _, ...products } = product;
      return { ...entry, products };
    });
  },

  async update(userId, itemId, quantity) {
    return tx(async (run) => {
      const [entry] = await run("SELECT product_id FROM cart_items WHERE id = $1 AND user_id = $2 FOR UPDATE", [itemId, userId]);
      if (!entry) fail("Cart item not found", 404);
      const amount = assertQuantity(quantity);
      const [product] = await run(
        `SELECT p.stock FROM products p JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id
         WHERE p.id = $1 AND p.is_active AND ${PUBLIC_STALL}`, [entry.product_id]);
      if (!product || amount > product.stock) fail("Product or quantity unavailable.", 409);
      return (await run("UPDATE cart_items SET quantity = $2 WHERE id = $1 RETURNING id, user_id, product_id, quantity", [itemId, amount]))[0];
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
const ORDER_COLUMNS = "id, buyer_id, seller_id, stall_id, total, status, delivery_notes, fulfillment, cancelled_at, created_at";

/** Attach items (purchase-time snapshots) to order rows. */
const attachOrderItems = async (run, orders) => {
  if (!orders.length) return [];
  const items = await run(
    "SELECT order_id, product_id, name, image_url, quantity, unit_price FROM order_items WHERE order_id = ANY($1) ORDER BY id",
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
  async create(buyerId, items, deliveryNotes = "", fulfillment = "pickup") {
    return tx(async (run) => {
      if (!(await isApprovedUser(run, buyerId))) fail("An approved buyer account is required.", 403);
      const productIds = [...new Set(items.map((item) => item.product_id))];
      // Lock the product rows until commit so concurrent orders can't oversell.
      const products = await run(
        `SELECT p.*, s.owner_id, (p.is_active AND ${PUBLIC_STALL}) AS available
         FROM products p JOIN stalls s ON s.id = p.stall_id LEFT JOIN users o ON o.id = s.owner_id
         WHERE p.id = ANY($1) ORDER BY p.id FOR UPDATE OF p`,
        [productIds],
      );
      if (products.length !== productIds.length) fail("One or more products were not found", 404);

      const requested = new Map();
      for (const item of items) requested.set(item.product_id, (requested.get(item.product_id) || 0) + item.quantity);
      for (const product of products) {
        if (!product.available) fail("A selected product is no longer available.", 409);
        if (product.stock < requested.get(product.id)) fail(`Insufficient stock for ${product.name}.`, 409);
      }
      const sellers = new Set(products.map((product) => product.owner_id));
      if (sellers.size !== 1) fail("Place a separate order for each store.");

      const lines = items.map((item) => {
        const product = products.find((entry) => entry.id === item.product_id);
        return { product_id: product.id, name: product.name, image_url: product.image_url || null, quantity: item.quantity, unit_price: product.price };
      });
      // Sum in cents to avoid floating-point drift (e.g. 0.1 + 0.2)
      const total = lines.reduce((sum, line) => sum + cents(line.unit_price) * line.quantity, 0) / 100;

      for (const [productId, quantity] of requested) {
        await run("UPDATE products SET stock = stock - $2 WHERE id = $1", [productId, quantity]);
      }
      const [order] = await run(
        `INSERT INTO orders (buyer_id, seller_id, stall_id, total, delivery_notes, fulfillment)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ORDER_COLUMNS}`,
        [buyerId, [...sellers][0], products[0].stall_id, total, deliveryNotes || "", fulfillment],
      );
      for (const line of lines) {
        await run(
          "INSERT INTO order_items (order_id, product_id, name, image_url, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6)",
          [order.id, line.product_id, line.name, line.image_url, line.quantity, line.unit_price],
        );
      }
      await notifyOrderParties(run, order, lines, "created");
      return { ...order, items: lines };
    });
  },

  async listBuyer(buyerId) {
    return listOrders("o.buyer_id = $1", [buyerId]);
  },

  async listSeller(sellerId, status) {
    return listOrders("o.seller_id = $1 AND ($2::text IS NULL OR o.status = $2)", [sellerId, status || null]);
  },

  async updateStatus(orderId, status, actorId, actorRole) {
    return tx(async (run) => {
      // Row lock: a repeated cancel waits, then sees "cancelled" and can't restore stock twice.
      const [order] = await run(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
      if (!order) fail("Order not found", 404);
      if (actorId !== order.buyer_id && actorId !== order.seller_id && actorRole !== "admin") fail("Not authorized", 403);
      const [withItems] = await attachOrderItems(run, [order]);

      const buyerCancellation = actorId === order.buyer_id && actorRole !== "admin";
      if (buyerCancellation) {
        if (status !== "cancelled") fail("Buyers can only cancel their orders.", 403);
        if (!canBuyerCancel(order)) fail("You can cancel an unfinished order only within 10 minutes of placing it.", 409);
      } else if (!(ORDER_TRANSITIONS[order.status] || []).includes(status)) {
        fail("Invalid order status transition.");
      }

      if (status === "cancelled") {
        for (const item of withItems.items) {
          await run("UPDATE products SET stock = stock + $2 WHERE id = $1", [item.product_id, item.quantity]);
        }
      }
      const [updated] = await run(
        `UPDATE orders SET status = $2, cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END
         WHERE id = $1 RETURNING ${ORDER_COLUMNS}`,
        [orderId, status],
      );
      await notifyOrderParties(run, updated, withItems.items, buyerCancellation ? "buyer_cancelled" : "status_changed");
      return { ...updated, items: withItems.items };
    });
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
  if (event === "created") {
    await insertNotification(run, { userId: order.seller_id, orderId: order.id, status: order.status, link: "/seller/orders", ...sellerNewOrderMessage(order, context) });
  }
  if (event === "buyer_cancelled") {
    await insertNotification(run, { userId: order.seller_id, orderId: order.id, status: order.status, link: "/seller/orders", ...sellerCancelledMessage(order, context) });
  }
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
        if (new Set(items.map((item) => item.product_id)).size !== items.length) fail("Duplicate product lines are not allowed.");

        const products = await run("SELECT * FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE", [items.map((item) => item.product_id)]);
        const lines = items.map((item) => {
          const product = products.find((entry) => entry.id === item.product_id);
          if (!product || product.stall_id !== stall.id || !product.is_active) fail("Choose an active product from your own stall.", 403);
          if (product.stock < item.quantity) fail(`Insufficient stock for ${product.name}.`, 409);
          return { product_id: product.id, name: product.name, quantity: item.quantity, unit_price: product.price };
        });
        const totalCents = lines.reduce((sum, line) => sum + cents(line.unit_price) * line.quantity, 0);
        const cashCents = cents(cash_received);
        if (cashCents < totalCents) fail("Cash received is less than the sale total.");

        for (const line of lines) await run("UPDATE products SET stock = stock - $2 WHERE id = $1", [line.product_id, line.quantity]);
        const [sale] = await run(
          `INSERT INTO pos_sales (request_id, seller_id, buyer_id, buyer_name, stall_id, stall_name, total, cash_received, change)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [request_id, sellerId, buyer.id, buyer.name, stall.id, stall.name, totalCents / 100, cashCents / 100, (cashCents - totalCents) / 100],
        );
        for (const line of lines) {
          await run("INSERT INTO pos_sale_items (sale_id, product_id, name, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)",
            [sale.id, line.product_id, line.name, line.quantity, line.unit_price]);
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
  async salesSummary(userId, role, period = 30) {
    const timeline = await q(
      `${SCOPED_SALES}
       SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, sum(total) AS revenue, count(*) AS orders
       FROM scoped GROUP BY 1 ORDER BY 1`,
      periodParams(userId, role, period),
    );
    const totalRevenue = timeline.reduce((sum, day) => sum + day.revenue, 0);
    const totalOrders = timeline.reduce((sum, day) => sum + day.orders, 0);
    return {
      timeline,
      total_revenue: money(totalRevenue),
      total_orders: totalOrders,
      avg_order_value: totalOrders ? money(totalRevenue / totalOrders) : 0,
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
             (SELECT count(*) FROM seller_applications WHERE lower(status) = 'pending') AS pending_event_applications`);
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
