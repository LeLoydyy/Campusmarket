import { Router } from "express";
import { reviewStore } from "../data/marketStore.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { validate, reviewSchema, reviewReplySchema } from "../middleware/validate.js";

// Buyers rate products from finished orders; sellers read the reviews on their products.
const router = Router();
router.use(verifyToken);

router.post("/", requireRole("buyer"), validate(reviewSchema), async (req, res, next) => {
  try { res.status(201).json(await reviewStore.save(req.user.id, req.body)); } catch (error) { next(error); }
});
router.put("/:id/reply", requireRole("seller"), validate(reviewReplySchema), async (req, res, next) => {
  try { res.json(await reviewStore.reply(req.user.id, req.params.id, req.body.reply)); } catch (error) { next(error); }
});
router.get("/mine", requireRole("seller"), async (req, res, next) => {
  try { res.json(await reviewStore.listForSeller(req.user.id)); } catch (error) { next(error); }
});

export default router;
