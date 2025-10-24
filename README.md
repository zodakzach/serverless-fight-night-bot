# Serverless Fight Night Bot

Serverless Discord bot that keeps your community up to speed on UFC fight nights—built on Cloudflare Workers with [Bun](https://bun.com) and [Dressed](https://dressed.js.org) for slash-command ergonomics.

## Quick Links

- Invite the bot: [Add Fight Night Bot to your server](https://discord.com/oauth2/authorize?client_id=1407815699929497760)
- Source code: [github.com/zodakzach/serverless-fight-night-bot](https://github.com/zodakzach/serverless-fight-night-bot.git)
- Dressed docs: [dressed.js.org](https://dressed.js.org)

## What It Does

- Schedules and posts fight-night reminders per guild, per org (UFC today, more to come).
- Pulls live event data from the ESPN scoreboard API and avoids duplicate reminders.
- Supports configurable delivery channels, notification hours, and timezones.
- Optionally crossposts from Announcement channels for extra reach.
- Provides `/next-event` lookup and full `/status` diagnostics for admins.

## Slash Commands

- `/settings org org:<ufc>` — Select the org you want to track (required before enabling notifications).
- `/settings channel channel:<#channel>` — Choose the destination channel (defaults to current when omitted).
- `/settings delivery mode:<message|announcement>` — Control how reminders are delivered.
- `/settings hour hour:<0-23>` — Pick the daily notification hour in the guild timezone.
- `/settings timezone tz:<Region/City>` — Override the timezone (falls back to `TZ` env).
- `/settings notifications state:<on|off>` — Toggle fight-night reminders.
- `/settings events state:<on|off>` — Toggle creation of Discord Scheduled Events.
- `/next-event` — Show the next scheduled fight night for the selected org.
- `/status` — Display all current settings for the guild.
- `/help` — Summarize available commands and usage.

Dev-only (registered when `GUILD_ID` env is present):

- `/dev-test create-event` — Create a scheduled event for the next fight night (Manage Events required).
- `/dev-test create-announcement` — Trigger the full notifier flow instantly (Manage Channels required).

## Getting Started

1. `bun install`
2. Configure environment (see below) in `.env` or via Wrangler secrets.
3. Register commands and start local dev: `bun .dressed`
4. Deploy with Wrangler once you are ready: `bun build-bot && wrangler deploy`

### Required Environment Variables

| Name                         | Purpose                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `DISCORD_APP_ID`             | Discord application ID for command registration.                 |
| `DISCORD_PUBLIC_KEY`         | Discord public key for interaction verification.                 |
| `DISCORD_TOKEN`              | Bot token used for REST calls and dev utilities.                 |
| `RUN_AT` (optional)          | Default notification hour (0-23) when `/settings hour` is unset. |
| `TZ` (optional)              | Default timezone for guilds that have not configured one.        |
| `ESPN_USER_AGENT` (optional) | Overrides the default user agent for ESPN API calls.             |

Cloudflare KV (`FIGHT_NIGHT_SETTINGS`) stores guild preferences and is injected via `wrangler.jsonc`.

## Using the Bot

- Invite the bot with the link above.
- In Discord, run `/settings org org:<ufc>` followed by `/settings notifications state:on`.
- Verify with `/next-event`; if you need to adjust anything, `/status` shows the current configuration.

Posts run daily at the configured hour and will only fire on event days. Announcement delivery crossposts when possible and gracefully falls back to standard messages otherwise.
