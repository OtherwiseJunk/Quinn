import { describe, it, expect, mock } from "bun:test";
import { asyncHandler } from "../asyncHandler.js";

function fakeReq(overrides = {}) {
  return { ...overrides } as any;
}

function fakeRes() {
  const res: any = {};
  res.status = mock((code: number) => res);
  res.json = mock((body: any) => res);
  return res;
}

describe("asyncHandler", () => {
  it("calls the wrapped handler normally", async () => {
    const handler = mock(async (_req: any, res: any) => {
      res.json({ ok: true });
    });
    const wrapped = asyncHandler(handler);
    const req = fakeReq();
    const res = fakeRes();
    const next = mock();

    await wrapped(req, res, next);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a thrown error to next()", async () => {
    const err = new Error("sync boom");
    const handler = mock(async () => {
      throw err;
    });
    const wrapped = asyncHandler(handler);
    const next = mock();

    await wrapped(fakeReq(), fakeRes(), next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it("forwards a rejected promise to next()", async () => {
    const err = new Error("async boom");
    const handler = mock(() => Promise.reject(err));
    const wrapped = asyncHandler(handler);
    const next = mock();

    await wrapped(fakeReq(), fakeRes(), next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
