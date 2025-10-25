import {
  getGuildSettings,
  listGuildSettings,
  markGuildEventPosted,
  markGuildScheduledEvent,
  registerGuildSettingsNamespace,
  type GuildSettings,
  type GuildSettingsNamespace,
} from "../services/guild-settings.ts";
import { getNextEvent } from "../services/events.ts";
import {
  crosspostDiscordMessage,
  createGuildScheduledEvent,
  sendDiscordMessage,
} from "../services/discord-rest.ts";

export interface NotifierEnv {
  DISCORD_TOKEN: string;
  FIGHT_NIGHT_SETTINGS?: GuildSettingsNamespace;
}

export interface NotifyOptions {
  force?: boolean;
  channelOverride?: string;
  now?: Date;
  markPosted?: boolean;
}

export interface NotifyResult {
  sent: boolean;
  reason: string;
  messageId?: string;
  channelId?: string;
}

export interface ScheduledEventOptions {
  force?: boolean;
  now?: Date;
  markCreated?: boolean;
}

export interface ScheduledEventResult {
  created: boolean;
  reason: string;
  eventId?: string;
}

export async function runNotifier(
  env: NotifierEnv,
  now = new Date(),
): Promise<void> {
  if (!env.DISCORD_TOKEN) {
    console.warn("DISCORD_TOKEN missing; skipping notifier run.");
    return;
  }

  if (env.FIGHT_NIGHT_SETTINGS) {
    registerGuildSettingsNamespace(env.FIGHT_NIGHT_SETTINGS);
  }

  const guilds = await listGuildSettings();
  for (const { guildId } of guilds) {
    try {
      const result = await notifyGuild(guildId, env, {
        now,
        markPosted: true,
      });
      if (result.sent) {
        console.log(
          `Notifier sent update for guild ${guildId} at ${now.toISOString()}`,
        );
      }
    } catch (error) {
      console.error(`Notifier failure for guild ${guildId}:`, error);
    }
  }
}

export async function notifyGuild(
  guildId: string,
  env: NotifierEnv,
  options: NotifyOptions = {},
): Promise<NotifyResult> {
  if (!env.DISCORD_TOKEN) {
    return { sent: false, reason: "DISCORD_TOKEN not configured." };
  }

  if (env.FIGHT_NIGHT_SETTINGS) {
    registerGuildSettingsNamespace(env.FIGHT_NIGHT_SETTINGS);
  }

  const settings = await getGuildSettingsSafe(guildId);
  if (!settings.org) {
    return { sent: false, reason: "Organization not set." };
  }

  const channelId = options.channelOverride ?? settings.channelId;
  if (!channelId) {
    return { sent: false, reason: "No notification channel configured." };
  }

  const now = options.now ?? new Date();
  const force = options.force ?? false;

  if (!force && !settings.notificationsEnabled) {
    return { sent: false, reason: "Notifications disabled." };
  }

  if (!force && !shouldRunNow(settings, now)) {
    return { sent: false, reason: "Outside configured notification hour." };
  }

  const data = await getNextEvent(settings.org);
  if (!data) {
    return { sent: false, reason: "No upcoming event found." };
  }

  const timezone = settings.timezone;
  const todayKey = formatDateKey(now, timezone);
  const eventDayKey = formatDateKey(data.event.startTime, timezone);

  if (!force && todayKey !== eventDayKey) {
    return { sent: false, reason: "Not the event day." };
  }

  if (!force && settings.lastPosted?.[settings.org] === todayKey) {
    return { sent: false, reason: "Already posted today." };
  }

  const content = buildNotificationMessage(
    settings.org,
    data.event.name,
    data.event.mainEvent,
    data.event.broadcast,
    data.event.url,
    data.event.startTime,
    timezone,
    data.card,
  );

  const message = await sendDiscordMessage(env.DISCORD_TOKEN, channelId, {
    content,
    allowed_mentions: { parse: [] },
  });

  if (settings.scheduledEventsEnabled) {
    try {
      const scheduled = await createScheduledEventForGuild(guildId, env, {
        now,
        force,
      });
      if (scheduled.created) {
        console.log(
          `Scheduled event created for guild ${guildId} (event ${scheduled.eventId ?? "unknown"}).`,
        );
      }
    } catch (error) {
      console.error(
        `Scheduled event creation during notify failed for guild ${guildId}:`,
        error,
      );
    }
  }

  if (settings.deliveryMode === "announcement") {
    try {
      await crosspostDiscordMessage(env.DISCORD_TOKEN, channelId, message.id);
    } catch (error) {
      console.warn(
        `Crosspost failed for guild ${guildId}, message ${message.id}:`,
        error,
      );
    }
  }

  const shouldMark = options.markPosted ?? !force;
  if (shouldMark) {
    await markGuildEventPosted(guildId, settings.org, todayKey);
  }

  return {
    sent: true,
    reason: "Notification posted.",
    messageId: message.id,
    channelId,
  };
}

