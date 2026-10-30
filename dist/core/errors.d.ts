export type FlipnoteErrorCode = 'INVALID_FORMAT' | 'CORRUPT_DATA' | 'INVALID_ARGUMENT' | 'INVALID_KEY' | 'LIMIT_EXCEEDED' | 'UNSUPPORTED';
export declare class FlipnoteError extends Error {
    readonly code: FlipnoteErrorCode;
    constructor(code: FlipnoteErrorCode, message: string);
}
export declare function fail(code: FlipnoteErrorCode, message: string): never;
export declare function check(condition: unknown, code: FlipnoteErrorCode, message: string): asserts condition;
/** Receives non-fatal problems such as exceeded app limits. */
export type WarningHandler = (message: string) => void;
export declare const ignoreWarning: WarningHandler;
