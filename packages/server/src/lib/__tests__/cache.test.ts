import { describe, it, expect } from "bun:test";
import { Cache } from "../cache.js";

describe("Cache", () => {
  it("returns undefined for a missing key", () => {
    const cache = new Cache<string>(1000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns a value that was set", () => {
    const cache = new Cache<string>(1000);
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("returns undefined after the TTL expires", async () => {
    const cache = new Cache<string>(50); // 50ms TTL
    cache.set("key", "value");
    await Bun.sleep(60);
    expect(cache.get("key")).toBeUndefined();
  });

  it("delete removes an entry", () => {
    const cache = new Cache<string>(1000);
    cache.set("key", "value");
    cache.delete("key");
    expect(cache.get("key")).toBeUndefined();
  });

  it("clear removes all entries", () => {
    const cache = new Cache<string>(1000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("caches null values correctly", () => {
    const cache = new Cache<string | null>(1000);
    cache.set("key", null);
    expect(cache.get("key")).toBeNull();
  });
});
