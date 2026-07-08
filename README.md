# SlickBot

SlickBot is a custom all-in-one Discord server management bot being built first for the SlickPickleNick Discord server.

Current scope: **bot-only foundation**. No web dashboard is included yet.

## Current v0.1 foundation

Included:

- TypeScript + discord.js
- Prisma + PostgreSQL
- Railway Docker deployment
- Railway `/health` endpoint
- Slash command auto-registration
- Ephemeral/private command responses
- Permission Teams
- Module enable/disable system
- Immediate logging
- Batched logging queue
- Audit log database table
- `/setup`
- `/team`
- `/modules`
- `/logging`
- `/ping`

## Railway deployment

Railway should build this project using the root `Dockerfile`.

The GitHub repo root must directly contain:

```text
package.json
Dockerfile
railway.json
prisma/
src/
README.md
```

Do not upload the files inside an extra nested folder.

## Railway services

Create:

1. One Railway service for SlickBot from the GitHub repo.
2. One Railway PostgreSQL database service.

Railway PostgreSQL exposes a `DATABASE_URL` variable. Add that value to the SlickBot service variables.

## Required Railway variables

```text
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=your_server_id
DATABASE_URL=${{Postgres.DATABASE_URL}}
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=your_discord_user_id
DEFAULT_TIMEZONE=America/New_York
LOG_BATCH_FLUSH_SECONDS=300
NODE_ENV=production
WEB_HOST=0.0.0.0
```

Railway usually injects `PORT` automatically. You do not need to manually set it unless Railway asks for it.

## Compatibility variable aliases

SlickBot also accepts some TitanBot-style variable names at runtime:

| Preferred | Alias |
|---|---|
| `DISCORD_CLIENT_ID` | `CLIENT_ID` |
| `DISCORD_GUILD_ID` | `GUILD_ID` |
| `BOT_OWNER_IDS` | `OWNER_IDS` |
| `DATABASE_URL` | `POSTGRES_URL` |

For Railway + Prisma, still use `DATABASE_URL` when possible.

## Discord Developer Portal setup

For v0.1, the bot only needs basic Gateway intents.

Required:

- Guilds

Not required yet:

- Server Members Intent
- Message Content Intent
- Presence Intent

This is intentional. Requesting privileged intents before they are enabled can stop the bot from logging in. Future modules such as welcome, leveling, reaction roles, and full logging may require additional intents later.

## Invite URL scopes

When inviting the bot, use these scopes:

```text
bot
applications.commands
```

Recommended permissions for the early foundation:

```text
View Channels
Send Messages
Embed Links
Attach Files
Read Message History
Use Slash Commands
```

Later modules will need additional permissions, such as Manage Roles, Manage Channels, Ban Members, Kick Members, and Moderate Members.

## Railway health endpoint

SlickBot includes a small HTTP server for Railway deployment health checks:

```text
/health
```

The endpoint returns HTTP 200 when the process is running.

## Local development

Requirements:

- Node.js 22.12.0 or newer
- PostgreSQL database

Install:

```bash
npm install
```

Generate Prisma client:

```bash
npm run db:generate
```

Push database schema:

```bash
npm run db:push
```

Start development mode:

```bash
npm run dev
```

## First Discord setup commands

After the bot is online in Discord, run:

```text
/setup log_channel:#your-log-channel
/logging test
/modules list
/ping
```

## Common Railway issues

### Build fails because `tsc` or `prisma` is missing

This version uses `npm install --include=dev` in the Dockerfile so build tools are installed even when Railway builds with `NODE_ENV=production`.

### Bot deploys but Railway health check fails

Make sure the service is using this repo's `Dockerfile` and that the healthcheck path is:

```text
/health
```

### Bot crashes with missing environment variable

Check that these are set on the SlickBot service, not only on the PostgreSQL service:

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DATABASE_URL
BOT_OWNER_IDS
```

### Bot crashes with disallowed intents

For v0.1, do not add privileged intents in code unless they are enabled in the Discord Developer Portal. This starter intentionally avoids privileged intents.

## Next module target

v0.2 should add:

- Moderation cases
- User notes
- `/warn`
- `/case view`
- `/note add`
- Better audit log viewing
