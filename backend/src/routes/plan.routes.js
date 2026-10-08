import { Router } from "express";
import { planStore } from "../data/marketStore.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { validate, planRequestSchema } from "../middleware/validate.js";

// Sellers: their plan, Premium requests. Admins review requests under /api/admin/plan-requests.
const router = Router();
router.use(verifyToken, requireRole("seller"));

router.get("/my", async (req, res, next) => {
  try { res.json(await planStore.overview(req.user.id, { feature: req.query.feature })); } catch (error) { next(error); }
});
router.post("/requests", validate(planRequestSchema), async (req, res, next) => {
  try { res.status(201).json(await planStore.request(req.user.id, req.body)); } catch (error) { next(error); }
});
router.delete("/requests/pending", async (req, res, next) => {
  try { res.json(await planStore.cancel(req.user.id)); } catch (error) { next(error); }
});

export default router;
