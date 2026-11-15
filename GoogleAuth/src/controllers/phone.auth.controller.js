import UserModel from "../model/user.model.js";
import { signToken, generateOtp, validateOtp } from "../utils/token.utils.js";
import { sendSmsOtp } from "../utils/notification.utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// PHONE OTP AUTH  (sign-in only — phone must already exist in the database)
// Flow: send OTP → verify OTP → JWT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/phone/send-otp
 * Body: { phone }   (E.164 format, e.g. "+919876543210")
 *
 * Rejects the request if the phone number is not registered.
 * OTP is saved to DB only AFTER it has been successfully delivered.
 */
export async function sendPhoneOtpHandler(req, res) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number is required." });
    }

    // ── 1. User must already exist ────────────────────────────────────────
    const user = await UserModel.findOne({ phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this phone number. Please sign up first.",
      });
    }

    // ── 2. Generate OTP (not saved yet) ───────────────────────────────────
    const { code, expiresAt } = generateOtp();

    // ── 3. Deliver OTP first — if this throws, nothing is persisted ───────
    await sendSmsOtp(phone, code);

    // ── 4. Persist OTP only after successful delivery ─────────────────────
    user.phoneOtp = { code, expiresAt };
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP sent to your mobile number.",
      userId: user._id,
    });
  } catch (err) {
    console.error("[sendPhoneOtpHandler]", err);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
}

/**
 * POST /api/auth/phone/verify-otp
 * Body: { userId, otp }
 *
 * - Verifies the OTP code and expiry.
 * - If email is also verified → issues a full session JWT.
 * - If email is NOT verified  → issues a scoped tempToken so the client
 *   can redirect the user to email verification next.
 */
export async function verifyPhoneOtpHandler(req, res) {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "userId and otp are required." });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // ── Validate OTP (checks both code match and expiry) ─────────────────
    if (!validateOtp(user.phoneOtp, otp)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    // ── Mark phone verified, clear OTP ────────────────────────────────────
    user.isPhoneVerified = true;
    user.phoneOtp = undefined;
    await user.save();

    // ── Email still needs verification ────────────────────────────────────
    if (!user.isEmailVerified) {
      const tempToken = signToken({ userId: user._id, scope: "email_verify" });
      return res.status(200).json({
        success: true,
        message: "Phone verified. Please verify your email address to continue.",
        tempToken,
        userId: user._id,
        nextStep: "email_verify",
      });
    }

    // ── Fully verified → issue session JWT ────────────────────────────────
    const token = signToken({ userId: user._id, email: user.email });
    return res.status(200).json({
      success: true,
      message: "Signed in successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("[verifyPhoneOtpHandler]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}
