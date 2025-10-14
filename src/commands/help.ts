import type { CommandConfig, CommandInteraction } from "dressed";

export const config: CommandConfig = {
  description: "Show available commands and usage tips.",
};

const HELP_LINES = [
  "Fight Night Bot commands:",
  "`/settings org org:<ufc>` — choose an organization before enabling notifications.",
  "`/settings channel [channel:<#channel>]` — set the destination channel (defaults to the current channel).",
  "`/settings delivery mode:<message|announcement>` — pick regular messages or announcement crossposts.",
  "`/settings hour hour:<0-23>` — set the daily notification hour.",
  "`/settings timezone tz:<Region/City>` — configure the guild timezone.",
  "`/settings notifications state:<on|off>` — toggle automated fight-night posts.",
  "`/settings events state:<on|off>` — toggle creating scheduled events.",
  "`/next-event` — view the next event for your configured org.",
  "`/status` — review the current guild configuration.",
];

export default async function helpCommand(
  interaction: CommandInteraction,
): Promise<void> {
  await interaction.reply({
    content: HELP_LINES.join("\n"),
    ephemeral: true,
  });
}
