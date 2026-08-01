import { describe, expect, it } from "vitest";
import {
  INVITE_CODE_LENGTH,
  MAX_SLUG_LENGTH,
  SlugError,
  generateInviteCode,
  isValidInviteCode,
  isValidSlug,
  normalizeInviteCode,
  slugWithSuffix,
  slugify,
  slugifyWithFallback,
} from "./ids";

describe("slugify", () => {
  it("lower-cases and hyphenates", () => {
    expect(slugify("College Friends")).toBe("college-friends");
  });

  it("collapses runs of separators and punctuation", () => {
    expect(slugify("  Bob's   Game   Night!!  ")).toBe("bob-s-game-night");
    expect(slugify("a---b___c")).toBe("a-b-c");
  });

  it("folds accented Latin to ASCII rather than dropping it", () => {
    expect(slugify("Café Münchén")).toBe("cafe-munchen");
  });

  it("never emits a leading or trailing hyphen", () => {
    expect(slugify("---hello---")).toBe("hello");
    expect(slugify("!!!")).toBe("");
  });

  it("truncates to MAX_SLUG_LENGTH without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(MAX_SLUG_LENGTH - 1)} bbbb`);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns empty for input with no ASCII fallback", () => {
    expect(slugify("麻雀")).toBe("");
    expect(slugify("🎲🎲")).toBe("");
  });

  it("always produces a value satisfying the DB CHECK constraint", () => {
    const inputs = ["College Friends", "Café Münchén", "a---b", "Bob's Game Night!!", "x".repeat(200)];
    for (const input of inputs) {
      const slug = slugify(input);
      if (slug !== "") expect(isValidSlug(slug)).toBe(true);
    }
  });
});

describe("slugifyWithFallback", () => {
  it("passes through a usable slug", () => {
    expect(slugifyWithFallback("Game Night")).toBe("game-night");
  });

  it("invents a valid slug when the input reduces to nothing", () => {
    const slug = slugifyWithFallback("🎲🎲");
    expect(slug).toMatch(/^group-[a-z0-9]{6}$/);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe("slugWithSuffix", () => {
  it("appends the discriminator", () => {
    expect(slugWithSuffix("game-night", 2)).toBe("game-night-2");
    expect(slugWithSuffix("game-night", 17)).toBe("game-night-17");
  });

  it("keeps the result within the length limit", () => {
    const long = "a".repeat(MAX_SLUG_LENGTH);
    const out = slugWithSuffix(long, 12);
    expect(out.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(out.endsWith("-12")).toBe(true);
    expect(isValidSlug(out)).toBe(true);
  });

  it("does not produce a double hyphen when truncation lands on one", () => {
    const base = `${"a".repeat(MAX_SLUG_LENGTH - 3)}-bb`;
    expect(slugWithSuffix(base, 2)).not.toContain("--");
  });

  it("rejects a suffix below 2", () => {
    expect(() => slugWithSuffix("x", 1)).toThrow(SlugError);
    expect(() => slugWithSuffix("x", 0)).toThrow(SlugError);
  });
});

describe("isValidSlug", () => {
  it.each([
    ["game-night", true],
    ["a", true],
    ["a1-b2-c3", true],
    ["", false],
    ["-lead", false],
    ["trail-", false],
    ["double--hyphen", false],
    ["Upper", false],
    ["under_score", false],
    ["a".repeat(MAX_SLUG_LENGTH + 1), false],
  ])("%s -> %s", (slug, expected) => {
    expect(isValidSlug(slug)).toBe(expected);
  });
});

describe("generateInviteCode", () => {
  it("produces a code of the expected length and alphabet", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(isValidInviteCode(code)).toBe(true);
  });

  it("excludes visually ambiguous characters", () => {
    const joined = Array.from({ length: 300 }, () => generateInviteCode()).join("");
    for (const c of ["0", "O", "1", "I", "L", "A", "E", "U"]) {
      expect(joined).not.toContain(c);
    }
  });

  it("does not repeat within a large sample", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateInviteCode()));
    expect(codes.size).toBe(2000);
  });

  it("uses the whole alphabet over a large sample", () => {
    const joined = Array.from({ length: 2000 }, () => generateInviteCode()).join("");
    expect(new Set(joined).size).toBe(28);
  });
});

describe("normalizeInviteCode", () => {
  it("upper-cases and strips separators", () => {
    expect(normalizeInviteCode("  bcd-fghj  ")).toBe("BCDFGHJ");
    expect(normalizeInviteCode("BCDF GHJK")).toBe("BCDFGHJK");
  });

  it("does not silently rewrite ambiguous characters", () => {
    // "O" is not in the alphabet; it must fail validation, not be guessed at.
    const normalized = normalizeInviteCode("BCDFGHJO");
    expect(normalized).toBe("BCDFGHJO");
    expect(isValidInviteCode(normalized)).toBe(false);
  });

  it("round-trips a generated code", () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(` ${code.toLowerCase()} `)).toBe(code);
  });
});

describe("isValidInviteCode", () => {
  it("rejects wrong length or out-of-alphabet characters", () => {
    expect(isValidInviteCode("BCDFGHJ")).toBe(false);
    expect(isValidInviteCode("BCDFGHJKM")).toBe(false);
    expect(isValidInviteCode("BCDFGHJ0")).toBe(false);
    expect(isValidInviteCode("bcdfghjk")).toBe(false);
  });
});
