import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import type { AdminGuild, AuthenticatedUser } from "@quinn/shared";
import { env } from "../config.js";
import { getBotGuilds } from "../lib/botGuilds.js";

const MANAGE_GUILD = 0x20n;

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

// Internal type used only during the OAuth callback — never serialized into the session.
export interface OAuthUser extends AuthenticatedUser {
  _discordAccessToken: string;
}

const verify = async (
  accessToken: string,
  _refreshToken: string,
  profile: DiscordStrategy.Profile,
  done: (err: Error | null, user?: OAuthUser) => void
) => {
  try {
    const isOwner = profile.id === env.botOwnerId;

    const userAdminGuilds: AdminGuild[] = (profile.guilds ?? [])
      .filter((g) => {
        if (g.owner) return true;
        return (BigInt(g.permissions ?? 0) & MANAGE_GUILD) === MANAGE_GUILD;
      })
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null }));

    const botGuilds = await getBotGuilds();

    let adminGuilds: AdminGuild[];
    if (isOwner && botGuilds) {
      adminGuilds = botGuilds;
    } else if (botGuilds) {
      const botGuildIds = new Set(botGuilds.map((g) => g.id));
      adminGuilds = userAdminGuilds.filter((g) => botGuildIds.has(g.id));
    } else {
      adminGuilds = userAdminGuilds;
    }

    const role = isOwner ? "bot_owner" : adminGuilds.length > 0 ? "server_admin" : "user";

    done(null, {
      discordUserId: profile.id,
      username: profile.username,
      avatar: profile.avatar ?? null,
      role,
      adminGuilds,
      _discordAccessToken: accessToken,
    });
  } catch (err) {
    done(err as Error);
  }
};

passport.use(
  new DiscordStrategy(
    {
      clientID: env.discordClientId,
      clientSecret: env.discordClientSecret,
      callbackURL: `${env.publicUrl}/api/auth/callback`,
      scope: ["identify", "guilds"],
    },
    verify as never
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: AuthenticatedUser, done) => {
  done(null, user);
});

export default passport;
