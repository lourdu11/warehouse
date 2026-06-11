// ── OTP Context Helpers ───────────────────────────────────────────────────────
// Shared between LoginPage (write) and OTPPage (read/clear).
// Uses sessionStorage so context survives a page refresh but not a new tab.

const OTP_KEY = "otp_context";

/**
 * Saves OTP context after a successful login credential check.
 * @param {{ isAdmin: boolean, employeeId: string, email: string }} ctx
 */
export function saveOtpContext(ctx) {
  try {
    sessionStorage.setItem(OTP_KEY, JSON.stringify(ctx));
  } catch {
    // sessionStorage unavailable (e.g. private mode restriction) — OTPPage handles null
  }
}

/**
 * Reads and validates OTP context on the OTP page.
 * Returns null if missing, corrupted, or structurally invalid.
 * @returns {{ isAdmin: boolean, employeeId: string, email: string } | null}
 */
export function readOtpContext() {
  try {
    const raw = sessionStorage.getItem(OTP_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    // Validate expected shape before trusting it
    if (
      typeof ctx.employeeId !== "string" ||
      typeof ctx.email      !== "string" ||
      typeof ctx.isAdmin    !== "boolean"
    ) return null;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Clears OTP context after successful OTP verification.
 * Call this before AuthContext navigates away.
 */
export function clearOtpContext() {
  sessionStorage.removeItem(OTP_KEY);
}