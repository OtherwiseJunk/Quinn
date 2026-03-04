import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  CommandInteraction,
} from "discord.js";
import {
  getUserContext,
  updateUserContext,
} from "../../api/serverClient.js";

@Discord()
@SlashGroup({ name: "context", description: "Manage your personal context for Quinn" })
@SlashGroup("context")
export class ContextCommands {
  @Slash({ name: "set", description: "Set your personal context (max 500 chars)" })
  async set(
    @SlashOption({
      name: "text",
      description: "Context you want Quinn to know about you",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    text: string,
    interaction: CommandInteraction
  ): Promise<void> {
    if (text.length > 500) {
      await interaction.reply({
        content: "Context must be 500 characters or fewer.",
        ephemeral: true,
      });
      return;
    }

    try {
      await updateUserContext(interaction.user.id, text);
      await interaction.reply({
        content: "Your context has been saved.",
        ephemeral: true,
      });
    } catch (err) {
      console.error("Failed to set context:", err);
      await interaction.reply({
        content: "Failed to save context. Please try again later.",
        ephemeral: true,
      });
    }
  }

  @Slash({ name: "view", description: "View your current personal context" })
  async view(interaction: CommandInteraction): Promise<void> {
    try {
      const userContext = await getUserContext(interaction.user.id);
      if (!userContext) {
        await interaction.reply({
          content: "You haven't set any context yet. Use `/context set` to add some.",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `**Your context:**\n${userContext.context}`,
        ephemeral: true,
      });
    } catch (err) {
      console.error("Failed to view context:", err);
      await interaction.reply({
        content: "Failed to fetch context. Please try again later.",
        ephemeral: true,
      });
    }
  }

  @Slash({ name: "clear", description: "Clear your personal context" })
  async clear(interaction: CommandInteraction): Promise<void> {
    try {
      await updateUserContext(interaction.user.id, "");
      await interaction.reply({
        content: "Your context has been cleared.",
        ephemeral: true,
      });
    } catch (err) {
      console.error("Failed to clear context:", err);
      await interaction.reply({
        content: "Failed to clear context. Please try again later.",
        ephemeral: true,
      });
    }
  }
}
