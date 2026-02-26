function require(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  databaseUrl: require("DATABASE_URL"),
  discordClientId: require("DISCORD_CLIENT_ID"),
  discordClientSecret: require("DISCORD_CLIENT_SECRET"),
  sessionSecret: require("SESSION_SECRET"),
  internalBotSecret: require("INTERNAL_BOT_SECRET"),
  botOwnerId: require("BOT_OWNER_ID"),
  discordBotToken: process.env.DISCORD_TOKEN ?? null,
  port: parseInt(process.env.SERVER_PORT ?? "3000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  // The public URL of this server, used for the Discord OAuth callback
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:3000",
  // Where to redirect after login — differs between dev (Vite :5173) and prod (same origin via nginx)
  uiUrl: process.env.UI_URL ?? "http://localhost:5173",
};
