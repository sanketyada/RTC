import { Resend } from "resend";
import twilio from "twilio";
import { config } from "../config/config.js";

// ── Resend client ─────────────────────────────────────────────────────────────
const resend = new Resend(config.RESEND_API_KEY);

/**
 * Send an email OTP via Resend.
 * @param {string} to    – recipient email address
 * @param {string} otp   – 6-digit OTP string
 */
export async function sendEmailOtp(to, otp) {
  await resend.emails.send({
    from: config.RESEND_FROM_EMAIL,
    to,
    subject: "Your verification code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Verify your email</h2>
        <p>Use the code below to complete your sign-in. It expires in <strong>10 minutes</strong>.</p>
        <p style="font-size:2rem;font-weight:bold;letter-spacing:0.25em">${otp}</p>
        <p style="color:#888;font-size:0.85rem">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

// ── Twilio client ─────────────────────────────────────────────────────────────
const twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

/**
 * Send an SMS OTP via Twilio.
 * @param {string} to    – E.164 phone number, e.g. "+919876543210"
 * @param {string} otp   – 6-digit OTP string
 */
export async function sendSmsOtp(to, otp) {
  await twilioClient.messages.create({
    body: `Your verification code is ${otp}. It expires in 10 minutes. Do not share it.`,
    from: config.TWILIO_PHONE_NUMBER,
    to,
  });
}
