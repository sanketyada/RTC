import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/config.js";

// ── JWT ───────────────────────────────────────────────────────────────────────

/**
 * Sign a JWT for an authenticated user.
 * @param {object} payload  – { userId, email }
 */
export function signToken(payload) {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
}

/**
 * Verify & decode a JWT.  Throws on invalid/expired tokens.
 */
export function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

// ── OTP ───────────────────────────────────────────────────────────────────────

/**
 * Generate a 6-digit numeric OTP and an expiry 10 minutes from now.
 */
export function generateOtp() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  return { code, expiresAt };
}

/**
 * Validate an OTP code against a stored { code, expiresAt } object.
 * Returns true only when the code matches AND hasn't expired.
 */
export function validateOtp(storedOtp, incomingCode) {
  if (!storedOtp || !storedOtp.code || !storedOtp.expiresAt) return false;
  if (new Date() > new Date(storedOtp.expiresAt)) return false;
  return storedOtp.code === String(incomingCode);
}

// ── Secure random token ───────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random hex token.
 * Used for the short-lived account-linking challenge token.
 */
export function generateSecureToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("hex");
}
