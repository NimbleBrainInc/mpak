import { describe, expect, it } from "vitest";

import { UserProfileSchema } from "../src/auth.js";

describe("UserProfileSchema", () => {
  const validProfile = {
    id: "user_123",
    email: "test@example.com",
    emailVerified: true,
    username: "testuser",
    name: "Test User",
    avatarUrl: "https://example.com/avatar.png",
    githubUsername: "testuser",
    githubLinked: true,
    verified: true,
    publishedBundles: 5,
    totalDownloads: 1000,
    role: "admin",
    createdAt: "2025-01-01T00:00:00Z",
    lastLoginAt: "2025-06-01T00:00:00Z",
  };

  it("accepts a valid user profile", () => {
    const result = UserProfileSchema.parse(validProfile);
    expect(result.id).toBe("user_123");
    expect(result.email).toBe("test@example.com");
    expect(result.verified).toBe(true);
  });

  it("accepts nullable fields as null", () => {
    const result = UserProfileSchema.parse({
      ...validProfile,
      username: null,
      name: null,
      avatarUrl: null,
      githubUsername: null,
      role: null,
      createdAt: null,
      lastLoginAt: null,
    });
    expect(result.username).toBeNull();
    expect(result.role).toBeNull();
  });

  it("accepts Date objects for date fields", () => {
    const result = UserProfileSchema.parse({
      ...validProfile,
      createdAt: new Date("2025-01-01"),
      lastLoginAt: new Date("2025-06-01"),
    });
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it("rejects invalid email", () => {
    expect(() =>
      UserProfileSchema.parse({ ...validProfile, email: "not-an-email" }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => UserProfileSchema.parse({})).toThrow();
    expect(() => UserProfileSchema.parse({ id: "test" })).toThrow();
  });
});
