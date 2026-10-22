// Tokens, hashing, encryption at rest and TOTP (RFC 6238), on node:crypto alone.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** A random token for a cookie or a link (256 bits). */
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest();

export const sameText = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// --- Encryption at rest (AES-256-GCM): iv (12) | tag (16) | ciphertext

export function seal(plain: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function open(sealed: Buffer, key: Buffer) {
  const d = createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  d.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([d.update(sealed.subarray(28)), d.final()]);
}

// --- Base32 (RFC 4648, no padding), as authenticator apps take secrets

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// --- TOTP: 6 digits, 30-second steps, HMAC-SHA1 (what every authenticator app does)

export const TOTP_STEP = 30;
export const stepAt = (ms: number) => Math.floor(ms / 1000 / TOTP_STEP);

export function totp(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** The step a code is right for (this one or either next to it, for clocks a little off), or
 * null. Only steps after `lastStep` count, so a code works once. */
export function checkTotp(secret: Buffer, code: string, lastStep: number, now = Date.now()) {
  const c = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const s = stepAt(now);
  for (const step of [s - 1, s, s + 1]) if (step > lastStep && sameText(totp(secret, step), c)) return step;
  return null;
}

export const totpUri = (secret: Buffer, account: string, issuer = "HyzerLab") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${base32(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP}`;

// --- Backup codes: ten of them, 10 characters each (50 bits), shown as xxxxx-xxxxx

export const newBackupCode = () => {
  const s = base32(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${s.slice(0, 5)}-${s.slice(5)}`;
};
export const backupCodeHash = (code: string) => sha256(code.toLowerCase().replace(/[^a-z2-7]/g, ""));
