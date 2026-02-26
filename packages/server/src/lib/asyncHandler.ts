import type { Request, Response, NextFunction } from "express";

/**
 * Wraps an async Express route handler so rejected promises are forwarded to next().
 * This avoids unhandled promise rejections in Express 4 (which doesn't natively catch them).
 */
export function asyncHandler<P = Record<string, string>>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request<P>, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
