export type OrgId = "ufc";

export type DeliveryMode = "message" | "announcement";

export interface GuildSettings {
  org?: OrgId;
  channelId?: string;
  deliveryMode: DeliveryMode;
  notificationHour: number;
  timezone: string;
  notificationsEnabled: boolean;
  scheduledEventsEnabled: boolean;
}

const DEFAULT_TIMEZONE = process.env.TZ ?? "Etc/UTC";
const DEFAULT_NOTIFICATION_HOUR =
  Number.parseInt(process.env.RUN_AT ?? "", 10) || 15;

const defaultSettings: GuildSettings = {
  deliveryMode: "message",
  notificationHour: DEFAULT_NOTIFICATION_HOUR,
  timezone: DEFAULT_TIMEZONE,
  notificationsEnabled: false,
  scheduledEventsEnabled: false,
};

interface SimpleKVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
}

export type GuildSettingsNamespace = SimpleKVNamespace;

const KEY_PREFIX = "guild-settings:";

const CACHE_SYMBOL = Symbol.for("fight-night-settings:cache");
const NAMESPACE_SYMBOL = Symbol.for("fight-night-settings:namespace");
const globalAny = globalThis as Record<PropertyKey, unknown> & {
  FIGHT_NIGHT_SETTINGS?: SimpleKVNamespace;
  env?: { FIGHT_NIGHT_SETTINGS?: SimpleKVNamespace };
};

const cache =
  (globalAny[CACHE_SYMBOL] as Map<string, GuildSettings> | undefined) ??
  (globalAny[CACHE_SYMBOL] = new Map<string, GuildSettings>());

let registeredNamespace = globalAny[NAMESPACE_SYMBOL] as
  | SimpleKVNamespace
  | undefined;

export function registerGuildSettingsNamespace(
  namespace: SimpleKVNamespace,
): void {
  registeredNamespace = namespace;
  globalAny[NAMESPACE_SYMBOL] = namespace;
}

function resolveNamespace(): SimpleKVNamespace | undefined {
  if (registeredNamespace) {
    return registeredNamespace;
  }

  const inferred =
    globalAny.FIGHT_NIGHT_SETTINGS ?? globalAny.env?.FIGHT_NIGHT_SETTINGS;

  if (inferred) {
    registeredNamespace = inferred;
    globalAny[NAMESPACE_SYMBOL] = inferred;
  }

  return registeredNamespace;
}

export async function getGuildSettings(
  guildId: string,
): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached) return cached;

  const kv = resolveNamespace();
  if (kv) {
    const key = KEY_PREFIX + guildId;
    try {
      const raw = await kv.get(key);
      if (raw) {
        const parsed = parseGuildSettings(raw);
        if (parsed) {
          cache.set(guildId, parsed);
          return parsed;
        }
      }
    } catch (error) {
      console.error(`Failed to load guild settings for ${guildId}:`, error);
    }
  }

  const settings = { ...defaultSettings };
  cache.set(guildId, settings);
  return settings;
}

export async function updateGuildSettings(
  guildId: string,
  patch: Partial<GuildSettings>,
): Promise<GuildSettings> {
  const current = await getGuildSettings(guildId);
  const updated = { ...current, ...patch };
  cache.set(guildId, updated);

  const kv = resolveNamespace();
  if (kv) {
    try {
      await kv.put(KEY_PREFIX + guildId, JSON.stringify(updated));
    } catch (error) {
      console.error(`Failed to persist guild settings for ${guildId}:`, error);
    }
  }

  return updated;
}

export async function deleteGuildSettings(guildId: string): Promise<void> {
  cache.delete(guildId);
  const kv = resolveNamespace();
  if (kv?.delete) {
    try {
      await kv.delete(KEY_PREFIX + guildId);
    } catch (error) {
      console.error(`Failed to delete guild settings for ${guildId}:`, error);
    }
  }
}

export function formatGuildSettings(settings: GuildSettings): string {
  const lines = [
    `- Org: ${settings.org?.toUpperCase() ?? "Not set"}`,
    `- Channel: ${settings.channelId ? `<#${settings.channelId}>` : "Not set"}`,
    `- Delivery mode: ${settings.deliveryMode}`,
    `- Notification hour: ${settings.notificationHour.toString().padStart(2, "0")}:00`,
    `- Timezone: ${settings.timezone}`,
    `- Notifications: ${settings.notificationsEnabled ? "ON" : "OFF"}`,
    `- Scheduled events: ${settings.scheduledEventsEnabled ? "ON" : "OFF"}`,
  ];

  return lines.join("\n");
}

export function __clearGuildSettingsCache(): void {
  cache.clear();
}

function parseGuildSettings(value: string): GuildSettings | null {
  try {
    const parsed = JSON.parse(value) as Partial<GuildSettings>;
    return {
      ...defaultSettings,
      ...parsed,
    };
  } catch (error) {
    console.error("Failed to parse guild settings:", error);
    return null;
  }
}
