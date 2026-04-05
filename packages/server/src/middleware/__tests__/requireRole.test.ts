import { describe, it, expect, mock } from "bun:test";
import { requireRole } from "../requireRole.js";

function fakeReq(overrides = {}) {
  return { ...overrides } as any;
}

function fakeRes() {
  const res: any = {};
  res.status = mock((code: number) => res);
  res.json = mock((body: any) => res);
  return res;
}

describe("requireRole", () => {
  it("calls next() when user role is in allowed set", () => {
    const middleware = requireRole("server_admin", "bot_owner");
    const next = mock();
    middleware(fakeReq({ user: { role: "server_admin" } }), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when role is not in allowed set", () => {
    const middleware = requireRole("bot_owner");
    const next = mock();
    const res = fakeRes();
    middleware(fakeReq({ user: { role: "user" } }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when req.user is undefined", () => {
    const middleware = requireRole("server_admin");
    const next = mock();
    const res = fakeRes();
    middleware(fakeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("works with multiple allowed roles", () => {
    const middleware = requireRole("user", "server_admin", "bot_owner");
    const next = mock();
    middleware(fakeReq({ user: { role: "user" } }), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
