import { Router } from "express";

import {
  getEvent,
  getEvents,
  getEventStalls,
  getMySellerApplications,
  getSellerApplications,
  reviewSellerApplication,
  submitSellerApplication,
} from "../controllers/event.controller.js";

import { requireRole, requirePermission, verifyToken } from "../middleware/auth.js";
import { validate, reviewApplicationSchema } from "../middleware/validate.js";

const eventRouter = Router();

// Public event routes
eventRouter.get("/events", getEvents);

eventRouter.get("/events/:eventId/stalls", getEventStalls);

eventRouter.get("/events/:eventId", getEvent);

// Seller submits a stall application
eventRouter.post(
  "/seller-applications",
  verifyToken,
  requireRole("seller"),
  submitSellerApplication,
);

// Seller retrieves only their own applications
eventRouter.get(
  "/seller-applications/my",
  verifyToken,
  requireRole("seller"),
  getMySellerApplications,
);

// Admin retrieves all applications
eventRouter.get(
  "/seller-applications",
  verifyToken,
  requireRole("admin"),
  getSellerApplications,
);

// Admin approves or rejects an application
eventRouter.put(
  "/seller-applications/:id/review",
  verifyToken,
  requireRole("admin"),
  requirePermission("marketplace"),
  validate(reviewApplicationSchema),
  reviewSellerApplication,
);

export default eventRouter;
