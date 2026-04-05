import { describe, it, expect, mock } from "bun:test";

// Mock config before importing the middleware
mock.module("../../config.js", () => ({
  env: { botOwnerId: "owner-123" },
}));

const { requireGuildAccess } = await import("../requireGuildAccess.js");

function fakeReq(user: any, params: Record<string, string> = {}) {
  return { user, params } as any;
}

function fakeRes() {
  const res: any = {};
  res.status = mock((code: number) => res);
  res.json = mock((body: any) => res);
  return res;
}

describe("requireGuildAccess", () => {
  it("calls next() for bot owner (bypass)", () => {
    const next = mock();
    const req = fakeReq(
      { discordUserId: "owner-123", adminGuilds: [] },
      { guildId: "any-guild" }
    );
    requireGuildAccess(req, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls next() when guildId is in user's adminGuilds", () => {
    const next = mock();
    const req = fakeReq(
      {
        discordUserId: "user-456",
        adminGuilds: [{ id: "g1", name: "Guild 1", icon: null }],
      },
      { guildId: "g1" }
    );
    requireGuildAccess(req, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when guild not in adminGuilds", () => {
    const next = mock();
    const res = fakeRes();
    const req = fakeReq(
      {
        discordUserId: "user-456",
        adminGuilds: [{ id: "g1", name: "Guild 1", icon: null }],
      },
      { guildId: "g2" }
    );
    requireGuildAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "You do not have access to this guild",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when guildId param is missing", () => {
    const next = mock();
    const res = fakeRes();
    const req = fakeReq(
      { discordUserId: "user-456", adminGuilds: [] },
      {}
    );
    requireGuildAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
