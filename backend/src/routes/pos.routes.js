import { Router } from "express";
import { posStore, stallStore } from "../data/marketStore.js";
import { getPlan } from "../config/plans.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { validate, posSchema } from "../middleware/validate.js";
const router = Router();
router.use(verifyToken, requireRole("seller"));

// Ringing up sales needs a plan with the point of sale (Premium). Past receipts stay
// readable after a downgrade, so GET /sales is not gated.
const requirePos = async (req, res, next) => {
  try {
    const stall = await stallStore.getMy(req.user.id);
    if (!getPlan(stall?.tier).pos) return res.status(403).json({ error: "The point of sale is included in Premium. Request Premium from the Plans page in your seller dashboard.", code: "PREMIUM_REQUIRED" });
    next();
  } catch (error) { next(error); }
};

router.get("/customers", requirePos, async (req, res, next) => {
  try { res.json(await posStore.customers(req.query.q)); } catch (error) { next(error); }
});
router.get("/sales", async (req, res, next) => {
  try { res.json(await posStore.list(req.user.id)); } catch (error) { next(error); }
});
router.post("/sales", requirePos, validate(posSchema), async (req, res, next) => {
  try { res.status(201).json(await posStore.create(req.user.id, req.body)); } catch (error) { next(error); }
});
export default router;
