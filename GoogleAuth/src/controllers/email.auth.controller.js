import UserModel from "../model/user.model.js";
import { signToken, generateOtp, validateOtp } from "../utils/token.utils.js";
import { sendEmailOtp } from "../utils/notification.utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL OTP AUTH  (sign-in only — email must already exist in the database)
// Flow: send OTP → verify OTP → JWT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/email/send-otp
 * Body: { email }
 *
 * Rejects the request if the email is not registered.
 * OTP is saved to DB only AFTER it has been successfully delivered.
 */
export async function sendEmailOtpHandler(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });
    }

    const normalised = email.toLowerCase().trim();

    // ── 1. User must already exist ────────────────────────────────────────
    const user = await UserModel.findOne({ email: normalised });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email. Please sign up first.",
      });
    }

    // ── 2. Generate OTP (not saved yet) ───────────────────────────────────
    const { code, expiresAt } = generateOtp();

    // ── 3. Deliver OTP first — if this throws, nothing is persisted ───────
    await sendEmailOtp(normalised, code);

    // ── 4. Persist OTP only after successful delivery ─────────────────────
    user.emailOtp = { code, expiresAt };
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email.",
      userId: user._id,
    });
  } catch (err) {
    console.error("[sendEmailOtpHandler]", err);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
}

/**
 * POST /api/auth/email/verify-otp
 * Body: { userId, otp }
 *
 * - Verifies the OTP code and expiry.
 * - If phone is also verified → issues a full session JWT.
 * - If phone is NOT verified  → issues a scoped tempToken so the client
 *   can redirect the user to phone verification next.
 */
export async function verifyEmailOtpHandler(req, res) {
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
    if (!validateOtp(user.emailOtp, otp)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    // ── Mark email verified, clear OTP ────────────────────────────────────
    user.isEmailVerified = true;
    user.emailOtp = undefined;
    await user.save();

    // ── Phone still needs verification ────────────────────────────────────
    if (!user.isPhoneVerified) {
      const tempToken = signToken({ userId: user._id, scope: "phone_verify" });
      return res.status(200).json({
        success: true,
        message: "Email verified. Please verify your phone number to continue.",
        tempToken,
        userId: user._id,
        nextStep: "phone_verify",
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
    console.error("[verifyEmailOtpHandler]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}
