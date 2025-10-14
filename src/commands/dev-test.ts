import {
  CommandOption,
  type CommandConfig,
  type CommandInteraction,
} from "dressed";
import {
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import {
  createScheduledEventForGuild,
  notifyGuild,
  type NotifierEnv,
} from "../notifier/notifier.ts";
import type { GuildSettingsNamespace } from "../services/guild-settings.ts";

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
      options: [
        CommandOption({
          type: "Boolean",
          name: "force",
          description:
            "Ignore timing checks and create the event regardless of date.",
          required: false,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "create-announcement",
      description:
        "Post the next fight-night announcement immediately (dev only).",
      options: [
        CommandOption({
          type: "Channel",
          name: "channel",
          description: "Override the destination channel for this preview.",
          required: false,
        }),
        CommandOption({
          type: "Boolean",
          name: "force",
          description:
            "Ignore timing/duplicate checks when sending the announcement.",
          required: false,
        }),
      ],
    }),
  ],
};

export default async function devTestCommand(
  interaction: CommandInteraction,
): Promise<void> {
  if (!interaction.guild_id) {
    await interaction.reply({
      content: "Run this command inside a guild.",
      ephemeral: true,
    });
    return;
  }

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
      await handleCreateEvent(interaction, subcommand);
      break;
    }
    case "create-announcement": {
      await handleCreateAnnouncement(interaction, subcommand);
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

async function handleCreateEvent(
  interaction: CommandInteraction,
  subcommand: { options?: { name: string; value?: unknown }[] },
): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    await interaction.reply({
      content: "DISCORD_TOKEN missing; cannot create scheduled event.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const env: NotifierEnv = {
      DISCORD_TOKEN: token,
      FIGHT_NIGHT_SETTINGS: discoverNamespace(),
    };
    const force = extractBoolean(subcommand, "force") ?? true;

    const result = await createScheduledEventForGuild(
      interaction.guild_id!,
      env,
      {
        force,
        now: new Date(),
        markCreated: !force,
      },
    );

    await interaction.editReply(
      result.created
        ? `Scheduled event created successfully (ID: ${result.eventId ?? "unknown"}).`
        : `Skipped: ${result.reason}`,
    );
  } catch (error) {
    console.error("create-event dev command failed:", error);
    await interaction.editReply(
      `Failed to create scheduled event: ${formatError(error)}`,
    );
  }
}

async function handleCreateAnnouncement(
  interaction: CommandInteraction,
  subcommand: { options?: { name: string; value?: unknown }[] },
): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    await interaction.reply({
      content: "DISCORD_TOKEN missing; cannot send announcement.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const channelOverride =
      extractChannelId(subcommand) ?? interaction.channel_id;
    const force = extractBoolean(subcommand, "force") ?? true;

    const env: NotifierEnv = {
      DISCORD_TOKEN: token,
      FIGHT_NIGHT_SETTINGS: discoverNamespace(),
    };

    const result = await notifyGuild(interaction.guild_id!, env, {
      force,
      now: new Date(),
      markPosted: !force,
      channelOverride: channelOverride ?? undefined,
    });

    await interaction.editReply(
      result.sent
        ? `Announcement posted in ${
            result.channelId ? `<#${result.channelId}>` : "configured channel"
          }.`
        : `Skipped: ${result.reason}`,
    );
  } catch (error) {
    console.error("create-announcement dev command failed:", error);
    await interaction.editReply(
      `Failed to send announcement: ${formatError(error)}`,
    );
  }
}

function extractChannelId(subcommand: {
  options?: { name: string; value?: unknown }[];
}): string | undefined {
  const value = subcommand.options?.find(
    (option) => option.name === "channel",
  )?.value;
  return typeof value === "string" ? value : undefined;
}

function extractBoolean(
  subcommand: { options?: { name: string; value?: unknown }[] },
  name: string,
): boolean | undefined {
  const value = subcommand.options?.find(
    (option) => option.name === name,
  )?.value;
  return typeof value === "boolean" ? value : undefined;
}

function discoverNamespace(): GuildSettingsNamespace | undefined {
  const globalAny = globalThis as Record<PropertyKey, unknown> & {
    FIGHT_NIGHT_SETTINGS?: GuildSettingsNamespace;
    env?: { FIGHT_NIGHT_SETTINGS?: GuildSettingsNamespace };
  };

  return globalAny.FIGHT_NIGHT_SETTINGS ?? globalAny.env?.FIGHT_NIGHT_SETTINGS;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
