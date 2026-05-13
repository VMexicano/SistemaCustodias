import type { OTPChannel } from './otp-channel.interface.js';

/**
 * LogOTPChannel — development-only OTP delivery.
 *
 * Prints the OTP to stdout instead of sending an SMS.
 * Never use in production: OTP is visible in plain text in log output.
 */
export class LogOTPChannel implements OTPChannel {
  async send(phone: string, otp: string): Promise<void> {
    console.log(`[DEV] OTP for ${phone}: ${otp}`);
  }
}
