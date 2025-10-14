# serverless-fight-night-bot

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Why

I'm lazy and tired of manually posting fight-night events in my Discord server. I announce fights and share my picks, and keeping up with those event posts is a chore — so I made this bot to announce the fight nights for me.

## What

- Notifies a configured channel on fight nights for your chosen org (UFC supported now).
- Lets you select the org and destination channel for posts.
- Provides a quick "next event" lookup command.
- Tracks last-posted event per guild and per org to prevent duplicates.
- Optional announcement delivery that publishes in Announcement channels.

## Features

- Org selection per guild (UFC supported today; others later).
- Notifications are OFF by default; you must set an org before enabling.
- Channel routing to a specific, configurable channel.
- Event-day posting with at-most-once delivery per event/guild/org.
- Optional announcement mode: publish messages from Announcement channels to follower servers (falls back to regular messages when unsupported).
- Next-event lookup via slash command.

## Commands

Top-level commands:

- `/settings`: Configure guild settings via subcommands:
  - `/settings org org:<ufc>`: Choose the organization (currently UFC only). Required before enabling notifications.
  - `/settings channel [channel:<#channel>]`: Pick the channel for notifications (defaults to the current channel if omitted).
  - `/settings delivery mode:<message|announcement>`: Choose regular messages or announcements. Announcement mode applies only in Announcement channels.
  - `/settings hour hour:<0-23>`: Set the daily notification hour (guild timezone).
  - `/settings timezone tz:<Region/City>`: Set the guild timezone (IANA name).
  - `/settings notifications state:<on|off>`: Enable or disable fight-night posts (requires org set).
  - `/settings events state:<on|off>`: Enable or disable creating Discord Scheduled Events the day before an event.
- `/next-event`: Show the next event for the selected org.
- `/status`: Show current settings for this guild.
- `/help`: Show available commands and usage.

Dev-only (registered only when `GUILD_ID` is set):

- `/dev-test create-event`: Create a Discord Scheduled Event for the next org event (requires Manage Events; testing only).
- `/dev-test create-announcement`: Post the next event message+embed now via the notifier path (requires Manage Channels; testing only).

## Getting Started

- Invite the bot: [Add Fight Night Bot to your server](https://discord.com/oauth2/authorize?client_id=1407815699929497760).
- Set org: run `/settings org org:<ufc>`.
- Pick channel: run `/settings channel channel:<#your-channel>`.
- Optional timezone: run `/settings timezone tz:<Region/City>` (defaults to `TZ` env).
- Enable notifications: run `/settings notifications on` (notifications are off by default).
- Verify: run `/next-event` to see the next event for your org.
  - For a full preview of the daily post, use the dev command `/dev-test create-announcement` in your dev guild.

Notes

- Posts run daily at the configured hour (per guild via `/settings hour`, default from `RUN_AT`) in your guild's timezone; event-day posts only. Minutes are ignored.
- You must set an org before enabling notifications.
- Announcement mode works only in Announcement (News) channels. The bot will send the message normally and then attempt to publish it (crosspost). If the channel type is not Announcement or publishing fails, the message remains as a regular post.
