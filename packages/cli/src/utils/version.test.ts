import { describe, it, expect } from "vitest";
import { getVersion } from "./version.js";

describe("getVersion", () => {
  it("should return a valid version string", () => {
    const version = getVersion();
    expect(version).toBeTruthy();
    expect(typeof version).toBe("string");
  });

  it('should match semver format or be "unknown"', () => {
    const version = getVersion();
    const semverRegex = /^\d+\.\d+\.\d+/;
    expect(version === "unknown" || semverRegex.test(version)).toBe(
      true,
    );
  });
});
