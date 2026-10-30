import { findRsaPrivateKeys, isSameKey, type RsaPrivateKey, type RsaPublicKey } from './rsa.ts';

/** Directory signing keys are kept in: `keys/` in the working directory. */
export const DEFAULT_KEY_DIRECTORY = 'keys';

let defaultKeys: RsaPrivateKey[] | null = null;

/** Places signing keys are read from: `$FLIPNOTE_KEYS`, then `keys/` (Node.js only). */
export function getDefaultKeyPaths(): string[] {
  if (typeof process === 'undefined') return [];
  return [process.env.FLIPNOTE_KEYS, DEFAULT_KEY_DIRECTORY].filter(
    (path): path is string => !!path,
  );
}

/** Every private key in the default places; none outside Node.js 20.16 or later. */
function readDefaultKeys(): RsaPrivateKey[] {
  if (typeof process === 'undefined' || !process.getBuiltinModule) return [];
  const fs = process.getBuiltinModule('node:fs');
  const path = process.getBuiltinModule('node:path');
  const keys: RsaPrivateKey[] = [];
  for (const location of getDefaultKeyPaths()) {
    const info = fs.statSync(location, { throwIfNoEntry: false });
    if (!info) continue;
    const files = info.isDirectory()
      ? fs.readdirSync(location).map((name) => path.join(location, name))
      : [location];
    for (const file of files) {
      if (fs.statSync(file).isFile()) keys.push(...findRsaPrivateKeys(fs.readFileSync(file)));
    }
  }
  return keys;
}

/** Replaces the default signing keys; null reads the default places again when next needed. */
export function setDefaultKeys(keys: readonly RsaPrivateKey[] | null): void {
  defaultKeys = keys ? [...keys] : null;
}

/** The default private key of `publicKey`; the default places are read on first use. */
export function findDefaultKey(publicKey: RsaPublicKey): RsaPrivateKey | null {
  defaultKeys ??= readDefaultKeys();
  return defaultKeys.find((key) => isSameKey(key, publicKey)) ?? null;
}

/**
 * The key a writer signs with: the one passed (null for none); otherwise none while the
 * original signature still matches the content, so unchanged files stay byte-identical; otherwise
 * the default key, or the built-in one when there is no default.
 */
export function chooseSigningKey(
  key: RsaPrivateKey | null | undefined,
  builtInKey: RsaPrivateKey,
  isOriginalValid: () => boolean,
): RsaPrivateKey | null {
  if (key !== undefined) return key;
  return isOriginalValid() ? null : (findDefaultKey(builtInKey) ?? builtInKey);
}
