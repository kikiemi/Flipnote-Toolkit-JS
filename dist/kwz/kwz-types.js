import { createPalette } from '../image/image.js';
export const KWZ_WIDTH = 320;
export const KWZ_HEIGHT = 240;
export const KWZ_LAYER_SIZE = KWZ_WIDTH * KWZ_HEIGHT;
export const KWZ_LAYER_COUNT = 3;
export const KWZ_THUMBNAIL_WIDTH = 80;
export const KWZ_THUMBNAIL_HEIGHT = 64;
export const KWZ_SAMPLE_RATE = 16364;
/** DSi Library conversions store audio at twice the PPM rate the converter assumed. */
export const KWZ_DSI_LIBRARY_SAMPLE_RATE = 16384;
export const KWZ_MAX_FRAMES = 999;
export const KWZ_MAX_BGM_SECONDS = 60;
export const KWZ_MAX_SE_SECONDS = 2;
export const KWZ_MAX_DEPTH = 6;
export const KWZ_SIGNATURE_SIZE = 256;
/** App version written by the last release of Flipnote Studio 3D. */
export const KWZ_APP_VERSION = 734;
export const KWZ_HEADER_SIZE = 0xcc;
export const KWZ_FRAME_META_SIZE = 28;
export const KWZ_SOUND_HEADER_SIZE = 28;
/** Author ID of headers and frames that have none. */
export const KWZ_EMPTY_AUTHOR_ID = '0'.repeat(20);
/** Frame flags written by app version 734 (bit 7). */
export const KWZ_DEFAULT_FRAME_EXTRA_FLAGS = 0x80;
export const KWZ_TRACK_NAMES = ['bgm', 'se1', 'se2', 'se3', 'se4'];
export const KWZ_SE_NAMES = ['se1', 'se2', 'se3', 'se4'];
/** Area the 3DS lets you draw on; the 5-pixel border stays empty. */
export const KWZ_CANVAS_RECT = { x: 5, y: 5, width: 310, height: 230 };
/** Where DSi Library conversions place the 256x192 PPM picture. */
export const KWZ_DSI_LIBRARY_RECT = { x: 32, y: 24, width: 256, height: 192 };
const KWZ_BYTES_PER_SECOND = KWZ_SAMPLE_RATE / 2;
/** Room Flipnote Studio 3D reserves for the longest possible audio (60 s BGM, four 2 s effects). */
const KWZ_AUDIO_RESERVE = (KWZ_BYTES_PER_SECOND * 60 + KWZ_BYTES_PER_SECOND * 2 * 4 + 39) & ~3;
/** Memory meter capacity of Flipnote Studio 3D (from its function at 0x002b4224). */
export const KWZ_MEMORY_LIMIT = 4219447 - KWZ_AUDIO_RESERVE;
/** Fixed amount the meter adds on top of the frame data. */
export const KWZ_MEMORY_BASE = 57600;
/** Frame data a KWZ can hold before its memory meter is full. */
export const KWZ_MAX_FRAME_DATA_SIZE = KWZ_MEMORY_LIMIT - KWZ_MEMORY_BASE;
/** Frames per second for speeds 0-10. */
export const KWZ_FRAME_RATES = [0.2, 0.5, 1, 2, 4, 6, 8, 12, 20, 24, 30];
export const KWZ_COLOR_WHITE = 0;
export const KWZ_COLOR_BLACK = 1;
export const KWZ_COLOR_RED = 2;
export const KWZ_COLOR_YELLOW = 3;
export const KWZ_COLOR_GREEN = 4;
export const KWZ_COLOR_BLUE = 5;
export const KWZ_COLOR_NONE = 6;
/**
 * Colors as the 3DS screen shows them: the app's colors after the RGB555 framebuffer.
 * Index 6 (no paper) is transparent.
 */
