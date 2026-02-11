import { describe, expect, it } from "vitest";

import {
  ScopedSkillNameSchema,
  SkillAnnounceRequestSchema,
  SkillCategorySchema,
  SkillFrontmatterSchema,
  SkillNameSchema,
  SkillSearchParamsSchema,
} from "../src/skill.js";

describe("SkillNameSchema", () => {
  it("accepts valid skill names", () => {
    expect(SkillNameSchema.parse("my-skill")).toBe("my-skill");
    expect(SkillNameSchema.parse("a")).toBe("a");
    expect(SkillNameSchema.parse("skill123")).toBe("skill123");
    expect(SkillNameSchema.parse("my-great-skill")).toBe("my-great-skill");
  });

  it("rejects invalid skill names", () => {
    expect(() => SkillNameSchema.parse("")).toThrow();
    expect(() => SkillNameSchema.parse("-starts-with-hyphen")).toThrow();
    expect(() => SkillNameSchema.parse("UPPERCASE")).toThrow();
    expect(() => SkillNameSchema.parse("has spaces")).toThrow();
    expect(() => SkillNameSchema.parse("double--hyphen")).toThrow();
  });
});

describe("ScopedSkillNameSchema", () => {
  it("accepts valid scoped names", () => {
    expect(ScopedSkillNameSchema.parse("@nimblebraininc/my-skill")).toBe(
      "@nimblebraininc/my-skill",
    );
    expect(ScopedSkillNameSchema.parse("@user/skill")).toBe("@user/skill");
  });

  it("rejects unscoped names", () => {
    expect(() => ScopedSkillNameSchema.parse("my-skill")).toThrow();
    expect(() => ScopedSkillNameSchema.parse("@/skill")).toThrow();
  });
});

describe("SkillCategorySchema", () => {
  it("accepts all valid categories", () => {
    const categories = [
      "development",
      "writing",
      "research",
      "consulting",
      "data",
      "design",
      "operations",
      "security",
      "other",
    ];
    for (const cat of categories) {
      expect(SkillCategorySchema.parse(cat)).toBe(cat);
    }
  });

  it("rejects invalid categories", () => {
    expect(() => SkillCategorySchema.parse("gaming")).toThrow();
  });
});

describe("SkillFrontmatterSchema", () => {
  it("accepts minimal frontmatter", () => {
    const result = SkillFrontmatterSchema.parse({
      name: "my-skill",
      description: "A helpful skill",
    });
    expect(result.name).toBe("my-skill");
    expect(result.description).toBe("A helpful skill");
  });

  it("accepts full frontmatter with metadata", () => {
    const result = SkillFrontmatterSchema.parse({
      name: "strategic-advisor",
      description: "Provides strategic advice for decisions",
      license: "MIT",
      compatibility: "Claude Code",
      "allowed-tools": "Read Write Bash",
      metadata: {
        tags: ["strategy", "advisory"],
        category: "consulting",
        triggers: ["help me think through", "strategic advice"],
        keywords: ["strategy", "planning"],
        author: {
          name: "NimbleBrain",
          url: "https://nimblebrain.ai",
        },
        version: "1.0.0",
        examples: [
          {
            prompt: "Help me think through my product strategy",
            context: "Early stage startup",
          },
        ],
      },
    });
    expect(result.metadata?.category).toBe("consulting");
    expect(result.metadata?.tags).toHaveLength(2);
  });
});

describe("SkillAnnounceRequestSchema", () => {
  it("validates a skill announce request", () => {
    const request = SkillAnnounceRequestSchema.parse({
      name: "@nimblebraininc/my-skill",
      version: "1.0.0",
      skill: {
        name: "my-skill",
        description: "A test skill",
      },
      release_tag: "v1.0.0",
      artifact: {
        filename: "my-skill.skill",
        sha256: "a".repeat(64),
        size: 1024,
      },
    });
    expect(request.prerelease).toBe(false);
    expect(request.artifact.filename).toBe("my-skill.skill");
  });
});

describe("SkillSearchParamsSchema", () => {
  it("accepts empty params", () => {
    const result = SkillSearchParamsSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts full search params", () => {
    const result = SkillSearchParamsSchema.parse({
      q: "strategy",
      tags: "advisory,planning",
      category: "consulting",
      sort: "downloads",
      limit: 10,
      offset: 0,
    });
    expect(result.q).toBe("strategy");
    expect(result.category).toBe("consulting");
  });
});
