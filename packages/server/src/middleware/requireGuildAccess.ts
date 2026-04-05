import type { Request, Response, NextFunction } from "express";
import { env } from "../config.js";

/**
 * Verifies the authenticated user has admin access to the guild in :guildId.
 * Owner bypass is checked against BOT_OWNER_ID at request time, not the cached session role.
 * Must be used after requireSession and requireRole('server_admin', 'bot_owner').
 */
export function requireGuildAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user!;

  if (user.discordUserId === env.botOwnerId) {
    next();
    return;
  }

  const { guildId } = req.params;
  if (!guildId || !user.adminGuilds.some((g) => g.id === guildId)) {
    res.status(403).json({ error: "You do not have access to this guild" });
    return;
  }

  next();
}
