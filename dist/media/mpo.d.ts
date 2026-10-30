/**
 * Joins left and right JPEGs into an MPO (CIPA DC-007 multi-picture object),
 * the stereo photo format of the Nintendo 3DS camera and most 3D viewers.
 */
export declare function encodeMpo(left: Uint8Array, right: Uint8Array): Uint8Array;
