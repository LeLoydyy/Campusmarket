import { Router } from "express";
import { authStore } from "../data/marketStore.js";
import { stallSchema } from "../middleware/validate.js";
import {
  register, login, refresh, me, updateProfile, submitCredentials, changePassword, sendEmailCode, verifyEmailCode, verifyLogin, resendLoginCode,
  logout, completeSetup, setRecoveryQuestions, forgotStart, forgotVerify, forgotComplete, myLogins,
} from "../controllers/auth.controller.js";
import { verifyToken, verifySession } from "../middleware/auth.js";
import {
  validate, registerSchema, loginSchema, credentialsSchema, changePasswordSchema, profileSchema, sendCodeSchema, verifyEmailSchema,
  loginVerifySchema, loginResendSchema, setupSchema, recoveryQuestionsSchema, forgotStartSchema, forgotVerifySchema, forgotCompleteSchema,
} from "../middleware/validate.js";

const router = Router();

router.post("/email/send-code", validate(sendCodeSchema), sendEmailCode);
router.post("/email/verify", validate(verifyEmailSchema), verifyEmailCode);
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/login/verify", validate(loginVerifySchema), verifyLogin);
router.post("/login/resend", validate(loginResendSchema), resendLoginCode);
router.post("/forgot/start", validate(forgotStartSchema), forgotStart);
router.post("/forgot/verify", validate(forgotVerifySchema), forgotVerify);
router.post("/forgot/complete", validate(forgotCompleteSchema), forgotComplete);
router.post("/refresh", refresh);
router.post("/logout", verifySession, logout);
router.get("/me", verifySession, me);
router.get("/logins", verifySession, myLogins);
router.put("/setup", verifySession, validate(setupSchema), completeSetup);
router.put("/recovery-questions", verifySession, validate(recoveryQuestionsSchema), setRecoveryQuestions);
router.put("/credentials", verifySession, validate(credentialsSchema), submitCredentials);
router.put("/profile", verifyToken, validate(profileSchema), updateProfile);
router.put("/password", verifySession, validate(changePasswordSchema), changePassword);
router.post("/start-selling", verifyToken, validate(stallSchema), async (req, res, next) => {
  try { res.status(201).json(await authStore.startSelling(req.user.id, req.body)); } catch (error) { next(error); }
});

export default router;
