import { describe, it, expect } from "vitest";
import { CLIError } from "./errors.js";

describe("CLIError", () => {
  it("should create error with message", () => {
    const error = new CLIError("Test error");
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("CLIError");
  });

  it("should have default exit code of 1", () => {
    const error = new CLIError("Test error");
    expect(error.exitCode).toBe(1);
  });

  it("should allow custom exit code", () => {
    const error = new CLIError("Test error", 2);
    expect(error.exitCode).toBe(2);
  });

  it("should be instance of Error", () => {
    const error = new CLIError("Test error");
    expect(error).toBeInstanceOf(Error);
  });
});
