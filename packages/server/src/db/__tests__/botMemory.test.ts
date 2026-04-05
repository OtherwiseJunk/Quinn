import { describe, it, expect, mock, beforeEach } from "bun:test";

const queryMock = mock();

mock.module("../pool.js", () => ({
  pool: { query: queryMock },
}));

const { addMemories, updateMemory } = await import("../botMemory.js");

// Use a unique guildId per test to avoid cross-test cache collisions
// (the module's internal Cache persists between tests)
let testId = 0;
function uniqueGuild() {
  return `g-${++testId}`;
}

beforeEach(() => {
  queryMock.mockReset();
});

// Helper: simulate getMemories returning existing memories
function mockExistingMemories(guildId: string, memories: string[]) {
  queryMock.mockResolvedValueOnce({
    rows: memories.map((content, i) => ({
      id: i + 1,
      guild_id: guildId,
      subject_user_id: "u1",
      content,
      created_at: new Date(),
      updated_at: new Date(),
    })),
  });
}

describe("addMemories", () => {
  it("inserts novel memories when no existing ones", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, []);
    queryMock.mockResolvedValueOnce({ rows: [] }); // INSERT

    await addMemories(gid, "u1", ["Likes cats", "Plays guitar"]);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const insertCall = queryMock.mock.calls[1];
    expect(insertCall[1]).toEqual([gid, "u1", "Likes cats", gid, "u1", "Plays guitar"]);
  });

  it("skips exact duplicate after normalization", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, ["Likes cats"]);

    await addMemories(gid, "u1", ["likes cats"]);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("skips substring duplicate (new ⊂ existing)", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, ["They really like cats a lot"]);

    await addMemories(gid, "u1", ["like cats"]);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("skips substring duplicate (existing ⊂ new)", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, ["like cats"]);

    await addMemories(gid, "u1", ["They really like cats a lot"]);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("ignores punctuation and case during comparison", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, ["Likes cats!"]);

    await addMemories(gid, "u1", ["LIKES CATS"]);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("skips empty strings after normalization", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, []);

    await addMemories(gid, "u1", ["", "  ", "!!!"]);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates within the same batch", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, []);
    queryMock.mockResolvedValueOnce({ rows: [] }); // INSERT

    await addMemories(gid, "u1", ["Likes cats", "likes cats", "LIKES CATS"]);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const insertCall = queryMock.mock.calls[1];
    expect(insertCall[1]).toEqual([gid, "u1", "Likes cats"]);
  });

  it("inserts only the novel subset when some are dupes", async () => {
    const gid = uniqueGuild();
    mockExistingMemories(gid, ["Likes cats"]);
    queryMock.mockResolvedValueOnce({ rows: [] }); // INSERT

    await addMemories(gid, "u1", ["likes cats", "Plays guitar", "Hates rain"]);

    expect(queryMock).toHaveBeenCalledTimes(2);
    const insertCall = queryMock.mock.calls[1];
    expect(insertCall[1]).toEqual([
      gid, "u1", "Plays guitar",
      gid, "u1", "Hates rain",
    ]);
  });
});

describe("updateMemory", () => {
  it("executes UPDATE query with id and content", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await updateMemory(42, "Updated content");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0];
    expect(call[0]).toContain("UPDATE bot_memory");
    expect(call[1]).toEqual([42, "Updated content"]);
  });
});
