export class FlipnoteError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'FlipnoteError';
        this.code = code;
    }
}
export function fail(code, message) {
    throw new FlipnoteError(code, message);
}
export function check(condition, code, message) {
    if (!condition)
        throw new FlipnoteError(code, message);
}
export const ignoreWarning = () => undefined;
