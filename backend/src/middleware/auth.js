import jwt from "jsonwebtoken";
import { authStore } from "../data/marketStore.js";

/** True when a token predates the user's last password change (JWT iat is in seconds). */
export const issuedBeforePasswordChange = (payload, user) =>
  Boolean(user.password_changed_at) && payload.iat < Math.floor(Date.parse(user.password_changed_at) / 1000);

/**
 * Verify JWT access token and attach user payload to req.user
 */
export const verifySession = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Only access tokens are untyped; refresh, sign-in challenge and email tokens are not sessions.
    if (decoded.type) return res.status(401).json({ error: "An access token is required." });
    const user = await authStore.getUserById(decoded.id);
    if (user.is_banned) return res.status(403).json({ error: "Account suspended." });
    if (issuedBeforePasswordChange(decoded, user)) return res.status(401).json({ error: "Token expired" });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};

export const verifyToken = (req, res, next) => verifySession(req, res, () => {
  if (req.user.status !== "approved") return res.status(403).json({ error: "Your CSUCC registration must be approved before using this feature.", code: "APPROVAL_REQUIRED" });
  next();
});

/**
 * Role-based access control middleware
 * Usage: requireRole("admin") or requireRole("seller", "admin")
 */
export const requireRole = (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };

/**
 * Optional auth — attaches user if token present, continues if not
 */
export const optionalAuth = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
      if (decoded.type !== "refresh") {
        const user = await authStore.getUserById(decoded.id);
        if (!user.is_banned && user.status === "approved") req.user = user;
      }
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
};