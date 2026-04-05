import type { Request, Response, NextFunction } from "express";
import { env } from "../config.js";

export function requireBotSecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.log("Checking bot secret for request to", req.path);
  console.log("Request headers:", req.headers);
  const secret = req.headers["x-bot-secret"];
  console.log("Secret:", secret);
  console.log("Internal secret:", env.internalBotSecret);
  console.log("Secrets match:", secret === env.internalBotSecret);
  if (!secret || secret !== env.internalBotSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
