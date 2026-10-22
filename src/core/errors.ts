export type FlipnoteErrorCode =
  | 'INVALID_FORMAT'
  | 'CORRUPT_DATA'
  | 'INVALID_ARGUMENT'
  | 'INVALID_KEY'
  | 'LIMIT_EXCEEDED'
  | 'UNSUPPORTED';

export class FlipnoteError extends Error {
  readonly code: FlipnoteErrorCode;

  constructor(code: FlipnoteErrorCode, message: string) {
    super(message);
    this.name = 'FlipnoteError';
    this.code = code;
  }
}

export function fail(code: FlipnoteErrorCode, message: string): never {
  throw new FlipnoteError(code, message);
}

export function check(
  condition: unknown,
  code: FlipnoteErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new FlipnoteError(code, message);
}

/** Receives non-fatal problems such as exceeded app limits. */
export type WarningHandler = (message: string) => void;

export const ignoreWarning: WarningHandler = () => undefined;
