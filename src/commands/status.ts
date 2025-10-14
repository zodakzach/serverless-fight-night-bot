import type { CommandConfig, CommandInteraction } from "dressed";

import {
  formatGuildSettings,
  getGuildSettings,
} from "../services/guild-settings.ts";

export const config: CommandConfig = {
  description: "Display the current fight-night configuration for this guild.",
};

export default async function statusCommand(
  interaction: CommandInteraction,
): Promise<void> {
  if (!interaction.guild_id) {
    await interaction.reply({
      content: "This command only works inside a server.",
      ephemeral: true,
    });
    return;
  }

  const settings = await getGuildSettings(interaction.guild_id);
  const snapshot = formatGuildSettings(settings);

  await interaction.reply({
    content: `Current settings:\n${snapshot}`,
    ephemeral: true,
  });
}
