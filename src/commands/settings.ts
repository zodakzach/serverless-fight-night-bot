import { ApplicationCommandOptionType } from "discord-api-types/v10";
import {
  CommandOption,
  type CommandConfig,
  type CommandInteraction,
} from "dressed";

import {
  formatGuildSettings,
  getGuildSettings,
  type DeliveryMode,
  type OrgId,
  updateGuildSettings,
} from "../services/guild-settings.ts";

type SettingsSubcommand =
  | "org"
  | "channel"
  | "delivery"
  | "hour"
  | "timezone"
  | "notifications"
  | "events";

const STATE_CHOICES = [
  { name: "On", value: "on" },
  { name: "Off", value: "off" },
];

const DELIVERY_CHOICES: { name: string; value: DeliveryMode }[] = [
  { name: "Message", value: "message" },
  { name: "Announcement", value: "announcement" },
];

const ORG_CHOICES: { name: string; value: OrgId }[] = [
  { name: "UFC", value: "ufc" },
];

export const config: CommandConfig = {
  description: "Configure fight-night notifications for this server.",
  options: [
    CommandOption({
      type: "Subcommand",
      name: "org",
      description: "Select the organization to track.",
      options: [
        CommandOption({
          type: "String",
          name: "org",
          description: "Fight organization (currently UFC only).",
          required: true,
          choices: ORG_CHOICES,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "channel",
      description: "Choose the channel for notifications.",
      options: [
        CommandOption({
          type: "Channel",
          name: "channel",
          description: "Defaults to the current channel if left blank.",
          required: false,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "delivery",
      description: "Set the delivery mode for posts.",
      options: [
        CommandOption({
          type: "String",
          name: "mode",
          description: "Choose regular messages or Announcement crossposting.",
          required: true,
          choices: DELIVERY_CHOICES,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "hour",
      description: "Set the daily notification hour (0-23).",
      options: [
        CommandOption({
          type: "Integer",
          name: "hour",
          description: "24-hour formatted hour for scheduled posts.",
          required: true,
          min_value: 0,
          max_value: 23,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "timezone",
      description: "Set the guild timezone (IANA identifier).",
      options: [
        CommandOption({
          type: "String",
          name: "tz",
          description: "Example: America/Los_Angeles",
          required: true,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "notifications",
      description: "Enable or disable fight-night notifications.",
      options: [
        CommandOption({
          type: "String",
          name: "state",
          description: "Turn notifications on or off.",
          required: true,
          choices: STATE_CHOICES,
        }),
      ],
    }),
    CommandOption({
      type: "Subcommand",
      name: "events",
      description: "Toggle creating scheduled Discord events.",
      options: [
        CommandOption({
          type: "String",
          name: "state",
          description: "Turn scheduled events on or off.",
          required: true,
          choices: STATE_CHOICES,
        }),
      ],
    }),
  ],
};

export default async function settingsCommand(
  interaction: CommandInteraction,
): Promise<void> {
  if (!interaction.guild_id) {
    await interaction.reply({
      content: "You can only change settings from inside a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.data.options?.[0];
  if (!subcommand) {
    await interaction.reply({
      content: "Pick a settings subcommand to run.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand.type !== ApplicationCommandOptionType.Subcommand) {
    await interaction.reply({
      content: "Unsupported option type. Try again.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guild_id;
  let message: string;

  try {
    message = await handleSubcommand(subcommand.name as SettingsSubcommand, {
      interaction,
      guildId,
      subcommand,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    await interaction.reply({
      content: text,
      ephemeral: true,
    });
    return;
  }

  const settings = await getGuildSettings(guildId);
  const snapshot = formatGuildSettings(settings);

  await interaction.reply({
    content: `${message}\n\nCurrent settings:\n${snapshot}`,
    ephemeral: true,
  });
}

async function handleSubcommand(
  name: SettingsSubcommand,
  context: {
    interaction: CommandInteraction;
    guildId: string;
    subcommand: { options?: { name: string; value?: unknown }[] };
  },
): Promise<string> {
  switch (name) {
    case "org":
      return setOrg(context.guildId, getStringOption(context, "org") as OrgId);
    case "channel":
      return setChannel(context);
    case "delivery":
      return setDelivery(
        context.guildId,
        getStringOption(context, "mode") as DeliveryMode,
      );
    case "hour":
      return setHour(context.guildId, getIntegerOption(context, "hour"));
    case "timezone":
      return setTimezone(context.guildId, getStringOption(context, "tz"));
    case "notifications":
      return toggleNotifications(
        context.guildId,
        parseOnOff(getStringOption(context, "state")),
      );
    case "events":
      return toggleScheduledEvents(
        context.guildId,
        parseOnOff(getStringOption(context, "state")),
      );
    default:
      throw new Error("Unsupported settings subcommand.");
  }
}

async function setOrg(guildId: string, org: OrgId): Promise<string> {
  if (!ORG_CHOICES.some((choice) => choice.value === org)) {
    throw new Error("That organization is not supported yet.");
  }

  const settings = await updateGuildSettings(guildId, { org });
  return `Organization set to ${settings.org?.toUpperCase()}. Notifications remain ${
    settings.notificationsEnabled ? "ON" : "OFF"
  }.`;
}

async function setChannel(context: {
  interaction: CommandInteraction;
  guildId: string;
  subcommand: { options?: { name: string; value?: unknown }[] };
}): Promise<string> {
  const provided = getChannelOption(context, "channel");
  const channelId = provided ?? context.interaction.channel_id;

  if (!channelId) {
    throw new Error(
      "I couldn't determine a channel. Run this command in a channel or pick one explicitly.",
    );
  }

  await updateGuildSettings(context.guildId, { channelId });
  return `Notifications will post in <#${channelId}>.`;
}

async function setDelivery(
  guildId: string,
  mode: DeliveryMode,
): Promise<string> {
  if (!DELIVERY_CHOICES.some((choice) => choice.value === mode)) {
    throw new Error("Delivery mode must be message or announcement.");
  }

  await updateGuildSettings(guildId, { deliveryMode: mode });
  return `Delivery mode set to ${mode}. Announcement mode only works in Announcement channels.`;
}

async function setHour(guildId: string, hour: number): Promise<string> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Hour must be an integer between 0 and 23.");
  }

  await updateGuildSettings(guildId, { notificationHour: hour });
  return `Notification hour set to ${hour.toString().padStart(2, "0")}:00.`;
}

async function setTimezone(guildId: string, timezone: string): Promise<string> {
  validateTimezone(timezone);
  await updateGuildSettings(guildId, { timezone });
  return `Timezone set to ${timezone}.`;
}

async function toggleNotifications(
  guildId: string,
  enabled: boolean,
): Promise<string> {
  const settings = await getGuildSettings(guildId);
  if (enabled && !settings.org) {
    throw new Error(
      "Set an organization with `/settings org` before enabling notifications.",
    );
  }

  await updateGuildSettings(guildId, { notificationsEnabled: enabled });
  return `Notifications turned ${enabled ? "ON" : "OFF"}.`;
}

async function toggleScheduledEvents(
  guildId: string,
  enabled: boolean,
): Promise<string> {
  await updateGuildSettings(guildId, { scheduledEventsEnabled: enabled });
  return `Scheduled events turned ${enabled ? "ON" : "OFF"}.`;
}

function getStringOption(
  context: { subcommand: { options?: { name: string; value?: unknown }[] } },
  name: string,
): string {
  const value = context.subcommand.options?.find(
    (option) => option.name === name,
  )?.value;

  if (typeof value !== "string") {
    throw new Error("Missing or invalid option.");
  }

  return value;
}

function getIntegerOption(
  context: { subcommand: { options?: { name: string; value?: unknown }[] } },
  name: string,
): number {
  const value = context.subcommand.options?.find(
    (option) => option.name === name,
  )?.value;

  if (typeof value !== "number") {
    throw new Error("Missing or invalid number option.");
  }

  return value;
}

function getChannelOption(
  context: { subcommand: { options?: { name: string; value?: unknown }[] } },
  name: string,
): string | undefined {
  const value = context.subcommand.options?.find(
    (option) => option.name === name,
  )?.value;
  return typeof value === "string" ? value : undefined;
}

function parseOnOff(value: string): boolean {
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error("State must be on or off.");
}

function validateTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(
      `Invalid timezone "${tz}". Use a valid IANA timezone such as America/New_York.`,
    );
  }
}
