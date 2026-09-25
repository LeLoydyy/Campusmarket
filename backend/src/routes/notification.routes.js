import { Router } from "express";
import { notificationStore } from "../data/marketStore.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();
router.use(verifyToken);

// GET /api/notifications?limit=30 — newest first, each with its order snapshot
router.get("/", async (req, res, next) => {
  try { res.json(await notificationStore.list(req.user.id, { limit: req.query.limit })); } catch (error) { next(error); }
});

// GET /api/notifications/summary — { unread, latest_id } for cheap polling
router.get("/summary", async (req, res, next) => {
  try { res.json(await notificationStore.summary(req.user.id)); } catch (error) { next(error); }
});

router.put("/read-all", async (req, res, next) => {
  try { await notificationStore.markAllRead(req.user.id); res.json({ ok: true }); } catch (error) { next(error); }
});

router.put("/:id/read", async (req, res, next) => {
  try { await notificationStore.markRead(req.user.id, req.params.id); res.json({ ok: true }); } catch (error) { next(error); }
});

export default router;
