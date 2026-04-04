import type { ResolvedChannelConfig } from "@quinn/shared";

/**
 * Decides whether Quinn should respond to a message.
 */
export function shouldRespond(
  config: ResolvedChannelConfig,
  botMentioned: boolean
): boolean {
  // If mentioned and respondIfMentioned is on, always respond
  if (botMentioned && config.respondIfMentioned) {
    return true;
  }

  // If respondToAll is on, roll against responseRate
  if (config.respondToAll) {
    return Math.random() * 100 < config.responseRate;
  }

  return false;
}