export const KWZ_PALETTE = createPalette([0xffffff, 0x101010, 0xff1010, 0xffe700, 0x008431, 0x0039ce, 0xffffff], KWZ_COLOR_NONE);
/** Colors stored in the app itself, used by its own GIF export. */
export const KWZ_APP_PALETTE = createPalette([0xffffff, 0x141414, 0xff1717, 0xffe600, 0x008232, 0x003cc8, 0xffffff], KWZ_COLOR_NONE);
/** Public key Flipnote Studio 3D uses to verify KWZ files (RSA-2048, SHA-256). */
export const KWZ_PUBLIC_KEY = {
    n: 0xbaffb31c05d7bdb6ed46ac400c378902b5f66fd44cc63dd3faaa51837167204fe3794ded8fb7a80f3b0c76e63e0ff513f424a73fe407618fef7f49f996a5fdb3a963a19026c94babbb28f57b9060f9f90312eff23c43d08ea85bcb2c02c982f84c400e26f7a8a54071f5f750c5427a278279a0213f226d6416b9465bea6e0118879adde6994c8dccef1b23f271ddc1927e8387246d5fa04690b08e5a68aa80a41ab1b73bf0a8c86e75c66d0164b244c04c96776f9119d54c33537d35cb3987474a10888272942c24c7f3bb8b0483ff9ec9abe3f6e7433f2adaba7f1f254efb4ca347a995af4357e403c943eeab889986837b7754e95d84a3fb6931c3516fa191n,
    e: 65537n,
};
/** Private key Flipnote Studio 3D signs KWZ files with. */
export const KWZ_PRIVATE_KEY = {
    n: 0xbaffb31c05d7bdb6ed46ac400c378902b5f66fd44cc63dd3faaa51837167204fe3794ded8fb7a80f3b0c76e63e0ff513f424a73fe407618fef7f49f996a5fdb3a963a19026c94babbb28f57b9060f9f90312eff23c43d08ea85bcb2c02c982f84c400e26f7a8a54071f5f750c5427a278279a0213f226d6416b9465bea6e0118879adde6994c8dccef1b23f271ddc1927e8387246d5fa04690b08e5a68aa80a41ab1b73bf0a8c86e75c66d0164b244c04c96776f9119d54c33537d35cb3987474a10888272942c24c7f3bb8b0483ff9ec9abe3f6e7433f2adaba7f1f254efb4ca347a995af4357e403c943eeab889986837b7754e95d84a3fb6931c3516fa191n,
    e: 65537n,
    d: 0x42024cd9517eac6b4c2aac571778eb1657e11bec97054b81ee73fcbe2763bdd63577f6782b492b3be51e2b426f19f6eb0a3d7e04619bf1667ba63518b382f8a158e3e07e2012e2714669d8edbb336049f439d5156f0c892c3265e4bc2e67afa1b258d226133a26cb2eef225412adbaad03b3a740d52673f2e6ca93f992312e953d5ca620fac0e630cc0c589d15f082e5f4d674074512b79d6baf97b311684aef2b900ee2aa35f2d624184eedc86c35a453dafcf7f8863e2b432252a08cc494bef1ecc88c51c8c43dff554a2a90f03984ea37d1f7b5df8e832b0e5d861efc421dc5cc2df8eeeb77433db301ff259fba1b70dcdb117eb18bb10a4e972c08eff919n,
    p: 0xe80c327e2b20e28a06594e11e0a63e5b87361e85378f7d7f53b71abdc111f9122e1de80d3ce00f3de88b60828698383ce25a2d5cc9164ff51a79b906a91266a85f98e33bb1461b24712ebbc162457a45323b7b832c143fa05b78a8d7136735848282275aa7fadef11e1ef482b95a522acf2b26ce864338314e2f71f9ea9b4fcbn,
    q: 0xce4d192a0d85949faf009822ab5099d40fb598a10e9e16840255f29ea80ba7f478dbaaadcb370a1a5d7cb3f1d9a19586b231a82aeecf04296156597fa248c04ed022250dce5421592e62fb7ee1cc61a922f906beabf15b4512f2dd28bf64b1f381ee6390c7a093e02407c12d951b39e39b147e228d794e85997742725b087093n,
    dp: 0xa94bacd30c1833ef4b6e805cdeafab330fd4d6338f33aaf5e857e0b4ac55b688230942b1d5c60a98ba3e65ad15119d861e0678ae072fb62a36a4b3ef3e0ee4c2d6ec2e6cf08b1b665d05218a976de524f2df1edfb69b1748a133c8cb11a6ed0ebe40c3018b28a6daf784d21345b3b5daf1c6a3cb6d7d4154079ce9e4d1db7a3dn,
    dq: 0x4077d7654cd4719d7512ba781b1115012fe78fcac4c6a2429e783d59572a4d5218728ce3c29d708accac2b8f6873164701688324e77bc9d12499d75e0b58b0bff04abb499530b53b2943c553e13bfd48dda4f476a144cb40caab1a71a15dd63e425c3cc101a12c94dead8db0b0e7d12f4f471823b41234778b7db946032ca001n,
    qi: 0xaa875e2fe16a89103a9813e9341f71740ae6aeffe76e8ca2a2c4af3766f0b30f53c2844258c5c9ffef03530c5b1470fbbdd34ec8dc4240531e56606008240315b32e693f110ec9bc3ab9274e24bab6ddde284337776a16a45b3956caa709f0959b0a7af915a1474b2a93639b7c41cf80a32a6f1d61ad617594fc337465e40750n,
};
/** Section magic version bytes as written by Flipnote Studio 3D. */
export const KWZ_SECTION_VERSIONS = {
    KFH: 0x14,
    KTN: 0x02,
    KMC: 0x02,
    KMI: 0x05,
    KSN: 0x01,
    KIC: 0x03,
};
export const KWZ_SECTION_NAMES = Object.keys(KWZ_SECTION_VERSIONS);
