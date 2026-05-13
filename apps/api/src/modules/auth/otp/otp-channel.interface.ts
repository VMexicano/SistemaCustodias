/**
 * OTPChannel — abstraction for OTP delivery (ADR-018).
 *
 * Implementations:
 *  - LogOTPChannel   → development (OTP printed to server logs)
 *  - FirebaseOTPChannel → production (Firebase Cloud Messaging / SMS)
 *
 * Selection is controlled by OTP_PROVIDER env variable and handled
 * in app.ts — never inside this interface or its implementations.
 */
export interface OTPChannel {
  send(phone: string, otp: string): Promise<void>;
}
