export type HashAlgorithm = 'sha1' | 'sha256';
export declare function sha1(bytes: Uint8Array): Uint8Array;
export declare function sha256(bytes: Uint8Array): Uint8Array;
export declare function hash(algorithm: HashAlgorithm, bytes: Uint8Array): Uint8Array;
