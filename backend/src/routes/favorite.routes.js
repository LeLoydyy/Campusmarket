import { Router } from "express";
import { favoriteStore } from "../data/marketStore.js";
import { verifyToken } from "../middleware/auth.js";
import { validate, favoritesSchema } from "../middleware/validate.js";

// Saved products follow the signed-in user across devices.
const router = Router();
router.use(verifyToken);

router.get("/", async (req, res, next) => {
  try { res.json(await favoriteStore.list(req.user.id)); } catch (error) { next(error); }
});
router.get("/ids", async (req, res, next) => {
  try { res.json(await favoriteStore.ids(req.user.id)); } catch (error) { next(error); }
});
router.post("/", validate(favoritesSchema), async (req, res, next) => {
  try { res.json(await favoriteStore.add(req.user.id, req.body.product_ids)); } catch (error) { next(error); }
});
router.delete("/:productId", async (req, res, next) => {
  try { res.json(await favoriteStore.remove(req.user.id, req.params.productId)); } catch (error) { next(error); }
});

export default router;
