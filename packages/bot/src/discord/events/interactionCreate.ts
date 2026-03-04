import type { ArgsOf } from "discordx";
import { Discord, On } from "discordx";
import { bot } from "../../client.js";

@Discord()
export class InteractionCreateEvent {
  @On({ event: "interactionCreate" })
  async onInteraction([interaction]: ArgsOf<"interactionCreate">): Promise<void> {
    await bot.executeInteraction(interaction);
  }
}
