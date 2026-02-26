export interface UserContext {
  discordUserId: string;
  /** Free-text context the user wants Quinn to know about them. Max 500 chars. */
  context: string;
  updatedAt: Date;
}

/**
 * Admin-provided notes on a specific user within a guild.
 * Visible to Quinn but not exposed to the user themselves.
 */
export interface AdminUserContext {
  discordUserId: string;
  guildId: string;
  context: string;
  updatedAt: Date;
}

export interface ForbiddenUser {
  discordUserId: string;
  guildId: string;
  addedAt: Date;
}

export type UiRole = "user" | "server_admin" | "bot_owner";

export interface AdminGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface AuthenticatedUser {
  discordUserId: string;
  username: string;
  avatar: string | null;
  role: UiRole;
  adminGuilds: AdminGuild[];
}
