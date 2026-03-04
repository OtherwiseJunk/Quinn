import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockEnv = { e2bApiKey: "test-key" as string | undefined };

mock.module("../../env.js", () => ({
  env: mockEnv,
}));

// Mock E2B SDK — we don't call real sandboxes in tests
mock.module("@e2b/code-interpreter", () => ({
  Sandbox: { create: mock() },
}));

const { isCodeExecutionEnabled, formatCodeResult } = await import("../sandbox.js");
import type { CodeResult } from "../sandbox.js";

describe("isCodeExecutionEnabled", () => {
  it("returns true when E2B_API_KEY is set", () => {
    mockEnv.e2bApiKey = "some-key";
    expect(isCodeExecutionEnabled()).toBe(true);
  });

  it("returns false when E2B_API_KEY is undefined", () => {
    mockEnv.e2bApiKey = undefined;
    expect(isCodeExecutionEnabled()).toBe(false);
  });

  it("returns false when E2B_API_KEY is empty string", () => {
    mockEnv.e2bApiKey = "";
    expect(isCodeExecutionEnabled()).toBe(false);
  });
});

describe("formatCodeResult", () => {
  it("formats a successful result", () => {
    const result: CodeResult = {
      success: true,
      stdout: "42",
      stderr: "",
      durationMs: 100,
    };
    const formatted = formatCodeResult("python", "print(42)", result);
    expect(formatted).toContain("python");
    expect(formatted).toContain("print(42)");
    expect(formatted).toContain("Execution succeeded.");
    expect(formatted).toContain("42");
  });

  it("formats a failed result with error", () => {
    const result: CodeResult = {
      success: false,
      stdout: "",
      stderr: "Traceback...",
      error: "NameError: name 'x' is not defined",
      durationMs: 200,
    };
    const formatted = formatCodeResult("python", "print(x)", result);
    expect(formatted).toContain("Execution failed.");
    expect(formatted).toContain("Traceback...");
    expect(formatted).toContain("NameError");
  });

  it("omits empty stdout/stderr sections", () => {
    const result: CodeResult = {
      success: true,
      stdout: "hello",
      stderr: "",
      durationMs: 50,
    };
    const formatted = formatCodeResult("bash", "echo hello", result);
    expect(formatted).toContain("stdout:");
    expect(formatted).not.toContain("stderr:");
  });

  it("includes both stdout and stderr when both present", () => {
    const result: CodeResult = {
      success: true,
      stdout: "output",
      stderr: "warning",
      durationMs: 150,
    };
    const formatted = formatCodeResult("python", "code", result);
    expect(formatted).toContain("stdout:");
    expect(formatted).toContain("stderr:");
  });
});
