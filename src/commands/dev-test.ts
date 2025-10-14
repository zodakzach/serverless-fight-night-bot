import {
  CommandOption,
  type CommandConfig,
  type CommandInteraction,
} from "dressed";
import {
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} from "discord-api-types/v10";

const devGuildId = process.env.GUILD_ID;

const DEV_PERMISSION_BITFIELD = (
  BigInt(PermissionFlagsBits.ManageEvents) |
  BigInt(PermissionFlagsBits.ManageChannels)
).toString();

export const config: CommandConfig = {
  description: "Developer testing helpers for Fight Night Bot.",
  guilds: devGuildId ? [devGuildId] : undefined,
  default_member_permissions: DEV_PERMISSION_BITFIELD,
  options: [
    CommandOption({
      type: "Subcommand",
      name: "create-event",
      description:
        "Create a scheduled event for the next fight night (dev only).",
    }),
    CommandOption({
      type: "Subcommand",
      name: "create-announcement",
      description:
        "Post the next fight-night announcement immediately (dev only).",
    }),
  ],
};

export default async function devTestCommand(
  interaction: CommandInteraction,
): Promise<void> {
  const subcommand = interaction.data.options?.[0];
  if (
    !subcommand ||
    subcommand.type !== ApplicationCommandOptionType.Subcommand
  ) {
    await interaction.reply({
      content: "Pick a testing action to run.",
      ephemeral: true,
    });
    return;
  }

  switch (subcommand.name) {
    case "create-event": {
      await interaction.reply({
        content:
          "Scheduled event creation is not hooked up yet, but the command is registered.",
        ephemeral: true,
      });
      break;
    }
    case "create-announcement": {
      await interaction.reply({
        content:
          "Announcement preview is not implemented yet. Add the notifier workflow to enable this.",
        ephemeral: true,
      });
      break;
    }
    default: {
      await interaction.reply({
        content: "Unknown dev-test subcommand.",
        ephemeral: true,
      });
    }
  }
}
