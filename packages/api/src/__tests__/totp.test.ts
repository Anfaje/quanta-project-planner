import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, generateTOTPSecret, verifyTOTPCode } from "../utils/totp";
import * as OTPAuth from "otpauth";

// Set a test encryption key
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = "test-encryption-key-at-least-32c";
});

describe("TOTP encryption", () => {
  it("encrypts and decrypts a secret round-trip", () => {
    const original = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it("throws on invalid encrypted format", () => {
    expect(() => decryptSecret("not-valid")).toThrow();
  });
});

describe("TOTP generation and verification", () => {
  it("generates a secret and URI", () => {
    const { secret, uri } = generateTOTPSecret("test@trifork.com");
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(10);
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Quanta");
    // otpauth encodes the label in the URI (@ -> %40); decode before checking.
    expect(decodeURIComponent(uri)).toContain("test@trifork.com");
  });

  it("verifies a valid TOTP code", () => {
    const { secret } = generateTOTPSecret("test@trifork.com");

    // Generate the current valid code
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    const validCode = totp.generate();

    expect(verifyTOTPCode(secret, validCode)).toBe(true);
  });

  it("rejects an invalid TOTP code", () => {
    const { secret } = generateTOTPSecret("test@trifork.com");
    expect(verifyTOTPCode(secret, "000000")).toBe(false);
  });
});
