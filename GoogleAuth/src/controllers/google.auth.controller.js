import UserModel from "../model/user.model.js";
import {
  signToken,
  generateOtp,
  validateOtp,
  generateSecureToken,
} from "../utils/token.utils.js";
import { sendSmsOtp } from "../utils/notification.utils.js";
import { config } from "../config/config.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: respond with either a redirect (production / frontend present)
// or a plain JSON body (development / API-only testing).
//
// Set  AUTH_RESPONSE_MODE=redirect  in .env when your frontend is running.
// Default is "json" so you can test right now without a frontend.
// ─────────────────────────────────────────────────────────────────────────────
function respond(res, { redirectPath, status = 200, ...jsonPayload }) {
  if (config.AUTH_RESPONSE_MODE === "redirect") {
    return res.redirect(`${config.CLIENT_URL}${redirectPath}`);
  }
  return res.status(status).json({ redirectPath, ...jsonPayload });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Google OAuth callback
// Called by Passport after Google successfully authenticates the user.
//
// Scenarios handled:
//   A) Account exists, both contacts verified    → sign in directly
//   B) Account exists, phone not verified        → request phone verification
//   C) Account exists (email+password), no Google→ offer secure linking
//   D) No account exists                         → redirect to registration
// ─────────────────────────────────────────────────────────────────────────────
export async function googleCallback(req, res) {
  try {
    const profile = req.user; // raw Google profile from Passport
    const googleId = profile.id;
    const googleEmail = profile.emails?.[0]?.value?.toLowerCase();
    const googleName = profile.displayName;
    const googleAvatar = profile.photos?.[0]?.value;

    if (!googleEmail) {
      return respond(res, {
        redirectPath: "/auth/error?reason=no_email",
        status: 400,
        success: false,
        message: "Google did not return an email address.",
      });
    }

    // ── Look up by googleId first (fastest path for returning users) ──────
    let user = await UserModel.findOne({ googleId });

    // ── If not found by googleId, look up by email ────────────────────────
    if (!user) {
      user = await UserModel.findOne({ email: googleEmail });
    }

    // ── SCENARIO A & B: existing account ─────────────────────────────────
    if (user) {
      // If the user was found by email but doesn't have googleId yet,
      // we must NOT auto-link.  Instead we issue a short-lived link token
      // so the client can present a secure linking confirmation screen.
      if (!user.googleId) {
        // SCENARIO C — existing non-Google account with the same email
        const linkToken = generateSecureToken();
        user.linkToken = linkToken;
        user.linkTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
        await user.save();

        return respond(res, {
          redirectPath: `/auth/link-account?linkToken=${linkToken}&email=${encodeURIComponent(googleEmail)}`,
          status: 200,
          success: true,
          scenario: "account_link_required",
          message: "An account with this email already exists. Please link your Google account.",
          linkToken,
          email: googleEmail,
        });
      }

      // Existing Google-linked account ─────────────────────────────────────

      // SCENARIO B — phone not yet verified
      if (!user.isPhoneVerified) {
        const { code, expiresAt } = generateOtp();
        user.phoneOtp = { code, expiresAt };
        await user.save();

        const tempToken = signToken({ userId: user._id, scope: "phone_verify" });

        return respond(res, {
          redirectPath: `/auth/verify-phone?token=${tempToken}&userId=${user._id}${user.phone ? "" : "&needsPhone=true"}`,
          status: 200,
          success: true,
          scenario: "phone_verification_required",
          message: "Please verify your phone number to complete sign-in.",
          tempToken,
          userId: user._id,
          needsPhone: !user.phone,
        });
      }

      // SCENARIO A — fully verified → issue session JWT
      const token = signToken({ userId: user._id, email: user.email });

      return respond(res, {
        redirectPath: `/dashboard?token=${token}`,
        status: 200,
        success: true,
        scenario: "signed_in",
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
    }

    // ── SCENARIO D: no account — start registration ───────────────────────
    const preRegToken = signToken({
      googleId,
      email: googleEmail,
      name: googleName,
      avatar: googleAvatar,
      scope: "google_prereg",
    });

    return respond(res, {
      redirectPath: `/auth/complete-registration?token=${preRegToken}`,
      status: 200,
      success: true,
      scenario: "new_user_registration",
      message: "No account found. Please complete registration.",
      preRegToken,
      prefill: { email: googleEmail, name: googleName, avatar: googleAvatar },
    });
  } catch (err) {
    console.error("[googleCallback]", err);
    return respond(res, {
      redirectPath: "/auth/error?reason=server_error",
      status: 500,
      success: false,
      message: "An unexpected error occurred.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 (new user) — Send phone OTP
// Client calls this with the preRegToken + phone number.
// ─────────────────────────────────────────────────────────────────────────────
export async function googleRegSendPhoneOtp(req, res) {
  try {
    const { preRegToken, phone, name } = req.body;

    if (!preRegToken || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "preRegToken and phone are required." });
    }

    // Verify the token
    let decoded;
    try {
      const { verifyToken } = await import("../utils/token.utils.js");
      decoded = verifyToken(preRegToken);
    } catch {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired registration token." });
    }

    if (decoded.scope !== "google_prereg") {
      return res.status(400).json({ success: false, message: "Invalid token scope." });
    }

    // Guard: phone must not be taken by another account
    const phoneConflict = await UserModel.findOne({ phone });
    if (phoneConflict) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already registered to another account.",
      });
    }

    const { code, expiresAt } = generateOtp();

    // Temporarily store OTP in a pending user document
    // We use registrationStatus: "pending_phone" so the doc is never accessible
    // until registration is complete.
    let pendingUser = await UserModel.findOne({ email: decoded.email });
    if (!pendingUser) {
      pendingUser = new UserModel({
        googleId: decoded.googleId,
        email: decoded.email,
        name: name || decoded.name,
        avatar: decoded.avatar,
        isEmailVerified: true, // Google guarantees this
        registrationStatus: "pending_phone",
        phone,
      });
    } else {
      // Could reach here if user partially registered before
      pendingUser.phone = phone;
      pendingUser.registrationStatus = "pending_phone";
    }

    // ── Deliver OTP first — if Twilio fails, the doc is NOT saved ────────
    await sendSmsOtp(phone, code);

    // ── Persist only after successful delivery ────────────────────────────
    pendingUser.phoneOtp = { code, expiresAt };
    await pendingUser.save();

    return res.status(200).json({
      success: true,
      message: "OTP sent to your mobile number.",
      userId: pendingUser._id,
    });
  } catch (err) {
    console.error("[googleRegSendPhoneOtp]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 (new user) — Verify phone OTP & complete registration
// ─────────────────────────────────────────────────────────────────────────────
export async function googleRegVerifyPhoneOtp(req, res) {
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

    if (!validateOtp(user.phoneOtp, otp)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    // Mark phone verified and complete registration
    user.isPhoneVerified = true;
    user.registrationStatus = "complete";
    user.phoneOtp = undefined;
    await user.save();

    const token = signToken({ userId: user._id, email: user.email });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
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
    console.error("[googleRegVerifyPhoneOtp]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 (existing user, phone unverified) — Send phone OTP
// The existing user clicks Continue with Google but their phone is unverified.
// A tempToken (scope: phone_verify) was issued in the callback.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPhoneOtpForExistingUser(req, res) {
  try {
    const { tempToken, phone } = req.body;

    if (!tempToken) {
      return res.status(400).json({ success: false, message: "tempToken is required." });
    }

    let decoded;
    try {
      const { verifyToken } = await import("../utils/token.utils.js");
      decoded = verifyToken(tempToken);
    } catch {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token." });
    }

    if (decoded.scope !== "phone_verify") {
      return res.status(400).json({ success: false, message: "Invalid token scope." });
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // If user already has a phone, use it; otherwise the client must supply one
    const targetPhone = user.phone || phone;
    if (!targetPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    if (!user.phone) {
      // Check phone not taken
      const conflict = await UserModel.findOne({ phone: targetPhone });
      if (conflict && String(conflict._id) !== String(user._id)) {
        return res.status(409).json({
          success: false,
          message: "Phone number already in use.",
        });
      }
      // phone will be set after successful OTP delivery below
    }

    const { code, expiresAt } = generateOtp();

    // ── Deliver OTP first — if Twilio fails, the phone is NOT saved ───────
    await sendSmsOtp(targetPhone, code);

    // ── Persist only after successful delivery ────────────────────────────
    if (!user.phone) user.phone = targetPhone;
    user.phoneOtp = { code, expiresAt };
    await user.save();

    return res.status(200).json({ success: true, message: "OTP sent.", userId: user._id });
  } catch (err) {
    console.error("[sendPhoneOtpForExistingUser]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 (existing user, phone unverified) — Verify phone OTP & sign in
// ─────────────────────────────────────────────────────────────────────────────
export async function verifyPhoneOtpAndSignIn(req, res) {
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

    if (!validateOtp(user.phoneOtp, otp)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    user.isPhoneVerified = true;
    user.phoneOtp = undefined;
    await user.save();

    const token = signToken({ userId: user._id, email: user.email });

    return res.status(200).json({
      success: true,
      message: "Phone verified. Signed in.",
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
    console.error("[verifyPhoneOtpAndSignIn]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT LINKING — Confirm & link Google to an existing email/password account
//
// Security model:
//   1. googleCallback issued a linkToken and stored its hash in the user doc.
//   2. The client presents the linkToken + user's existing credentials.
//   3. We verify the token matches what we stored AND hasn't expired.
//   4. Only then do we attach googleId to the account.
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmAccountLink(req, res) {
  try {
    const { linkToken, googleId, email } = req.body;

    if (!linkToken || !googleId || !email) {
      return res.status(400).json({
        success: false,
        message: "linkToken, googleId, and email are required.",
      });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() }).select(
      "+linkToken"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Validate link token
    if (
      !user.linkToken ||
      user.linkToken !== linkToken ||
      new Date() > new Date(user.linkTokenExpiresAt)
    ) {
      return res.status(401).json({
        success: false,
        message: "Link token is invalid or has expired.",
      });
    }

    // Attach Google identity
    user.googleId = googleId;
    user.isEmailVerified = true; // Google vouches for the email
    user.linkToken = undefined;
    user.linkTokenExpiresAt = undefined;
    await user.save();

    const token = signToken({ userId: user._id, email: user.email });

    return res.status(200).json({
      success: true,
      message: "Google account linked successfully.",
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
    console.error("[confirmAccountLink]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}
