import type * as admin from 'firebase-admin';
import type { OTPChannel } from './otp-channel.interface.js';

/**
 * FirebaseOTPChannel — production OTP delivery via Firebase Admin SDK.
 *
 * This class is exported but NOT instantiated here. Instantiation is
 * conditional on OTP_PROVIDER=firebase and happens in app.ts.
 *
 * Requires environment variables:
 *  - FIREBASE_PROJECT_ID
 *  - FIREBASE_CLIENT_EMAIL
 *  - FIREBASE_PRIVATE_KEY
 */
export class FirebaseOTPChannel implements OTPChannel {
  private readonly messaging: admin.messaging.Messaging;

  constructor(firebaseApp: admin.app.App) {
    this.messaging = firebaseApp.messaging();
  }

  async send(phone: string, otp: string): Promise<void> {
    // Firebase does not expose a direct SMS API — sending via a Cloud Function
    // or a provider-specific topic is the standard pattern. Here we send a
    // data-only message to a topic derived from the phone number; the
    // companion Cloud Function forwards it to the SMS gateway.
    await this.messaging.send({
      topic: `otp_${phone.replace(/\D/g, '')}`,
      data: {
        otp,
        phone,
      },
    });
  }
}
