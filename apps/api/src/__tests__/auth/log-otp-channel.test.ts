/**
 * LogOTPChannel — unit tests
 *
 * Verifies that the dev-only OTP channel logs to console and does not throw.
 */

import { LogOTPChannel } from '../../modules/auth/otp/log-otp-channel.js';

describe('LogOTPChannel', () => {
  let channel: LogOTPChannel;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    channel = new LogOTPChannel();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('logs the phone and otp to console', async () => {
    await channel.send('+525512345678', '123456');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[DEV] OTP for +525512345678: 123456',
    );
  });

  it('does not throw', async () => {
    await expect(channel.send('+525500000001', '999999')).resolves.not.toThrow();
  });

  it('resolves the returned promise', async () => {
    const result = channel.send('+525500000002', '111111');
    await expect(result).resolves.toBeUndefined();
  });
});
