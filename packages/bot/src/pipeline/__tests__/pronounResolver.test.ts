import { describe, it, expect } from "bun:test";
import { PronounSet } from "pronounr";
import { resolveUserPronounSet } from "../pronounResolver.js";

function makeMember(roleNames: string[]) {
  return {
    roles: {
      cache: new Map(
        roleNames.map((name, i) => [String(i), { name }])
      ),
    },
  } as any;
}

describe("resolveUserPronounSet", () => {
  it("returns null when both context and member are null", () => {
    expect(resolveUserPronounSet(null, null)).toBeNull();
  });

  it("returns null when context has no pronoun signal and member is null", () => {
    expect(resolveUserPronounSet("I like cats", null)).toBeNull();
  });

  it("returns null when roles have no pronoun signal and context is null", () => {
    expect(resolveUserPronounSet(null, makeMember(["Admin", "Member"]))).toBeNull();
  });

  it("resolves She from context 'she/her'", () => {
    expect(resolveUserPronounSet("she/her", null)).toBe(PronounSet.She);
  });

  it("resolves He from context 'he/him'", () => {
    expect(resolveUserPronounSet("he/him", null)).toBe(PronounSet.He);
  });

  it("resolves They from context 'they/them'", () => {
    expect(resolveUserPronounSet("they/them", null)).toBe(PronounSet.They);
  });

  it("resolves Xe from context 'xe/xem'", () => {
    expect(resolveUserPronounSet("xe/xem", null)).toBe(PronounSet.Xe);
  });

  it("resolves Fae from context 'fae/faer'", () => {
    expect(resolveUserPronounSet("fae/faer", null)).toBe(PronounSet.Fae);
  });

  it("resolves Ey from context 'ey/em'", () => {
    expect(resolveUserPronounSet("ey/em", null)).toBe(PronounSet.Ey);
  });

  it("resolves Per from context 'per/pers'", () => {
    expect(resolveUserPronounSet("per/pers", null)).toBe(PronounSet.Per);
  });

  it("resolves Xir from context 'xir/xim'", () => {
    expect(resolveUserPronounSet("xir/xim", null)).toBe(PronounSet.Xir);
  });

  it("resolves It from context 'it/its'", () => {
    expect(resolveUserPronounSet("it/its", null)).toBe(PronounSet.It);
  });

  it("is case-insensitive for context", () => {
    expect(resolveUserPronounSet("She/Her", null)).toBe(PronounSet.She);
  });

  it("finds slash-pair embedded in longer context text", () => {
    expect(resolveUserPronounSet("Hi! I use she/her pronouns :)", null)).toBe(PronounSet.She);
  });

  it("resolves an any-pool set from context 'any pronouns'", () => {
    const result = resolveUserPronounSet("any pronouns", null);
    expect([PronounSet.He, PronounSet.She, PronounSet.They, PronounSet.It]).toContain(result!);
  });

  it("resolves an any-pool set from context 'pronouns: any'", () => {
    const result = resolveUserPronounSet("pronouns: any", null);
    expect([PronounSet.He, PronounSet.She, PronounSet.They, PronounSet.It]).toContain(result!);
  });

  it("resolves an any-pool set from context 'pronouns = any'", () => {
    const result = resolveUserPronounSet("pronouns = any", null);
    expect([PronounSet.He, PronounSet.She, PronounSet.They, PronounSet.It]).toContain(result!);
  });

  it("never returns a neopronoun for 'any'", () => {
    const neopronouns = [PronounSet.Ey, PronounSet.Xe, PronounSet.Fae, PronounSet.Per, PronounSet.Xir];
    for (let i = 0; i < 50; i++) {
      const result = resolveUserPronounSet("any pronouns", null);
      expect(neopronouns).not.toContain(result);
    }
  });

  it("resolves one set from hybrid context 'she/they'", () => {
    const result = resolveUserPronounSet("she/they", null);
    expect([PronounSet.She, PronounSet.They]).toContain(result!);
  });

  it("resolves one set from hybrid context 'he/they'", () => {
    const result = resolveUserPronounSet("he/they", null);
    expect([PronounSet.He, PronounSet.They]).toContain(result!);
  });

  it("resolves She from role name 'she/her'", () => {
    expect(resolveUserPronounSet(null, makeMember(["she/her"]))).toBe(PronounSet.She);
  });

  it("resolves He from role name 'he/him'", () => {
    expect(resolveUserPronounSet(null, makeMember(["he/him"]))).toBe(PronounSet.He);
  });

  it("resolves They from role name 'they/them'", () => {
    expect(resolveUserPronounSet(null, makeMember(["they/them"]))).toBe(PronounSet.They);
  });

  it("ignores non-pronoun roles", () => {
    expect(resolveUserPronounSet(null, makeMember(["Admin", "Moderator", "they/them"]))).toBe(PronounSet.They);
  });

  it("is case-insensitive for role names", () => {
    expect(resolveUserPronounSet(null, makeMember(["She/Her"]))).toBe(PronounSet.She);
  });

  it("resolves an any-pool set from role 'any'", () => {
    const result = resolveUserPronounSet(null, makeMember(["any"]));
    expect([PronounSet.He, PronounSet.She, PronounSet.They, PronounSet.It]).toContain(result!);
  });

  it("resolves an any-pool set from role 'any pronouns'", () => {
    const result = resolveUserPronounSet(null, makeMember(["any pronouns"]));
    expect([PronounSet.He, PronounSet.She, PronounSet.They, PronounSet.It]).toContain(result!);
  });

  it("resolves one set from hybrid roles ['she/her', 'they/them']", () => {
    const result = resolveUserPronounSet(null, makeMember(["she/her", "they/them"]));
    expect([PronounSet.She, PronounSet.They]).toContain(result!);
  });

  it("context wins over roles when both present", () => {
    const result = resolveUserPronounSet("she/her", makeMember(["he/him"]));
    expect(result).toBe(PronounSet.She);
  });
});
