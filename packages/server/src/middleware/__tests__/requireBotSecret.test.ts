import { describe, it, expect, mock } from "bun:test";

// Mock config before importing the middleware
mock.module("../../config.js", () => ({
  env: { internalBotSecret: "test-secret" },
}));

const { requireBotSecret } = await import("../requireBotSecret.js");

function fakeReq(headers: Record<string, string> = {}) {
  return { headers, path: "/test" } as any;
}

function fakeRes() {
  const res: any = {};
  res.status = mock((code: number) => res);
  res.json = mock((body: any) => res);
  return res;
}

describe("requireBotSecret", () => {
  it("calls next() when header matches", () => {
    const next = mock();
    requireBotSecret(fakeReq({ "x-bot-secret": "test-secret" }), fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when header is missing", () => {
    const next = mock();
    const res = fakeRes();
    requireBotSecret(fakeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header is wrong", () => {
    const next = mock();
    const res = fakeRes();
    requireBotSecret(fakeReq({ "x-bot-secret": "wrong-secret" }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
