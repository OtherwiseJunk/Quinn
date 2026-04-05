import { describe, it, expect, mock, beforeEach } from "bun:test";

const queryMock = mock();

mock.module("../pool.js", () => ({
  pool: { query: queryMock },
}));

const { isTimedOut, addTimeout, getEscalationLevel, recordDiscipline, cleanupExpired, decayDiscipline } =
  await import("../botTimeouts.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("isTimedOut", () => {
  it("returns false when no rows", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await isTimedOut("u1", "g1");
    expect(result).toBe(false);
  });

  it("returns true when a row exists", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    const result = await isTimedOut("u2", "g1");
    expect(result).toBe(true);
  });
});

describe("addTimeout", () => {
  it("inserts/upserts with correct params", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await addTimeout("u1", "g1", 4);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0];
    expect(call[1]).toEqual(["u1", "g1", 4]);
  });
});

describe("getEscalationLevel", () => {
  it("returns 0 when no history", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const level = await getEscalationLevel("u1", "g1");
    expect(level).toBe(0);
  });

  it("returns 0 when last entry expired beyond 24hr cooldown", async () => {
    const expiresAt = new Date(Date.now() - 25 * 3600 * 1000);
    const createdAt = new Date(Date.now() - 30 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 1, expires_at: expiresAt, created_at: createdAt }],
    });
    const level = await getEscalationLevel("u1", "g1");
    expect(level).toBe(0);
  });

  it("returns level+1 when within cooldown of a timeout (expires_at anchor)", async () => {
    const expiresAt = new Date(Date.now() - 23 * 3600 * 1000);
    const createdAt = new Date(Date.now() - 24 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 1, expires_at: expiresAt, created_at: createdAt }],
    });
    const level = await getEscalationLevel("u1", "g1");
    expect(level).toBe(2);
  });

  it("returns level+1 when within cooldown of a warning (created_at anchor)", async () => {
    const createdAt = new Date(Date.now() - 20 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 0, expires_at: null, created_at: createdAt }],
    });
    const level = await getEscalationLevel("u1", "g1");
    expect(level).toBe(1);
  });

  it("caps at level 3", async () => {
    const expiresAt = new Date(Date.now() - 1 * 3600 * 1000);
    const createdAt = new Date(Date.now() - 2 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 3, expires_at: expiresAt, created_at: createdAt }],
    });
    const level = await getEscalationLevel("u1", "g1");
    expect(level).toBe(3);
  });
});

describe("recordDiscipline", () => {
  it("level 0: inserts warning (no expires_at), does NOT call addTimeout", async () => {
    // getEscalationLevel → 0
    queryMock.mockResolvedValueOnce({ rows: [] });
    // INSERT warning
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await recordDiscipline("u1", "g1");
    expect(result).toEqual({ level: 0, durationHours: null });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("level 1: inserts with 1h expiry, calls addTimeout", async () => {
    const createdAt = new Date(Date.now() - 1 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 0, expires_at: null, created_at: createdAt }],
    });
    // INSERT history with expiry
    queryMock.mockResolvedValueOnce({ rows: [] });
    // addTimeout INSERT
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await recordDiscipline("u1", "g1");
    expect(result).toEqual({ level: 1, durationHours: 1 });
  });

  it("level 2: inserts with 4h expiry, calls addTimeout", async () => {
    const expiresAt = new Date(Date.now() - 1 * 3600 * 1000);
    const createdAt = new Date(Date.now() - 2 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 1, expires_at: expiresAt, created_at: createdAt }],
    });
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await recordDiscipline("u1", "g1");
    expect(result).toEqual({ level: 2, durationHours: 4 });
  });

  it("level 3: inserts with 8h expiry, calls addTimeout", async () => {
    const expiresAt = new Date(Date.now() - 1 * 3600 * 1000);
    const createdAt = new Date(Date.now() - 2 * 3600 * 1000);
    queryMock.mockResolvedValueOnce({
      rows: [{ level: 2, expires_at: expiresAt, created_at: createdAt }],
    });
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await recordDiscipline("u1", "g1");
    expect(result).toEqual({ level: 3, durationHours: 8 });
  });
});

describe("cleanupExpired", () => {
  it("returns 0 when nothing to clean", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    const count = await cleanupExpired();
    expect(count).toBe(0);
  });

  it("returns rowCount when rows deleted", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 3 });
    const count = await cleanupExpired();
    expect(count).toBe(3);
  });
});

describe("decayDiscipline", () => {
  it("returns zeroes when nothing to decay", async () => {
    // DELETE (warnings)
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    // UPDATE (decrements)
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const result = await decayDiscipline();
    expect(result).toEqual({ decremented: 0, deleted: 0 });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("reports deleted warnings and decremented levels", async () => {
    // DELETE (warnings cleared)
    queryMock.mockResolvedValueOnce({ rowCount: 2 });
    // UPDATE (levels decremented)
    queryMock.mockResolvedValueOnce({ rowCount: 3 });

    const result = await decayDiscipline();
    expect(result).toEqual({ decremented: 3, deleted: 2 });
  });

  it("runs DELETE before UPDATE (warnings cleared first)", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    await decayDiscipline();

    // First call should be the DELETE (warnings)
    const deleteCall = queryMock.mock.calls[0][0] as string;
    expect(deleteCall).toContain("DELETE");

    // Second call should be the UPDATE (decrement)
    const updateCall = queryMock.mock.calls[1][0] as string;
    expect(updateCall).toContain("UPDATE");
  });
});
