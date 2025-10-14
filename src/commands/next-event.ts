import type { CommandConfig, CommandInteraction } from "dressed";

import { getGuildSettings } from "../services/guild-settings.ts";
import { getNextEvent } from "../services/events.ts";

export const config: CommandConfig = {
  description: "Show the next event for your configured organization.",
};

export default async function nextEventCommand(
  interaction: CommandInteraction,
): Promise<void> {
  if (!interaction.guild_id) {
    await interaction.reply({
      content:
        "Run this command inside a server where settings are configured.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guild_id;
  const settings = await getGuildSettings(guildId);

  if (!settings.org) {
    await interaction.reply({
      content:
        "No organization configured yet. Run `/settings org` to choose one first.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const data = await getNextEvent(settings.org);
    if (!data) {
      await interaction.editReply(
        "I couldn't find any upcoming events right now. Check back later!",
      );
      return;
    }

    const { event, card } = data;
    const formatter = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: settings.timezone,
    });
    const formattedStart = formatter.format(event.startTime);

    const lines = [
      `**${event.name}**`,
      `Main event: ${event.mainEvent}`,
      `Date: ${formattedStart} (${settings.timezone})`,
      `Venue: ${event.venue} — ${event.city}`,
      `Broadcast: ${event.broadcast}`,
      `More info: ${event.url}`,
    ];

    if (card.length) {
      lines.push(
        "",
        "Upcoming card:",
        ...card.slice(-5).map((bout) => {
          const names = `${bout.redName} vs ${bout.blueName}`;
          return `- ${bout.weightClass}: ${names}`;
        }),
      );
    }

    await interaction.editReply(lines.join("\n"));
  } catch (error) {
    console.error("Failed to fetch next event:", error);
    await interaction.editReply(
      "Sorry, I couldn't reach ESPN right now. Try again in a minute.",
    );
  }
}
