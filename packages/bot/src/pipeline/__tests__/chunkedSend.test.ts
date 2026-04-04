import { describe, it, expect } from "bun:test";
import { chunkMessage } from "../chunkedSend.js";

describe("chunkMessage", () => {
  it("returns single chunk for short text", () => {
    expect(chunkMessage("hello")).toEqual(["hello"]);
  });

  it("returns single chunk for exactly 1900 chars", () => {
    const text = "a".repeat(1900);
    expect(chunkMessage(text)).toEqual([text]);
  });

  it("splits at newline boundary when possible", () => {
    const line = "a".repeat(900);
    const text = `${line}\n${line}\n${line}`;
    const chunks = chunkMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(`${line}\n${line}`);
    expect(chunks[1]).toBe(line);
  });

  it("splits at space when no newline available", () => {
    const word = "a".repeat(100);
    const words = Array(25).fill(word).join(" "); // 25 * 100 + 24 spaces = 2524
    const chunks = chunkMessage(words);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1900);
    }
  });

  it("hard-cuts when no whitespace available", () => {
    const text = "a".repeat(4000);
    const chunks = chunkMessage(text);
    expect(chunks.length).toBe(3); // 1900 + 1900 + 200
    expect(chunks[0].length).toBe(1900);
    expect(chunks[1].length).toBe(1900);
    expect(chunks[2].length).toBe(200);
  });

  it("handles empty string", () => {
    expect(chunkMessage("")).toEqual([""]);
  });

  it("preserves all content across chunks", () => {
    const line = "a".repeat(800);
    const text = `${line}\n${line}\n${line}\n${line}`;
    const chunks = chunkMessage(text);
    const rejoined = chunks.join("\n");
    expect(rejoined).toBe(text);
  });
});
