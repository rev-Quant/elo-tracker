import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PasswordError,
  assertPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password";

describe("password policy", () => {
  it("accepts a password at the minimum length", () => {
    expect(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });

  it("rejects a too-short password", () => {
    expect(() => assertPasswordPolicy("a".repeat(MIN_PASSWORD_LENGTH - 1))).toThrow(PasswordError);
  });

  it("rejects an absurdly long password (KDF DoS guard)", () => {
    expect(() => assertPasswordPolicy("a".repeat(MAX_PASSWORD_LENGTH + 1))).toThrow(PasswordError);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse batteri", hash)).resolves.toBe(false);
  });

  it("produces a distinct hash each time (random salt)", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    await expect(verifyPassword("same password", a)).resolves.toBe(true);
    await expect(verifyPassword("same password", b)).resolves.toBe(true);
  });

  it("encodes its parameters so they can be raised later", async () => {
    const hash = await hashPassword("some password");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
  });

  it("normalises unicode so equivalent inputs match", async () => {
    // "é" as a single codepoint vs. "e" + combining acute.
    const composed = "passwo\u00e9rd";
    const decomposed = "passwoe\u0301rd";
    const hash = await hashPassword(composed);
    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });

  it("refuses to hash a password that violates policy", async () => {
    await expect(hashPassword("short")).rejects.toThrow(PasswordError);
  });
});

describe("verifyPassword against malformed input", () => {
  const bad = [
    "",
    "not-a-hash",
    "scrypt$32768$8$1$onlyfiveparts",
    "bcrypt$32768$8$1$c2FsdA==$aGFzaA==",
    "scrypt$0$8$1$c2FsdA==$aGFzaA==",
    "scrypt$32767$8$1$c2FsdA==$aGFzaA==", // N not a power of two
    "scrypt$32768$8$1$$aGFzaA==", // empty salt
    "scrypt$99999999999$8$1$c2FsdA==$aGFzaA==", // absurd N
    "scrypt$abc$8$1$c2FsdA==$aGFzaA==",
  ];

  for (const stored of bad) {
    it(`returns false rather than throwing for ${JSON.stringify(stored)}`, async () => {
      await expect(verifyPassword("anything at all", stored)).resolves.toBe(false);
    });
  }
});

describe("needsRehash", () => {
  it("is false for a freshly created hash", async () => {
    expect(needsRehash(await hashPassword("a good password"))).toBe(false);
  });

  it("is true for weaker parameters", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
  });

  it("is true for an unparseable hash", () => {
    expect(needsRehash("garbage")).toBe(true);
  });
});
