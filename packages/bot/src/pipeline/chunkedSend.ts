import type { Message, TextChannel } from "discord.js";

const MAX_LENGTH = 1900;

/** Strip @everyone and @here pings so the bot can never mass-ping. */
function sanitizeMentions(text: string): string {
  return text.replace(/@(everyone|here)/gi, "@\u200B$1");
}

/**
 * Splits text into chunks that fit within Discord's character limit.
 * Prefers splitting at newlines, then spaces, then hard-cuts.
 */
export function chunkMessage(text: string): string[] {
  if (text.length <= MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", MAX_LENGTH);
    if (splitAt <= 0) splitAt = MAX_LENGTH;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }

  return chunks;
}

/** Send a potentially long message as a reply, chunking if needed. */
export async function sendReply(message: Message, content: string): Promise<void> {
  const chunks = chunkMessage(sanitizeMentions(content));
  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await (message.channel as TextChannel).send(chunks[i]);
  }
}

/** Send a potentially long message to a channel, chunking if needed. */
export async function sendChannel(channel: TextChannel, content: string): Promise<void> {
  const chunks = chunkMessage(sanitizeMentions(content));
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}
