import mongoose from "mongoose";

/**
 * Single User collection — one document per real person.
 * Auth methods (Google, password, OTP) are stored alongside,
 * so we never create duplicate accounts for the same email.
 */
const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────
    name: { type: String, trim: true },
    avatar: { type: String },

    // ── Email ─────────────────────────────────────────────────
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    isEmailVerified: { type: Boolean, default: false },

    // ── Phone ─────────────────────────────────────────────────
    phone: {
      type: String,
      unique: true,
      sparse: true, // allows multiple null values
      trim: true,
    },
    isPhoneVerified: { type: Boolean, default: false },

    // ── Auth providers ────────────────────────────────────────
    googleId: { type: String, unique: true, sparse: true },

    // Password (optional — Google-only users have no password)
    password: { type: String, select: false },

    // ── OTP buckets ───────────────────────────────────────────
    emailOtp: {
      code: String,
      expiresAt: Date,
    },
    phoneOtp: {
      code: String,
      expiresAt: Date,
    },

    // ── Registration state ────────────────────────────────────
    // Tracks incomplete Google sign-ups before phone is verified
    registrationStatus: {
      type: String,
      enum: ["pending_phone", "complete"],
      default: "complete",
    },

    // ── Account linking token (short-lived) ───────────────────
    linkToken: { type: String, select: false },
    linkTokenExpiresAt: Date,
  },
  { timestamps: true }
);

// Virtual: is this account fully usable?
userSchema.virtual("isFullyVerified").get(function () {
  return this.isEmailVerified && this.isPhoneVerified;
});

const UserModel = mongoose.model("User", userSchema);
export default UserModel;
