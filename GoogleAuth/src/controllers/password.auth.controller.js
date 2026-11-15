import bcrypt from "bcryptjs";
import UserModel from "../model/user.model.js";
import { signToken } from "../utils/token.utils.js";

const SALT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD AUTH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/password/register
 * Body: { email, phone, password, name? }
 *
 * Registers a new user with email + phone + password.
 * Both contacts must be verified (OTP flow) before the account can be used,
 * but this endpoint creates the record and stores the hashed password.
 *
 * NOTE: In a full flow this would typically be called after email & phone OTPs
 * have already been verified in separate steps. Here we keep it self-contained
 * for clients that do it in one form submit.
 */
export async function registerWithPassword(req, res) {
  try {
    const { email, phone, password, name } = req.body;

    if (!email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "email, phone, and password are required.",
      });
    }

    const normalised = email.toLowerCase().trim();

    // Guard: no duplicate email
    const emailConflict = await UserModel.findOne({ email: normalised });
    if (emailConflict) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    // Guard: no duplicate phone
    const phoneConflict = await UserModel.findOne({ phone });
    if (phoneConflict) {
      return res.status(409).json({ success: false, message: "Phone already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await UserModel.create({
      email: normalised,
      phone,
      name,
      password: hashedPassword,
      // Contacts are NOT verified yet — the client must trigger OTP flows
      isEmailVerified: false,
      isPhoneVerified: false,
      registrationStatus: "pending_phone",
    });

    return res.status(201).json({
      success: true,
      message: "Account created. Please verify your email and phone to continue.",
      userId: user._id,
    });
  } catch (err) {
    console.error("[registerWithPassword]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

/**
 * POST /api/auth/password/login
 * Body: { identifier, password }   — identifier = email OR phone
 *
 * Returns a full session JWT only when both contacts are verified.
 * If only one contact is verified, tells the client which step is missing.
 */
export async function loginWithPassword(req, res) {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "identifier (email or phone) and password are required.",
      });
    }

    // Find by email or phone
    const normalised = identifier.toLowerCase().trim();
    const user = await UserModel.findOne({
      $or: [{ email: normalised }, { phone: identifier }],
    }).select("+password");

    if (!user || !user.password) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    // Check verification status
    if (!user.isEmailVerified || !user.isPhoneVerified) {
      return res.status(403).json({
        success: false,
        message: "Please complete verification before signing in.",
        emailVerified: user.isEmailVerified,
        phoneVerified: user.isPhoneVerified,
        userId: user._id,
      });
    }

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
    console.error("[loginWithPassword]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

/**
 * POST /api/auth/password/change
 * Protected route (requires JWT via protect middleware).
 * Body: { currentPassword, newPassword }
 */
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "currentPassword and newPassword are required.",
      });
    }

    const user = await UserModel.findById(req.user._id).select("+password");

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "This account uses Google sign-in and has no password.",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();

    return res.status(200).json({ success: true, message: "Password updated." });
  } catch (err) {
    console.error("[changePassword]", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}
