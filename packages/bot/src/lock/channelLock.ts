import type { Message } from "discord.js";

const LOCK_TIMEOUT = 60_000;

interface LockEntry {
  mentionQueue: Message[];
  timer: ReturnType<typeof setTimeout>;
}

const locks = new Map<string, LockEntry>();

export function isLocked(channelId: string): boolean {
  return locks.has(channelId);
}

export function lock(channelId: string): void {
  // Safety timeout to prevent permanent locks
  const timer = setTimeout(() => {
    locks.delete(channelId);
    console.warn(`Channel lock expired for ${channelId}`);
  }, LOCK_TIMEOUT);

  locks.set(channelId, { mentionQueue: [], timer });
}

export function unlock(channelId: string): Message | null {
  const entry = locks.get(channelId);
  if (!entry) return null;

  clearTimeout(entry.timer);
  locks.delete(channelId);

  // Return only the most recent queued mention
  return entry.mentionQueue.length > 0
    ? entry.mentionQueue[entry.mentionQueue.length - 1]
    : null;
}

export function queueMention(channelId: string, message: Message): void {
  const entry = locks.get(channelId);
  if (entry) {
    entry.mentionQueue.push(message);
  }
}
