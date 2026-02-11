import { describe, expect, it } from "vitest";

import {
  PackageSearchParamsSchema,
  PackageSortSchema,
  PlatformSchema,
  ServerTypeSchema,
} from "../src/package.js";

describe("ServerTypeSchema", () => {
  it("accepts valid server types", () => {
    expect(ServerTypeSchema.parse("node")).toBe("node");
    expect(ServerTypeSchema.parse("python")).toBe("python");
    expect(ServerTypeSchema.parse("binary")).toBe("binary");
  });

  it("rejects invalid server types", () => {
    expect(() => ServerTypeSchema.parse("ruby")).toThrow();
    expect(() => ServerTypeSchema.parse("")).toThrow();
  });
});

describe("PlatformSchema", () => {
  it("accepts valid platforms", () => {
    expect(PlatformSchema.parse("darwin")).toBe("darwin");
    expect(PlatformSchema.parse("win32")).toBe("win32");
    expect(PlatformSchema.parse("linux")).toBe("linux");
  });

  it("rejects invalid platforms", () => {
    expect(() => PlatformSchema.parse("freebsd")).toThrow();
  });
});

describe("PackageSortSchema", () => {
  it("accepts valid sort values", () => {
    expect(PackageSortSchema.parse("downloads")).toBe("downloads");
    expect(PackageSortSchema.parse("recent")).toBe("recent");
    expect(PackageSortSchema.parse("name")).toBe("name");
  });
});

describe("PackageSearchParamsSchema", () => {
  it("accepts empty params", () => {
    const result = PackageSearchParamsSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts full search params", () => {
    const result = PackageSearchParamsSchema.parse({
      q: "test",
      type: "node",
      tool: "my-tool",
      prompt: "hello",
      platform: "darwin",
      sort: "downloads",
      limit: 10,
      offset: 0,
    });
    expect(result.q).toBe("test");
    expect(result.type).toBe("node");
    expect(result.limit).toBe(10);
  });

  it("accepts string limit and offset (from query params)", () => {
    const result = PackageSearchParamsSchema.parse({
      limit: "20",
      offset: "5",
    });
    expect(result.limit).toBe("20");
    expect(result.offset).toBe("5");
  });

  it("rejects invalid server type in params", () => {
    expect(() =>
      PackageSearchParamsSchema.parse({ type: "invalid" }),
    ).toThrow();
  });
});
