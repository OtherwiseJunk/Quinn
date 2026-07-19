/** The system-level prompt context passed to Groq on every request */
export interface GroqRequestContext {
  systemPrompt: string;
  serverPrompt: string | null;
  userContext: string | null;
  adminUserContext: string | null;
  contextMessageLimit: number;
}

/** Actions accumulated from native tool calls during the agent loop. */
export interface ResolvedActions {
  reply?: { content: string; thought: string; responseType: "reply" | "standalone" };
  react?: { emoji: string };
  rememberUser: string[];
  rememberSelf: string[];
  forget: number[];
  updateMemories: { id: number; content: string }[];
  timeout?: { reason: string };
}

export function emptyActions(): ResolvedActions {
  return { rememberUser: [], rememberSelf: [], forget: [], updateMemories: [] };
}
