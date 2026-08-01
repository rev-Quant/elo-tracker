import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_MAX_AGE_SECONDS, SessionTokenError, createTokenCodec } from "./token";

const SECRET = "test-secret-that-is-definitely-long-enough";
const OTHER_SECRET = "a-completely-different-secret-of-good-length";

const codec = createTokenCodec(SECRET);

describe("createTokenCodec", () => {
  it("rejects a weak secret", () => {
    expect(() => createTokenCodec("too-short")).toThrow(SessionTokenError);
  });

  it("accepts a 32-character secret", () => {
    expect(() => createTokenCodec("x".repeat(32))).not.toThrow();
  });
});

describe("sign / verify round trip", () => {
  it("preserves the claims", async () => {
    const token = await codec.sign({ userId: "user-123", isGuest: false });
    await expect(codec.verify(token)).resolves.toEqual({ userId: "user-123", isGuest: false });
  });

  it("preserves the guest flag", async () => {
    const token = await codec.sign({ userId: "guest-1", isGuest: true });
    await expect(codec.verify(token)).resolves.toEqual({ userId: "guest-1", isGuest: true });
  });

  it("produces a compact three-segment JWS", async () => {
    const token = await codec.sign({ userId: "u", isGuest: false });
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("verify rejects bad input", () => {
  it("returns null for an empty token", async () => {
    await expect(codec.verify("")).resolves.toBeNull();
  });

  it("returns null for garbage", async () => {
    await expect(codec.verify("not.a.jwt")).resolves.toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const foreign = createTokenCodec(OTHER_SECRET);
    const token = await foreign.sign({ userId: "u", isGuest: false });
    await expect(codec.verify(token)).resolves.toBeNull();
  });

  it("returns null when the payload is tampered with", async () => {
    const token = await codec.sign({ userId: "u", isGuest: false });
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    decoded.sub = "someone-else";
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    await expect(codec.verify(`${header}.${forged}.${signature}`)).resolves.toBeNull();
  });

  it("refuses the 'none' algorithm", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "attacker", isGuest: false, exp: Math.floor(Date.now() / 1000) + 999 }),
    ).toString("base64url");
    await expect(codec.verify(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it("returns null when required claims are missing", async () => {
    const key = new TextEncoder().encode(SECRET);
    // Correctly signed, but with no isGuest claim.
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    await expect(codec.verify(token)).resolves.toBeNull();
  });

  it("returns null when the subject is absent", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ isGuest: false })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    await expect(codec.verify(token)).resolves.toBeNull();
  });
});

describe("expiry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts a token inside its window", async () => {
    vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
    const token = await codec.sign({ userId: "u", isGuest: false });

    vi.setSystemTime(new Date("2026-08-20T00:00:00Z")); // 19 days later
    await expect(codec.verify(token)).resolves.toEqual({ userId: "u", isGuest: false });
  });

  it("rejects a token past SESSION_MAX_AGE_SECONDS", async () => {
    vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
    const token = await codec.sign({ userId: "u", isGuest: false });

    vi.setSystemTime(Date.now() + (SESSION_MAX_AGE_SECONDS + 120) * 1000);
    await expect(codec.verify(token)).resolves.toBeNull();
  });

  it("honours a custom max age", async () => {
    vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
    const token = await codec.sign({ userId: "u", isGuest: false }, { maxAgeSeconds: 60 });

    vi.setSystemTime(Date.now() + 120_000);
    await expect(codec.verify(token)).resolves.toBeNull();
  });
});
