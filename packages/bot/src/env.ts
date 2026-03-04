function require(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  discordToken: require("DISCORD_TOKEN"),
  internalBotSecret: require("INTERNAL_BOT_SECRET"),
  serverUrl: require("SERVER_URL"),
  groqApiKey: require("GROQ_API_KEY"),
  e2bApiKey: process.env.E2B_API_KEY || undefined,
};

console.log(`[Quinn] E2B code execution: ${env.e2bApiKey ? "enabled" : "disabled (E2B_API_KEY not set)"}`);
