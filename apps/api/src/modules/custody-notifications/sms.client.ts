// ---------------------------------------------------------------------------
// sms.client.ts — SMS delivery abstraction for the custody-notifications module
// ---------------------------------------------------------------------------

export interface ISmsClient {
  send(phone: string, message: string): Promise<void>;
}

/**
 * LogSmsClient — development/test SMS delivery.
 * Prints the message to stdout instead of sending a real SMS.
 */
export class LogSmsClient implements ISmsClient {
  async send(phone: string, message: string): Promise<void> {
    console.log(`[SMS] to=${phone} message="${message}"`);
  }
}
