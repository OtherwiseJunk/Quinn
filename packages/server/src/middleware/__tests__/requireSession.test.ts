import { describe, it, expect, mock } from "bun:test";
import { requireSession } from "../requireSession.js";

function fakeReq(overrides = {}) {
  return { ...overrides } as any;
}

function fakeRes() {
  const res: any = {};
  res.status = mock((code: number) => res);
  res.json = mock((body: any) => res);
  return res;
}

describe("requireSession", () => {
  it("calls next() when req.user exists", () => {
    const next = mock();
    requireSession(fakeReq({ user: { discordUserId: "u1" } }), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when req.user is undefined", () => {
    const next = mock();
    const res = fakeRes();
    requireSession(fakeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });
});
