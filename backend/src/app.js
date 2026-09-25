import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import messageRoutes from "./routes/message.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import behaviorRoutes from "./routes/behavior.routes.js";
import productRoutes from "./routes/product.routes.js";
import stallRoutes from "./routes/stall.routes.js";
import orderRoutes from "./routes/order.routes.js";
import eventRoutes from "./routes/event.routes.js";
import posRoutes from "./routes/pos.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { productPhotoDirectory } from "./middleware/productPhoto.js";
import { ready } from "./data/marketStore.js";
import { databaseLabel } from "./db/index.js";
import { usingSupabaseStorage } from "./services/photoStorage.js";

const app = express();
const PORT = process.env.PORT || 5001;

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// ── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  // Open tabs poll this every few seconds; it needs a login and is a single indexed query.
  skip: (req) => req.method === "GET" && req.path === "/api/notifications/summary",
});
app.use(limiter);

// Stricter limit for password-guessing targets
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." },
});
app.use(["/api/auth/login", "/api/auth/register", "/api/auth/password"], authLimiter);
app.use("/api/product-images", express.static(productPhotoDirectory, { dotfiles: "deny", index: false, maxAge: "1d" }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/products", productRoutes);
app.use("/api/stalls", stallRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", eventRoutes);

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  // Stores throw plain "X not found" errors without a status
  if (status === 500 && /not found/i.test(err.message || "")) status = 404;
  if (status >= 500) console.error("[ERROR]", err);
  // Never expose internal error details to clients
  const message = status >= 500 ? "Internal server error" : err.message || "Request failed";
  res.status(status).json({ error: message });
});

// Connect and apply the schema before accepting requests.
ready()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (database: ${databaseLabel()}, photos: ${usingSupabaseStorage() ? "Supabase Storage" : "local disk"})`);
      if (process.env.NODE_ENV === "production" && !usingSupabaseStorage()) {
        console.warn("[photos] Product photos are stored on local disk and will be lost if this host's disk is reset. Set PHOTO_STORAGE=supabase.");
      }
    });
  })
  .catch((error) => {
    console.error("[db] Unable to start:", error.message);
    process.exit(1);
  });

export default app;
