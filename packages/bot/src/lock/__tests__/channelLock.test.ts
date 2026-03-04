import { describe, it, expect, afterEach } from "bun:test";
import { isLocked, lock, unlock, queueMention } from "../channelLock.js";

function fakeMessage(id: string) {
  return { id } as any;
}

describe("channelLock", () => {
  // Unlock any channels locked during tests to avoid timer leaks
  afterEach(() => {
    unlock("test-channel");
    unlock("ch-1");
    unlock("ch-2");
  });

  it("isLocked returns false for an unlocked channel", () => {
    expect(isLocked("nonexistent")).toBe(false);
  });

  it("isLocked returns true after lock()", () => {
    lock("test-channel");
    expect(isLocked("test-channel")).toBe(true);
  });

  it("unlock removes the lock and returns null when no queued mentions", () => {
    lock("test-channel");
    const result = unlock("test-channel");
    expect(result).toBeNull();
    expect(isLocked("test-channel")).toBe(false);
  });

  it("unlock returns the most recent queued mention only", () => {
    lock("test-channel");
    queueMention("test-channel", fakeMessage("m1"));
    queueMention("test-channel", fakeMessage("m2"));
    queueMention("test-channel", fakeMessage("m3"));
    const result = unlock("test-channel");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("m3");
  });

  it("queueMention does nothing if channel is not locked", () => {
    queueMention("test-channel", fakeMessage("m1"));
    // Lock, then unlock — should get null since the mention was queued before lock
    lock("test-channel");
    const result = unlock("test-channel");
    expect(result).toBeNull();
  });

  it("multiple queued mentions → unlock returns last one", () => {
    lock("ch-1");
    queueMention("ch-1", fakeMessage("first"));
    queueMention("ch-1", fakeMessage("second"));
    const result = unlock("ch-1");
    expect(result!.id).toBe("second");
  });
});
