import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import * as OTPAuth from "otpauth";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must be at least 32 characters");
  }
  return Buffer.from(key.slice(0, 32), "utf-8");
}

/**
 * Encrypt a TOTP secret for database storage.
 * Format: iv:authTag:ciphertext (all hex)
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a TOTP secret from database storage.
 */
export function decryptSecret(stored: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = stored.split(":");

  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

/**
 * Build the otpauth:// URI (encoded into the QR code) for an EXISTING base32
 * secret. Centralises the TOTP parameters so the QR, the manual key, and
 * verifyTOTPCode always describe the same token — important when re-showing
 * setup for a secret we already stored.
 */
export function buildTOTPUri(email: string, secret: string): string {
  return new OTPAuth.TOTP({
    issuer: "Quanta",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).toString();
}

/**
 * Generate a new TOTP secret and return the secret + otpauth URI for QR code.
 */
export function generateTOTPSecret(email: string): { secret: string; uri: string } {
  const secret = new OTPAuth.Secret().base32;
  return { secret, uri: buildTOTPUri(email, secret) };
}

/**
 * Verify a TOTP code against a base32 secret.
 * Allows a 1-period window in either direction for clock drift.
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: "Quanta",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // delta returns null on failure, or the time step offset on success
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
