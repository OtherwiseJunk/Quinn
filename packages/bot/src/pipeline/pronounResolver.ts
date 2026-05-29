import type { GuildMember } from "discord.js";
import { PronounSet, replacePronouns } from "pronounr";

export { PronounSet, replacePronouns };

const SUBJECT_TO_SET: Record<string, PronounSet> = {
  she: PronounSet.She,
  he: PronounSet.He,
  they: PronounSet.They,
  it: PronounSet.It,
  ey: PronounSet.Ey,
  xe: PronounSet.Xe,
  fae: PronounSet.Fae,
  per: PronounSet.Per,
  xir: PronounSet.Xir,
};

const ANY_POOL: PronounSet[] = [PronounSet.He, PronounSet.She, PronounSet.They, PronounSet.It];

const SLASH_PAIR_RE = /\b(she|he|they|it|ey|xe|fae|per|xir)(\/\w+)+/gi;
const ANY_CONTEXT_RE = /\bany\s+pronouns?\b|pronouns?\s*[:=]\s*any\b/i;
const ANY_ROLE_RE = /^any(\s+pronouns?)?$/i;

function selectOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function parseSlashString(s: string): PronounSet[] {
  const sets: PronounSet[] = [];
  for (const token of s.toLowerCase().split("/")) {
    const set = SUBJECT_TO_SET[token.trim()];
    if (set !== undefined && !sets.includes(set)) sets.push(set);
  }
  return sets;
}

function parseContext(context: string): PronounSet[] | "any" | null {
  if (ANY_CONTEXT_RE.test(context)) return "any";
  const sets: PronounSet[] = [];
  for (const match of context.matchAll(SLASH_PAIR_RE)) {
    for (const set of parseSlashString(match[0])) {
      if (!sets.includes(set)) sets.push(set);
    }
  }
  return sets.length > 0 ? sets : null;
}

function parseRoles(member: GuildMember): PronounSet[] | "any" | null {
  const names = [...member.roles.cache.values()].map((r) => r.name);
  for (const name of names) {
    if (ANY_ROLE_RE.test(name.trim())) return "any";
  }
  const sets: PronounSet[] = [];
  for (const name of names) {
    for (const set of parseSlashString(name)) {
      if (!sets.includes(set)) sets.push(set);
    }
  }
  return sets.length > 0 ? sets : null;
}

function resolve(signal: PronounSet[] | "any"): PronounSet {
  if (signal === "any") return selectOne(ANY_POOL);
  if (signal.length === 1) return signal[0]!;
  return selectOne(signal);
}

export function resolveUserPronounSet(
  userContext: string | null,
  member: GuildMember | null,
): PronounSet | null {
  const contextSignal = userContext ? parseContext(userContext) : null;
  if (contextSignal) return resolve(contextSignal);
  const roleSignal = member ? parseRoles(member) : null;
  if (roleSignal) return resolve(roleSignal);
  return null;
}
