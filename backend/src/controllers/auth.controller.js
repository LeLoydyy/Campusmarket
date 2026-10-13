import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authStore, sessionStore, stallStore, CODE_TTL_MINUTES } from "../data/marketStore.js";
import { isOnShift, withShift } from "../config/admins.js";
import { issuedBeforePasswordChange } from "../middleware/auth.js";
import { exposeDevCodes, sendCodeEmail } from "../services/email.js";

// ── TOKEN HELPERS ─────────────────────────────────────────────
// `sid` is the login-log row of this sign-in: logout closes it, and a closed one can't be refreshed.
const signAccessToken = (user, sid) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, ...(sid ? { sid } : {}) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );

const signRefreshToken = (userId, sid) =>
  jwt.sign({ id: userId, type: "refresh", ...(sid ? { sid } : {}) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

/** The user as the browser sees it: shift details for admins, the stall plan for sellers (drives PRO badges). */
const accountView = async (user) => {
  const view = withShift(user);
  if (user.role !== "seller") return view;
  const stall = await stallStore.getMy(user.id);
  return { ...view, stall_plan: stall ? { tier: stall.tier, premium_until: stall.premium_until } : null };
};

/** Records the sign-in in the login log and returns the session payload sent to the browser. */
const openSession = async (req, userId) => {
  const user = await authStore.getUserById(userId);
  const sid = await sessionStore.start(user, { ip: req.ip, userAgent: req.get("user-agent") });
  return { user: await accountView(user), accessToken: signAccessToken(user, sid), refreshToken: signRefreshToken(user.id, sid) };
};

/** Same session, new tokens (after a password change, which invalidates older tokens). */
const renewTokens = (req, user) => ({ user: withShift(user), accessToken: signAccessToken(user, req.sid), refreshToken: signRefreshToken(user.id, req.sid) });

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
    res.status(201).json(await openSession(req, user.id));
  } catch (err) {
    next(err);
  }
};

// ── LOGIN (password, then an emailed code or the security question) ──
const DEMO_EMAILS = new Set(["seller@campusmarket.test", "buyer@campusmarket.test"]);

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await authStore.loginUser(email, password);
    // Admins and the seeded demo accounts skip the emailed code locally for quick access; production still requires it.
    const skipsCode = user.role === "admin" || DEMO_EMAILS.has(user.email.toLowerCase());
    if (skipsCode && process.env.NODE_ENV !== "production") return res.json(await openSession(req, user.id));
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
  if (user.is_banned || user.deleted_at) throw Object.assign(new Error("Account suspended"), { status: 403 });
  if (!isOnShift(user)) throw Object.assign(new Error("Your shift has ended. Sign in during your next shift."), { status: 403, code: "OFF_SHIFT" });
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
    res.json(await openSession(req, user.id));
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
    if (user.is_banned || user.deleted_at) return res.status(403).json({ error: "Account suspended." });
    if (issuedBeforePasswordChange(payload, user)) return res.status(401).json({ error: "Session expired. Please log in again." });
    // Signed out, blocked, reset or ended by a shift: this sign-in is over.
    if (payload.sid && !(await sessionStore.isOpen(payload.sid, user.id))) return res.status(401).json({ error: "Session ended. Please log in again." });
    if (!isOnShift(user)) {
      if (payload.sid) await sessionStore.end(payload.sid, user.id, "shift_ended");
      return res.status(401).json({ error: "Your shift has ended. You've been signed out.", code: "SHIFT_ENDED" });
    }
    if (payload.sid) await sessionStore.touch(payload.sid, user.id);

    res.json({ accessToken: signAccessToken(user, payload.sid), refreshToken: signRefreshToken(user.id, payload.sid) });
  } catch (err) {
    next(err);
  }
};

// ── GET CURRENT USER ─────────────────────────────────────────
export const me = async (req, res, next) => {
  try {
    const user = await authStore.getUserById(req.user.id);
    res.json(await accountView(user));
  } catch (err) {
    next(err);
  }
};

// ── LOGOUT (closes this sign-in in the login log) ────────────
export const logout = async (req, res, next) => {
  try {
    if (req.sid) await sessionStore.end(req.sid, req.user.id, req.body?.reason === "shift_ended" ? "shift_ended" : "logout");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── FIRST-LOGIN SETUP (admins created by another admin) ──────
export const completeSetup = async (req, res, next) => {
  try {
    const user = await authStore.completeSetup(req.user.id, req.body);
    res.json(renewTokens(req, user));
  } catch (err) {
    next(err);
  }
};

// ── RECOVERY QUESTIONS (set or replace all three) ────────────
export const setRecoveryQuestions = async (req, res, next) => {
  try {
    res.json(withShift(await authStore.setRecoveryQuestions(req.user.id, req.body.current_password, req.body.security_questions)));
  } catch (err) {
    next(err);
  }
};

// ── FORGOT PASSWORD: code → questions → new password ─────────
// Unknown emails get the same answer as real ones, so the form can't be used to find accounts.
export const forgotStart = async (req, res, next) => {
  try {
    const account = await authStore.resetAccount(req.body.email);
    if (!account) return res.json({ sent_to: maskEmail(req.body.email), expires_in: CODE_TTL_MINUTES * 60, resend_in: 60 });
    res.json({ sent_to: maskEmail(account.email), ...(await deliverCode(account.email, "reset")) });
  } catch (err) {
    next(err);
  }
};

export const forgotVerify = async (req, res, next) => {
  try {
    res.json(await authStore.checkResetCode(req.body.email, req.body.code));
  } catch (err) {
    next(err);
  }
};

export const forgotComplete = async (req, res, next) => {
  try {
    const { email, code, answers, new_password } = req.body;
    await authStore.completeReset(email, code, answers, new_password);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── MY LOGIN HISTORY ─────────────────────────────────────────
export const myLogins = async (req, res, next) => {
  try {
    const { month, date, page, limit } = req.query;
    res.json(await sessionStore.list({ userId: req.user.id, month, date, page, limit }));
  } catch (err) {
    next(err);
  }
};

// ── UPDATE PROFILE ───────────────────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar_url, phone, address } = req.body;
    const updates = {};
    if (name) updates.name = name;
    // Empty strings clear the photo, phone or delivery location.
    for (const [key, value] of Object.entries({ avatar_url, phone, address })) if (value !== undefined) updates[key] = value;

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
    await sessionStore.endOthers(user.id, req.sid, "password_changed");
    res.json(renewTokens(req, user));
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
      month: req.query.month,
      date: req.query.date,
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
