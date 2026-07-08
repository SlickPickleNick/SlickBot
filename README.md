# SlickBot

SlickBot is a bot-only all-in-one Discord server management bot foundation for the SlickPickleNick Discord server.

This version uses a TitanBot-style runtime foundation:

- JavaScript runtime instead of TypeScript build output
- `discord.js` v14
- PostgreSQL through `pg`
- Docker deployment for Railway
- Slash command auto-registration
- Lightweight `/health` endpoint for Railway health checks
- Bot-only configuration through Discord slash commands

## Current Version

`v0.1.2` foundation

## Included Foundation Features

- Bot startup
- Railway Docker deployment
- PostgreSQL schema auto-initialization
- Slash command registration
- Ephemeral/private command replies
- Permission Teams
- Module enable/disable registry
- Immediate logging
- Batched logging
- Audit log storage

## Current Commands

```text
/ping
/setup
/team create
/team add-role
/team remove-role
/team allow
/team list
/modules list
/modules enable
/modules disable
/logging set-channel
/logging mode
/logging test
/logging flush
```

## Railway Setup

Your GitHub repo root should directly contain:

```text
package.json
Dockerfile
railway.json
src/
README.md
.env.example
```

It should not be nested inside another folder.

### Required Railway Variables

```text
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=your_server_id
DATABASE_URL=provided_by_railway_postgres
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=your_discord_user_id
DEFAULT_TIMEZONE=America/New_York
LOG_BATCH_FLUSH_SECONDS=300
NODE_ENV=production
```

TitanBot-style aliases are also supported:

```text
CLIENT_ID
GUILD_ID
OWNER_IDS
POSTGRES_URL
```

## First Run

After Railway deploys successfully:

1. Run `/ping` to confirm SlickBot is online.
2. Run `/setup log_channel:#your-log-channel`.
3. Run `/logging test`.
4. Run `/logging flush` if test logs are batched.
5. Run `/modules list`.

## Discord Bot Intents

Current v0.1.2 only requests:

- Guilds
- Guild Voice States

Future modules may require additional intents, especially:

- Guild Members
- Message Content
- Guild Message Reactions

Do not enable privileged intents until a module actually needs them.

## Planned Module Roadmap

```text
v0.1 - Foundation, teams, logging, setup
v0.2 - Moderation, cases, user notes
v0.3 - Tickets, transcripts, reports
v0.4 - Applications, appeals
v0.5 - Welcome, auto roles, reaction/button roles
v0.6 - Giveaways, birthdays, scheduled messages
v0.7 - Leveling, server stats, join-to-create, custom commands
```

## Why this version changed

The previous TypeScript version failed during Railway build because TypeScript type checks blocked deployment before the bot reached runtime. This version follows a simpler JavaScript runtime foundation similar to the working TitanBot setup pattern, while keeping SlickBot's custom permission teams, module registry, logging, and future roadmap.
