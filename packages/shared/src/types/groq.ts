/**
 * The structured JSON response Quinn returns from Groq.
 * This schema is included in the system prompt so the LLM knows what to produce.
 */
export interface QuinnResponse {
  thought_process: string;
  /** Whether Quinn has decided to send a message at all */
  should_respond: boolean;
  response_type: "reply" | "standalone";
  /** The message content. May be empty string if should_respond is false */
  content: string;
  /** Whether to add an emoji reaction to the triggering message */
  should_react: boolean;
  reaction_emoji: string;
  new_memories?: string[];
  new_self_memories?: string[];
  /** Timeout the user for N hours (bot-initiated, auto-expires) */
  timeout_user?: 1 | 4 | 8;
}

/** The system-level prompt context passed to Groq on every request */
export interface GroqRequestContext {
  systemPrompt: string;
  serverPrompt: string | null;
  userContext: string | null;
  adminUserContext: string | null;
  contextMessageLimit: number;
}
