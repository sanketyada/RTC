import express from "express";
import passport from "../config/passport.js";
import { protect } from "../middleware/auth.middleware.js";

// ── Controllers ───────────────────────────────────────────────────────────────
import {
  googleCallback,
  googleRegSendPhoneOtp,
  googleRegVerifyPhoneOtp,
  sendPhoneOtpForExistingUser,
  verifyPhoneOtpAndSignIn,
  confirmAccountLink,
} from "../controllers/google.auth.controller.js";

import {
  sendEmailOtpHandler,
  verifyEmailOtpHandler,
} from "../controllers/email.auth.controller.js";

import {
  sendPhoneOtpHandler,
  verifyPhoneOtpHandler,
} from "../controllers/phone.auth.controller.js";

import {
  registerWithPassword,
  loginWithPassword,
  changePassword,
} from "../controllers/password.auth.controller.js";

// ─────────────────────────────────────────────────────────────────────────────
const router = express.Router();

// ── 1. Google OAuth ───────────────────────────────────────────────────────────
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
    session: false,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/auth/error?reason=google_failed`,
  }),
  googleCallback
);

// New Google user — phone registration
router.post("/google/register/send-otp",  googleRegSendPhoneOtp);
router.post("/google/register/verify-otp", googleRegVerifyPhoneOtp);

// Existing Google user — phone unverified
router.post("/google/verify-phone/send-otp", sendPhoneOtpForExistingUser);
router.post("/google/verify-phone/confirm",  verifyPhoneOtpAndSignIn);

// Account linking (Google ↔ existing email/password account)
router.post("/google/link", confirmAccountLink);

// ── 2. Email OTP ──────────────────────────────────────────────────────────────
router.post("/email/send-otp",    sendEmailOtpHandler);
router.post("/email/verify-otp",  verifyEmailOtpHandler);

// ── 3. Phone OTP ──────────────────────────────────────────────────────────────
router.post("/phone/send-otp",    sendPhoneOtpHandler);
router.post("/phone/verify-otp",  verifyPhoneOtpHandler);

// ── 4. Password ───────────────────────────────────────────────────────────────
router.post("/password/register", registerWithPassword);
router.post("/password/login",    loginWithPassword);
router.post("/password/change",   protect, changePassword);   // requires JWT

// ─────────────────────────────────────────────────────────────────────────────
export default router;
