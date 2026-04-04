import { Discord, Slash } from "discordx";
import { CommandInteraction } from "discord.js";
import { getTimeoutStatus } from "../../api/serverClient.js";

const LEVEL_LABELS: Record<number, string> = {
  0: "Warning",
  1: "Level 1 (1 hour)",
  2: "Level 2 (4 hours)",
  3: "Level 3 (8 hours)",
};

@Discord()
export class TimeoutCommands {
    @Slash({
        name: "timeout",
        description: "Check your timeout status in this server",
    })
    async timeoutStatus(interaction: CommandInteraction): Promise<void> {
        try {
            const status = await getTimeoutStatus(interaction.guildId!, interaction.user.id);

            if (status.isTimedOut) {
                const expiresAt = status.expiresAt ? `<t:${Math.floor(new Date(status.expiresAt).getTime() / 1000)}:R>` : "unknown";
                const levelLabel = status.level != null ? LEVEL_LABELS[status.level] ?? `Level ${status.level}` : "unknown";
                const decayAt = status.nextDecayAt ? `<t:${Math.floor(new Date(status.nextDecayAt).getTime() / 1000)}:R>` : "unknown";

                await interaction.reply({
                    content: [
                        "**You are currently timed out in this server.**",
                        `Severity: ${levelLabel}`,
                        `Expires: ${expiresAt}`,
                        `Level decays: ${decayAt}`,
                    ].join("\n"),
                    ephemeral: true,
                });
            } else if (status.level != null) {
                const levelLabel = LEVEL_LABELS[status.level] ?? `Level ${status.level}`;
                const decayAt = status.nextDecayAt ? `<t:${Math.floor(new Date(status.nextDecayAt).getTime() / 1000)}:R>` : "unknown";

                await interaction.reply({
                    content: [
                        "You are not currently timed out, but you have a discipline record.",
                        `Current severity: ${levelLabel}`,
                        `Level decays: ${decayAt}`,
                    ].join("\n"),
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "You have no timeout history in this server.",
                    ephemeral: true,
                });
            }
        } catch (err) {
            console.error("Failed to fetch timeout status:", err);
            await interaction.reply({
                content: "An error occurred while fetching timeout status.",
                ephemeral: true,
            });
        }
    }
}
