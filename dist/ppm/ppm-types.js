import { createPalette } from '../image/image.js';
export const PPM_WIDTH = 256;
export const PPM_HEIGHT = 192;
export const PPM_LAYER_SIZE = PPM_WIDTH * PPM_HEIGHT;
export const PPM_LAYER_COUNT = 2;
export const PPM_THUMBNAIL_WIDTH = 64;
export const PPM_THUMBNAIL_HEIGHT = 48;
export const PPM_THUMBNAIL_SIZE = 1536;
export const PPM_SAMPLE_RATE = 8180;
/** Tick rate of the DSi's clock (33.513982 MHz / 64), which PPM filenames count in. */
export const PPM_TICKS_PER_SECOND = 33513982 / 64;
/** The DSi mixes at about 32728 Hz, upsampling tracks with nearest-neighbour. */
export const PPM_OUTPUT_SAMPLE_RATE = 32728;
export const PPM_FORMAT_VERSION = 0x24;
export const PPM_MAX_FRAMES = 999;
/** The app stops adding frames once the animation data reaches this size. */
export const PPM_MAX_ANIMATION_SIZE = 736800;
export const PPM_MAX_BGM_SIZE = 245408;
export const PPM_MAX_SE_SIZE = 8192;
export const PPM_MAX_FILE_SIZE = 0x100090;
export const PPM_SIGNATURE_SIZE = 0x80;
/** The signature is followed by 16 zero bytes. */
export const PPM_SIGNATURE_AREA_SIZE = PPM_SIGNATURE_SIZE + 0x10;
export const PPM_ANIMATION_OFFSET = 0x6a0;
export const PPM_FRAME_TABLE_OFFSET = 0x6a8;
export const PPM_SOUND_HEADER_SIZE = 32;
export const PPM_DEFAULT_EXTRA_FLAGS = 0x40;
export const PPM_TRACK_NAMES = ['bgm', 'se1', 'se2', 'se3'];
export const PPM_SE_NAMES = ['se1', 'se2', 'se3'];
/** Frames per second for speeds 1-8 (index 0 is unused by the app). */
export const PPM_FRAME_RATES = [30, 0.5, 1, 2, 4, 6, 12, 20, 30];
export const PPM_PAPER_BLACK = 0;
export const PPM_PAPER_WHITE = 1;
/** Pen values: 0 and 1 draw the inverse of the paper, 2 red, 3 blue. */
export const PPM_PEN_INVERSE = 1;
export const PPM_PEN_RED = 2;
export const PPM_PEN_BLUE = 3;
export const PPM_COLOR_BLACK = 0;
export const PPM_COLOR_WHITE = 1;
export const PPM_COLOR_RED = 2;
export const PPM_COLOR_BLUE = 3;
/** Rendered colors by index: black, white, red, blue. */
export const PPM_PALETTE = createPalette([0x0e0e0e, 0xffffff, 0xff2a2a, 0x0a39ff]);
export const PPM_THUMBNAIL_PALETTE = createPalette([
    0xffffff, 0x525252, 0xffffff, 0x9c9c9c, 0xff4844, 0xc8514f, 0xffadac, 0x00ff00, 0x4840ff,
    0x514fb8, 0xadabff, 0x00ff00, 0xb657b7, 0x00ff00, 0x00ff00, 0x00ff00,
]);
/** Public key Flipnote Studio (DSi) uses to verify PPM files (RSA-1024, SHA-1). */
export const PPM_PUBLIC_KEY = {
    n: 0xc23cbc132faa127e5bfe823cb08bfb0cd13501f74c6a3afb82a6376e1138cfa0dd85c0c79bc4d8dd288a875320eee00beb43a04325cea02946d9d44dbb04666808f1f8f734116fecc033a33d1231f043a04006bd2ed93705ef11a0dae43d3015b3f407db550f753637eb356a347fb50f99f7efd55be2c664e4d410ad6af67107n,
    e: 65537n,
};
/** Private key Flipnote Studio (DSi) signs PPM files with. */
export const PPM_PRIVATE_KEY = {
    n: 0xc23cbc132faa127e5bfe823cb08bfb0cd13501f74c6a3afb82a6376e1138cfa0dd85c0c79bc4d8dd288a875320eee00beb43a04325cea02946d9d44dbb04666808f1f8f734116fecc033a33d1231f043a04006bd2ed93705ef11a0dae43d3015b3f407db550f753637eb356a347fb50f99f7efd55be2c664e4d410ad6af67107n,
    e: 65537n,
    d: 0x26a7537e35f4106e18fc930a64cfd68bfc6e221006a2f54debf80bfbd96d86d42a815d95db87d6e85c13054f23b4a5dd795a21e07afb9d9fd93bac2633db724d5487a37ed7745ff56ec3ccee2bbfd0cf00ebe8c9afde25e8f62908fe726a93c48f6451d79e204da54aeff27f39e3d9cbab51960708d5ac2caa008372fc1e12c1n,
    p: 0xf82a7c52772243d0ea9ac5a20884b90b644baf9019ab2c6f984147b354e07ad0c8cc0b50f2222673739a2d910674462a29466ff9edaea95c0e7cd7148df49891n,
    q: 0xc85e6ebca09b03df8f391527ebaf16d0dfae456676f966aa0b8e879140e7ad511ae05b272ec143d0d955987d815e27cf50f2cc47a5b33fe389f6129fbdeefc17n,
    dp: 0x4102602efa266fbd7ab7b0ae11ad330c58e9bac3f4f5725e897410645a07b4249d7556418e2c84061a72791d54a380fdea7219434f9041ad6bde2839aa363901n,
    dq: 0x5af643df6e29f180344cfdc5b9c12ae278296d682eeada28a846745504da285c818f08d2a8ef24125417ffba3a58bc49e9bdcfef56d22156f2f2bb51b9b01cd1n,
    qi: 0x9d73864eff77a3c0e3e27d690fa3062fce5be963883f328dab4babee1fa917f162c1732ea9b38f17e2897fba073b871dc589cc152621c3f2bbe63637405d4fb3n,
};
