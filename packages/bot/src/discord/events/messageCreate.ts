import type { ArgsOf } from "discordx";
import { Discord, On } from "discordx";
import { isLocked, queueMention } from "../../lock/channelLock.js";
import { processMessage } from "../../pipeline/messageProcessor.js";

@Discord()
export class MessageCreateEvent {
  @On({ event: "messageCreate" })
  async onMessage([message]: ArgsOf<"messageCreate">): Promise<void> {
    // Ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    const botUser = message.client.user;
    if (!botUser) return;

    const botMentioned = message.mentions.has(botUser.id) || message.content.includes(botUser.displayName);

    // If channel is locked (another message being processed), queue the message.
    // Only the most recent queued message will be processed when the lock releases.
    if (isLocked(message.channelId)) {
      console.log(`[Quinn] Queued message from ${message.author.username} (channel locked)`);
      queueMention(message.channelId, message);
      return;
    }

    await processMessage(message, botMentioned);
  }
}
