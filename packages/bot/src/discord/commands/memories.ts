import { Discord, Slash } from "discordx";
import { CommandInteraction } from "discord.js";
import { getMemories } from "../../api/serverClient.js";

@Discord()
export class MemoryCommands {
  @Slash({ name: "memories", description: "See what Quinn remembers about you in this server" })
  async memories(interaction: CommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    try {
      const memories = await getMemories(interaction.guildId, interaction.user.id);

      if (memories.length === 0) {
        await interaction.reply({
          content: "Quinn doesn't have any memories about you in this server yet.",
          ephemeral: true,
        });
        return;
      }

      const list = memories.map((m) => `- ${m.content}`).join("\n");
      const header = `**Quinn's memories about you** (${memories.length}):\n`;
      const full = header + list;

      // Discord messages cap at 2000 chars
      if (full.length <= 2000) {
        await interaction.reply({ content: full, ephemeral: true });
      } else {
        const truncated = full.slice(0, 1950) + "\n\n*...truncated — too many memories to display.*";
        await interaction.reply({ content: truncated, ephemeral: true });
      }
    } catch (err) {
      console.error("Failed to fetch memories:", err);
      await interaction.reply({
        content: "Failed to fetch memories. Please try again later.",
        ephemeral: true,
      });
    }
  }
}
