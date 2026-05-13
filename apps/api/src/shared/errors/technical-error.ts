const STATUS_CODE_MAP: Record<string, number> = {
  STRIPE_UNAVAILABLE: 502,
};

export class TechnicalError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly originalError: unknown;

  constructor(code: string, originalError?: unknown) {
    super(code);
    this.name = 'TechnicalError';
    this.code = code;
    this.statusCode = STATUS_CODE_MAP[code] ?? 500;
    this.originalError = originalError;
  }
}
