import { Router } from "express";
import { statsStore } from "../data/marketStore.js";

const router = Router();

// GET /api/stats/public — home page counts and an anonymous "just ordered" feed
router.get("/public", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=30");
    res.json(await statsStore.publicSummary());
  } catch (error) { next(error); }
});

export default router;