export async function createScheduledEventForGuild(
  guildId: string,
  env: NotifierEnv,
  options: ScheduledEventOptions = {},
): Promise<ScheduledEventResult> {
  if (!env.DISCORD_TOKEN) {
    return { created: false, reason: "DISCORD_TOKEN not configured." };
  }

  if (env.FIGHT_NIGHT_SETTINGS) {
    registerGuildSettingsNamespace(env.FIGHT_NIGHT_SETTINGS);
  }

  const settings = await getGuildSettingsSafe(guildId);
  if (!settings.org) {
    return { created: false, reason: "Organization not set." };
  }

  const force = options.force ?? false;
  if (!force && !settings.scheduledEventsEnabled) {
    return { created: false, reason: "Scheduled events disabled." };
  }

  const data = await getNextEvent(settings.org);
  if (!data) {
    return { created: false, reason: "No upcoming event found." };
  }

  const timezone = settings.timezone;
  const eventDayKey = formatDateKey(data.event.startTime, timezone);
  const createDayKey = formatDateKey(
    subtractDays(data.event.startTime, 1),
    timezone,
  );
  const nowKey = formatDateKey(options.now ?? new Date(), timezone);
  const withinCreationWindow =
    nowKey === createDayKey || nowKey === eventDayKey;

  if (!force && !withinCreationWindow) {
    return {
      created: false,
      reason: "Not within scheduled event creation window.",
    };
  }

  if (!force && settings.scheduledEvents?.[settings.org] === eventDayKey) {
    return { created: false, reason: "Scheduled event already created." };
  }

  const start = data.event.startTime;
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  console.log(
    `Creating scheduled event for guild ${guildId}: start=${start.toISOString()}, end=${end.toISOString()}`,
  );

  const event = await createGuildScheduledEvent(env.DISCORD_TOKEN, guildId, {
    name: `${settings.org.toUpperCase()}: ${data.event.name}`,
    description: "Auto-created by Fight Night bot",
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
    privacy_level: 2,
    entity_type: 3,
    entity_metadata: {
      location: data.event.venue
        ? `${data.event.venue}${data.event.city ? ` — ${data.event.city}` : ""}`
        : (data.event.city ?? "TBD"),
    },
  });

  const shouldMark = options.markCreated ?? !force;
  if (shouldMark) {
    await markGuildScheduledEvent(guildId, settings.org, eventDayKey);
  }

  return {
    created: true,
    reason: "Scheduled event created.",
    eventId: event.id,
  };
}

function shouldRunNow(settings: GuildSettings, instant: Date): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: settings.timezone,
        hour: "2-digit",
        hour12: false,
      }).format(instant),
    );
    return hour === settings.notificationHour;
  } catch {
    return false;
  }
}

function formatDateKey(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";

    return `${year}-${month}-${day}`;
  } catch {
    return "0000-01-01";
  }
}

function formatTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
}

function buildNotificationMessage(
  org: string,
  name: string,
  mainEvent: string,
  broadcast: string,
  url: string,
  startTime: Date,
  timezone: string,
  card: { weightClass: string; redName: string; blueName: string }[],
): string {
  const lines = [
    `${org.toUpperCase()} Fight Night Alert!`,
    `**${name}**`,
    `Main event: ${mainEvent}`,
    `Starts at ${formatTime(startTime, timezone)} (${timezone})`,
    `Broadcast: ${broadcast}`,
    `More info: ${url}`,
  ];

  if (card.length) {
    lines.push(
      "",
      "Upcoming card:",
      ...card
        .slice(-5)
        .map(
          (bout) =>
            `- ${bout.weightClass ?? "Bout"}: ${bout.redName ?? "TBA"} vs ${bout.blueName ?? "TBA"}`,
        ),
    );
  }

  return lines.join("\n");
}

async function getGuildSettingsSafe(guildId: string): Promise<GuildSettings> {
  const settings = await getGuildSettings(guildId);
  settings.lastPosted ??= {};
  settings.scheduledEvents ??= {};
  return settings;
}

function subtractDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}
