import type { TextBasedChannel } from "discord.js";

const MIN_DELAY = 500;
const MAX_DELAY = 15_000;
const TYPING_REFRESH_INTERVAL = 8_000;

/**
 * Starts the typing indicator and returns a function to stop it.
 * Refreshes every 8s to keep the indicator active during long waits.
 */
export function startTyping(channel: TextBasedChannel): () => void {
  let stopped = false;

  const sendTyping = () => {
    if (!stopped && "sendTyping" in channel) {
      (channel as { sendTyping: () => Promise<void> }).sendTyping().catch(() => {});
    }
  };

  sendTyping();
  const interval = setInterval(sendTyping, TYPING_REFRESH_INTERVAL);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}

/**
 * Calculates a realistic typing delay based on content length.
 * Adds random variance for a natural feel. Clamped between 500ms and 15s.
 */
export function calculateTypingDelay(contentLength: number): number {
  const base = contentLength * 50;
  const variance = (Math.random() - 0.5) * 1000;
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, base + variance));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
