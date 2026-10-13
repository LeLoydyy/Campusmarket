import { Router as AnalyticsRouter } from "express";
import {
  getSalesAnalytics,
  getTopProducts,
  getCategoryBreakdown,
} from "../controllers/analytics.controller.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { stallStore } from "../data/marketStore.js";
import { getPlan } from "../config/plans.js";

const analyticsRouter = AnalyticsRouter();

// Every analytics route: signed-in seller on the Premium plan, or an admin.
analyticsRouter.use(verifyToken, requireRole("seller", "admin"), async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      const stall = await stallStore.getMy(req.user.id);
      if (!getPlan(stall?.tier).analytics) return res.status(403).json({ error: "Product analytics are included in Premium. Request Premium from the Plans page in your seller dashboard.", code: "PREMIUM_REQUIRED" });
    }
    next();
  } catch (error) { next(error); }
});

analyticsRouter.get("/sales", getSalesAnalytics);
analyticsRouter.get("/products/top", getTopProducts);
analyticsRouter.get("/categories", getCategoryBreakdown);

export { analyticsRouter as default };
