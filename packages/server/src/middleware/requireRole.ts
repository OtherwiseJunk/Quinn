import type { Request, Response, NextFunction } from "express";
import type { UiRole } from "@quinn/shared";

export function requireRole(...roles: UiRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
