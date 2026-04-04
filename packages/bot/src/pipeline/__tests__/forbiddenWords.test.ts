import { describe, it, expect } from "bun:test";
import { containsForbiddenWord } from "../forbiddenWords.js";

describe("containsForbiddenWord", () => {
  it("returns false for an empty forbidden list", () => {
    expect(containsForbiddenWord("hello world", [])).toBe(false);
  });

  it("returns false when no words match", () => {
    expect(containsForbiddenWord("hello world", ["foo", "bar"])).toBe(false);
  });

  it("returns true for an exact match", () => {
    expect(containsForbiddenWord("badword", ["badword"])).toBe(true);
  });

  it("matches case-insensitively (text uppercase, word lowercase)", () => {
    expect(containsForbiddenWord("BADWORD", ["badword"])).toBe(true);
  });

  it("matches case-insensitively (text lowercase, word uppercase)", () => {
    expect(containsForbiddenWord("badword", ["BADWORD"])).toBe(true);
  });

  it("matches substrings within the text", () => {
    expect(containsForbiddenWord("this has a badword in it", ["badword"])).toBe(true);
  });

  it("matches the second word in a multi-word forbidden list", () => {
    expect(containsForbiddenWord("something offensive", ["innocent", "offensive"])).toBe(
      true
    );
  });

  it("catches spaces between characters", () => {
    expect(containsForbiddenWord("b a d w o r d", ["badword"])).toBe(true);
  });

  it("catches dots between characters", () => {
    expect(containsForbiddenWord("b.a.d.w.o.r.d", ["badword"])).toBe(true);
  });

  it("catches dashes between characters", () => {
    expect(containsForbiddenWord("b-a-d-w-o-r-d", ["badword"])).toBe(true);
  });

  it("catches underscores between characters", () => {
    expect(containsForbiddenWord("b_a_d_w_o_r_d", ["badword"])).toBe(true);
  });

  it("catches asterisks between characters", () => {
    expect(containsForbiddenWord("b*a*d*w*o*r*d", ["badword"])).toBe(true);
  });

  it("catches mixed separators between characters", () => {
    expect(containsForbiddenWord("b a.d-w_o*r d", ["badword"])).toBe(true);
  });

  it("does not false-positive on innocent text after stripping", () => {
    expect(containsForbiddenWord("bad day at work", ["badword"])).toBe(false);
  });
});
