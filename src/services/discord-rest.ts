const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface DiscordMessagePayload {
  content: string;
  embeds?: unknown[];
  allowed_mentions?: {
    parse?: string[];
  };
}

export interface DiscordMessageResponse {
  id: string;
  channel_id: string;
}

export interface GuildScheduledEventCreateParams {
  name: string;
  description?: string;
  scheduled_start_time: string;
  scheduled_end_time?: string;
  privacy_level: number;
  entity_type: number;
  channel_id?: string;
  entity_metadata?: {
    location?: string;
  };
}

export interface GuildScheduledEvent {
  id: string;
  name: string;
  scheduled_start_time: string;
  scheduled_end_time?: string;
}

async function discordFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bot ${token}`);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Discord API ${response.status} ${response.statusText} (${path}): ${detail}`,
    );
  }

  return response;
}

export async function sendDiscordMessage(
  token: string,
  channelId: string,
  payload: DiscordMessagePayload,
): Promise<DiscordMessageResponse> {
  const response = await discordFetch(
    token,
    `/channels/${channelId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return response.json() as Promise<DiscordMessageResponse>;
}

export async function crosspostDiscordMessage(
  token: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  await discordFetch(
    token,
    `/channels/${channelId}/messages/${messageId}/crosspost`,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export async function createGuildScheduledEvent(
  token: string,
  guildId: string,
  params: GuildScheduledEventCreateParams,
): Promise<GuildScheduledEvent> {
  const response = await discordFetch(
    token,
    `/guilds/${guildId}/scheduled-events`,
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );

  return response.json() as Promise<GuildScheduledEvent>;
}
