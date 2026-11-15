import { verifyToken } from "../utils/token.utils.js";
import UserModel from "../model/user.model.js";

/**
 * Protect a route — requires a valid JWT in the Authorization header.
 * Attaches req.user (the Mongoose document) on success.
 */
export async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token); // throws if invalid/expired

    const user = await UserModel.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found." });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
}

/**
 * Guard that blocks access until both email AND phone are verified.
 * Place after `protect`.
 */
export function requireFullyVerified(req, res, next) {
  if (!req.user.isEmailVerified || !req.user.isPhoneVerified) {
    return res.status(403).json({
      success: false,
      message: "Complete verification (email + phone) to access this resource.",
      emailVerified: req.user.isEmailVerified,
      phoneVerified: req.user.isPhoneVerified,
    });
  }
  next();
}
