import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authStore, CODE_TTL_MINUTES } from "../data/marketStore.js";
import { issuedBeforePasswordChange } from "../middleware/auth.js";
import { exposeDevCodes, sendCodeEmail } from "../services/email.js";

// ── TOKEN HELPERS ─────────────────────────────────────────────
const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );

const signRefreshToken = (userId) =>
  jwt.sign({ id: userId, type: "refresh" }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

// Short-lived proofs between steps. They carry a `type`, so they never work as sessions.
const signEmailToken = (email) => jwt.sign({ email, type: "email_verified" }, process.env.JWT_SECRET, { expiresIn: "30m" });
const signChallenge = (userId) => jwt.sign({ id: userId, type: "login_challenge" }, process.env.JWT_SECRET, { expiresIn: `${CODE_TTL_MINUTES}m` });
const readToken = (token, type) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === type) return payload;
  } catch { /* expired or tampered */ }
  return null;
};

/** j••••n@csucc.edu.ph — enough to recognise your own address without revealing it. */
const maskEmail = (email) => {
  const [local, domain] = email.split("@");
  const shown = local.length <= 2 ? local[0] : `${local[0]}${"•".repeat(Math.min(local.length - 2, 6))}${local.at(-1)}`;
  return `${shown}@${domain}`;
};

/** Issues and emails a code; outside production the code is echoed for testing. */
const deliverCode = async (email, purpose, options) => {
  const { code, reused, expires_in, resend_in } = await authStore.issueCode(email, purpose, options);
  if (reused) return { expires_in, resend_in, reused };
  try {
    await sendCodeEmail(email, code, purpose, CODE_TTL_MINUTES);
  } catch (error) {
    console.error(`[email] Could not send a ${purpose} code to ${email}: ${error.message}`);
    await authStore.discardCode(email, purpose);
    throw Object.assign(new Error("We couldn't send the email right now. Please try again in a moment."), { status: 502, expose: true });
  }
  return { expires_in, resend_in, ...(exposeDevCodes() ? { dev_code: code } : {}) };
};

// ── EMAIL CONFIRMATION (sign-up) ─────────────────────────────
export const sendEmailCode = async (req, res, next) => {
  try {
    if (await authStore.emailRegistered(req.body.email)) {
      return res.status(409).json({ error: "This email already has an account. Log in instead." });
    }
    res.json({ sent_to: req.body.email, ...(await deliverCode(req.body.email, "register")) });
  } catch (err) {
    next(err);
  }
};

export const verifyEmailCode = async (req, res, next) => {
  try {
    await authStore.verifyCode(req.body.email, "register", req.body.code);
    res.json({ email_token: signEmailToken(req.body.email) });
  } catch (err) {
    next(err);
  }
};

// ── REGISTER ─────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { email_token, ...payload } = req.body;
    if (readToken(email_token, "email_verified")?.email !== payload.email) {
      return res.status(400).json({ error: "Confirm your email with the code we sent you.", code: "EMAIL_UNVERIFIED" });
    }
    const user = await authStore.registerUser({ ...payload, email_verified: true });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user.id);

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

// ── LOGIN (password, then an emailed code or the security question) ──
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await authStore.loginUser(email, password);
    res.json({
      otp_required: true,
      challenge: signChallenge(user.id),
      sent_to: maskEmail(user.email),
      security_question: user.security_question || null,
      // Re-entering the password within a minute keeps the code already in the inbox.
      ...(await deliverCode(user.email, "login", { reusePending: true })),
    });
  } catch (err) {
    next(err);
  }
};

const challengeUser = async (challenge) => {
  const payload = readToken(challenge, "login_challenge");
  if (!payload) throw Object.assign(new Error("Your sign-in timed out. Enter your password again."), { status: 401, code: "CHALLENGE_EXPIRED" });
  const user = await authStore.getUserWithSecrets(payload.id);
  if (user.is_banned) throw Object.assign(new Error("Account suspended"), { status: 403 });
  return user;
};

export const verifyLogin = async (req, res, next) => {
  try {
    const user = await challengeUser(req.body.challenge);
    if (req.body.code) {
      await authStore.verifyCode(user.email, "login", req.body.code);
      await authStore.markEmailVerified(user.id);
    } else {
      await authStore.verifySecurityAnswer(user, req.body.security_answer);
    }
    const userSafe = await authStore.getUserById(user.id);
    res.json({ user: userSafe, accessToken: signAccessToken(userSafe), refreshToken: signRefreshToken(user.id) });
  } catch (err) {
    if (err.code === "CHALLENGE_EXPIRED") return res.status(401).json({ error: err.message, code: err.code });
    next(err);
  }
};

export const resendLoginCode = async (req, res, next) => {
  try {
    const user = await challengeUser(req.body.challenge);
    res.json({ sent_to: maskEmail(user.email), ...(await deliverCode(user.email, "login")) });
  } catch (err) {
    if (err.code === "CHALLENGE_EXPIRED") return res.status(401).json({ error: err.message, code: err.code });
    next(err);
  }
};

// ── REFRESH TOKEN ────────────────────────────────────────────
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (payload.type !== "refresh") {
      return res.status(401).json({ error: "Invalid token type" });
    }

    const user = await authStore.getUserById(payload.id);
    if (user.is_banned) return res.status(403).json({ error: "Account suspended." });
    if (issuedBeforePasswordChange(payload, user)) return res.status(401).json({ error: "Session expired. Please log in again." });
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user.id);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
};

// ── GET CURRENT USER ─────────────────────────────────────────
export const me = async (req, res, next) => {
  try {
    const user = await authStore.getUserById(req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// ── UPDATE PROFILE ───────────────────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar_url } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (avatar_url) updates.avatar_url = avatar_url;

    const data = await authStore.updateUserProfile(req.user.id, updates);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// ── CHANGE PASSWORD ──────────────────────────────────────────
// Tokens issued before the change stop working; this session gets fresh ones.
export const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await authStore.changePassword(req.user.id, current_password, new_password);
    res.json({ user, accessToken: signAccessToken(user), refreshToken: signRefreshToken(user.id) });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: GET ALL USERS ─────────────────────────────────────
export const getAllUsers = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await authStore.listUsers({
      role: req.query.role,
      status: req.query.status,
      q: req.query.q,
      page: req.query.page || 1,
      limit: req.query.limit || 20,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const submitCredentials = async (req, res, next) => {
  try { res.json(await authStore.submitCredentials(req.user.id, req.body)); } catch (error) { next(error); }
};
