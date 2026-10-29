import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken } from "@/lib/auth/tokens";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("Correct-Horse-1");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-1", h)).toBe(true);
    expect(await verifyPassword("correct-horse-1", h)).toBe(false);
  });
  it("salts every hash and rejects malformed hashes", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
});

describe("tokens", () => {
  it("are random, URL-safe and stored only as hashes", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});
