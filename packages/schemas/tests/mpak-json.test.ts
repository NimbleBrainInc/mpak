import { describe, expect, it } from "vitest";

import {
  MPAK_SCHEMA_URL,
  MPAK_SCHEMA_VERSION,
  MpakJsonSchema,
  generateMpakJsonExample,
} from "../src/mpak-json.js";

describe("MpakJsonSchema", () => {
  it("accepts a valid mpak.json", () => {
    const result = MpakJsonSchema.parse({
      $schema: MPAK_SCHEMA_URL,
      name: "@testuser/my-server",
      maintainers: ["testuser"],
    });
    expect(result.name).toBe("@testuser/my-server");
    expect(result.maintainers).toEqual(["testuser"]);
  });

  it("accepts without $schema", () => {
    const result = MpakJsonSchema.parse({
      name: "@org/pkg",
      maintainers: ["user1", "user2"],
    });
    expect(result.maintainers).toHaveLength(2);
  });

  it("rejects unscoped package names", () => {
    expect(() =>
      MpakJsonSchema.parse({
        name: "no-scope",
        maintainers: ["user"],
      }),
    ).toThrow();
  });

  it("rejects empty maintainers array", () => {
    expect(() =>
      MpakJsonSchema.parse({
        name: "@test/pkg",
        maintainers: [],
      }),
    ).toThrow();
  });

  it("rejects missing name", () => {
    expect(() =>
      MpakJsonSchema.parse({
        maintainers: ["user"],
      }),
    ).toThrow();
  });

  it("rejects missing maintainers", () => {
    expect(() =>
      MpakJsonSchema.parse({
        name: "@test/pkg",
      }),
    ).toThrow();
  });
});

describe("generateMpakJsonExample", () => {
  it("generates valid JSON", () => {
    const json = generateMpakJsonExample("@test/my-server", "testuser");
    const parsed = JSON.parse(json);
    expect(parsed.$schema).toBe(MPAK_SCHEMA_URL);
    expect(parsed.name).toBe("@test/my-server");
    expect(parsed.maintainers).toEqual(["testuser"]);
  });

  it("generates output that passes schema validation", () => {
    const json = generateMpakJsonExample("@org/server", "orgadmin");
    const parsed = JSON.parse(json);
    const result = MpakJsonSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});

describe("Constants", () => {
  it("has a valid schema version", () => {
    expect(MPAK_SCHEMA_VERSION).toBe("2025-10-19");
  });

  it("has a valid schema URL", () => {
    expect(MPAK_SCHEMA_URL).toContain(MPAK_SCHEMA_VERSION);
    expect(MPAK_SCHEMA_URL).toMatch(/^https:\/\//);
  });
});
