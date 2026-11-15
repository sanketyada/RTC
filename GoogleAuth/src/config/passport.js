import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { config } from "./config.js";

/**
 * Passport Google Strategy.
 *
 * We intentionally do NOT touch the database here.
 * The strategy just verifies the token with Google and returns
 * the raw profile.  All DB logic lives in the route controller
 * so the flow (new user vs existing vs linking) is explicit and testable.
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: config.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Pass raw profile through; the callback route decides what to do.
        return done(null, profile);
      } catch (err) {
        return done(err);
      }
    }
  )
);

export default passport;
