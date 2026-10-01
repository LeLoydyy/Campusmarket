import { Router } from "express";
import { authStore } from "../data/marketStore.js";
import { stallSchema } from "../middleware/validate.js";
import { register, login, refresh, me, updateProfile, submitCredentials, changePassword, sendEmailCode, verifyEmailCode, verifyLogin, resendLoginCode } from "../controllers/auth.controller.js";
import { verifyToken, verifySession } from "../middleware/auth.js";
import { validate, registerSchema, loginSchema, credentialsSchema, changePasswordSchema, profileSchema, sendCodeSchema, verifyEmailSchema, loginVerifySchema, loginResendSchema } from "../middleware/validate.js";
 
const router = Router();
 
router.post("/email/send-code", validate(sendCodeSchema), sendEmailCode);
router.post("/email/verify", validate(verifyEmailSchema), verifyEmailCode);
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/login/verify", validate(loginVerifySchema), verifyLogin);
router.post("/login/resend", validate(loginResendSchema), resendLoginCode);
router.post("/refresh", refresh);
router.get("/me", verifySession, me);
router.put("/credentials", verifySession, validate(credentialsSchema), submitCredentials);
router.put("/profile", verifyToken, validate(profileSchema), updateProfile);
router.put("/password", verifySession, validate(changePasswordSchema), changePassword);
router.post("/start-selling", verifyToken, validate(stallSchema), async (req, res, next) => {
  try { res.status(201).json(await authStore.startSelling(req.user.id, req.body)); } catch (error) { next(error); }
});
 
export default router;
