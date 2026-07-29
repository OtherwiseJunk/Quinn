function require(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Opt-in boolean env var: absent or anything other than true/1 means off. */
function flag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "true" || value === "1";
}

const DEFAULT_MODEL = "openai/gpt-oss-120b";

export const env = {
  discordToken: require("DISCORD_TOKEN"),
  internalBotSecret: require("INTERNAL_BOT_SECRET"),
  serverUrl: require("SERVER_URL"),
  groqApiKey: require("GROQ_API_KEY"),
  e2bApiKey: process.env.E2B_API_KEY || undefined,
  groqOrchestratorModel: process.env.GROQ_ORCHESTRATOR_MODEL || DEFAULT_MODEL,
  groqReplyModel: process.env.GROQ_REPLY_MODEL || DEFAULT_MODEL,
  groqConsolidationModel: process.env.GROQ_CONSOLIDATION_MODEL || DEFAULT_MODEL,
  // Off by default: the only vision-capable Groq model left is priced out of
  // reach for us. Only turn this on with a vision model in every model slot —
  // image parts sent to a text-only model make Groq reject the whole request.
  imageInputEnabled: flag("GROQ_IMAGE_INPUT_ENABLED"),
};

console.log(`[Quinn] E2B code execution: ${env.e2bApiKey ? "enabled" : "disabled (E2B_API_KEY not set)"}`);
console.log(`[Quinn] Image input: ${env.imageInputEnabled ? "enabled" : "disabled (GROQ_IMAGE_INPUT_ENABLED not set)"}`);
