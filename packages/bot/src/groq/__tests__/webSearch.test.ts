import { describe, it, expect } from "bun:test";
import { formatSearchResult } from "../webSearch.js";

describe("formatSearchResult", () => {
  it("returns content as-is", () => {
    expect(formatSearchResult("Bun 1.3 shipped in June.")).toBe("Bun 1.3 shipped in June.");
  });
  it("handles null content", () => {
    expect(formatSearchResult(null)).toBe("(no results)");
  });
  it("truncates very long results", () => {
    const long = "x".repeat(10_000);
    expect(formatSearchResult(long).length).toBeLessThanOrEqual(6_100);
  });
});
