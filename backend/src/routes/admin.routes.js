import { accountStore, authStore, planStore, sessionStore, staffStore, stallStore, eventStore } from "../data/marketStore.js";
import {
  validate, reviewRegistrationSchema, planReviewSchema, createAdminSchema, updateAdminSchema, updateAccountSchema, removeAccountSchema,
} from "../middleware/validate.js";
import { Router as AdminRouter } from "express";
import { getAdminStats, getPendingStalls, banUser } from "../controllers/admin.controller.js";
import { getAllUsers } from "../controllers/auth.controller.js";
import { verifyToken, requireRole, requirePermission } from "../middleware/auth.js";
import { ADMIN_PERMISSIONS, SHIFT_PRESETS, describeShift, withShift } from "../config/admins.js";
import { sendAdminCredentialsEmail } from "../services/email.js";

const adminRouter = AdminRouter();
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

adminRouter.use(verifyToken, requireRole("admin"));

// ── Marketplace (stores, events, applications) ──
adminRouter.post("/events", requirePermission("marketplace"), handle(async (req, res) => {
  res.status(201).json(await eventStore.saveEvent(req.body, req.user.id));
}));
adminRouter.put("/events/:id/layout", requirePermission("marketplace"), handle(async (req, res) => {
  res.json(await eventStore.saveLayout(req.params.id, req.body, req.user.id));
}));
adminRouter.get("/stalls", handle(async (_req, res) => res.json(await stallStore.listStalls())));
adminRouter.put("/stalls/:id/plan", requirePermission("marketplace"), handle(async (req, res) => {
  res.json(await stallStore.setPlan(req.params.id, req.body.tier, req.user.id));
}));
adminRouter.get("/stalls/pending", getPendingStalls);
adminRouter.get("/plan-requests", handle(async (req, res) => res.json(await planStore.listRequests({ status: req.query.status || "pending" }))));
adminRouter.put("/plan-requests/:id", requirePermission("marketplace"), validate(planReviewSchema), handle(async (req, res) => {
  res.json(await planStore.review(req.user.id, req.params.id, req.body));
}));
adminRouter.get("/stats", getAdminStats);

// ── Accounts: approval, editing, blocking, removal ──
adminRouter.get("/users", getAllUsers);
adminRouter.put("/users/:id/review", requirePermission("approve"), validate(reviewRegistrationSchema), handle(async (req, res) => {
  res.json(await authStore.reviewRegistration(req.params.id, req.user.id, req.body));
}));
adminRouter.put("/users/:id", requirePermission("edit"), validate(updateAccountSchema), handle(async (req, res) => {
  res.json(await accountStore.update(req.user.id, req.params.id, req.body));
}));
adminRouter.put("/users/:id/ban", requirePermission("block"), banUser);
adminRouter.delete("/users/:id", requirePermission("delete"), validate(removeAccountSchema), handle(async (req, res) => {
  res.json(await accountStore.remove(req.user.id, req.params.id, req.body.reason));
}));
adminRouter.post("/users/:id/restore", requirePermission("delete"), handle(async (req, res) => {
  res.json(await accountStore.restore(req.user.id, req.params.id));
}));
adminRouter.post("/users/:id/sign-out", requirePermission("block"), handle(async (req, res) => {
  await sessionStore.endAll(req.params.id, "signed_out_by_admin");
  res.json({ ok: true });
}));

// ── Administrators ──
adminRouter.get("/admins/options", (_req, res) => res.json({ permissions: ADMIN_PERMISSIONS, shifts: SHIFT_PRESETS }));
adminRouter.get("/admins", handle(async (_req, res) => res.json((await staffStore.list()).map(withShift))));

/** Emails the sign-in details; the password is also returned once so the creator can hand it over if email fails. */
const deliverCredentials = async (req, { user, password }, reset) => {
  let emailed = true;
  try {
    await sendAdminCredentialsEmail({ to: user.email, username: user.username, password, shift: describeShift(user), createdBy: req.user.name, reset });
  } catch (error) {
    emailed = false;
    console.error(`[email] Could not send admin credentials to ${user.email}: ${error.message}`);
  }
  return { user: withShift(user), password, emailed };
};

adminRouter.post("/admins", requirePermission("admins"), validate(createAdminSchema), handle(async (req, res) => {
  res.status(201).json(await deliverCredentials(req, await staffStore.create(req.user.id, req.body), false));
}));
adminRouter.put("/admins/:id", requirePermission("admins"), validate(updateAdminSchema), handle(async (req, res) => {
  res.json(withShift(await staffStore.update(req.user.id, req.params.id, req.body)));
}));
adminRouter.post("/admins/:id/reset-password", requirePermission("admins"), handle(async (req, res) => {
  res.json(await deliverCredentials(req, await staffStore.resetPassword(req.user.id, req.params.id), true));
}));

// ── Logs ──
adminRouter.get("/logs", requirePermission("logs"), handle(async (req, res) => {
  const { role, month, date, q, page, limit } = req.query;
  res.json(await sessionStore.list({ role, month, date, q, page, limit }));
}));
adminRouter.get("/activity", requirePermission("logs"), handle(async (req, res) => {
  const { month, date, q, page, limit } = req.query;
  res.json(await sessionStore.activity({ month, date, q, page, limit }));
}));

export { adminRouter as default };
