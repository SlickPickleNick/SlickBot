# SlickBot

Bot-only foundation for an all-in-one Discord server management bot.

## Project identity

- Project name: **SlickBot**
- Recommended GitHub repo: `slickbot`
- Recommended Railway service: `slickbot`
- Current mode: bot-only, no dashboard

## Current scope

This starter includes the v0.1 foundation:

- TypeScript + discord.js
- Prisma + PostgreSQL
- Railway-ready deployment files
- Slash command registration
- Ephemeral/private command responses
- Permission Teams
- Module enable/disable system
- Immediate and batched logging
- Audit log table

This does **not** include the web dashboard yet.

## Commands included

### Core

- `/ping` - Check whether the bot is online.
- `/setup` - Initialize the bot for your server.

### Permission Teams

- `/team create`
- `/team add-role`
- `/team remove-role`
- `/team add-user`
- `/team remove-user`
- `/team allow`
- `/team revoke`
- `/team list`

### Modules

- `/modules list`
- `/modules enable`
- `/modules disable`

### Logging

- `/logging set-channel`
- `/logging mode`
- `/logging test`
- `/logging flush`

## Railway setup

### 1. Create the Discord application

Create a Discord application and bot in the Discord Developer Portal.

Needed values:

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
```

Use `DISCORD_GUILD_ID` while testing so command updates appear quickly in your server.

### 2. Create a GitHub repo

Recommended repo name:

```text
slickbot
```

Push this project to GitHub.

### 3. Create a Railway project

In Railway:

1. Create a new project.
2. Deploy from GitHub.
3. Select the repo.
4. Add a PostgreSQL service.
5. Set the bot service environment variables.

### 4. Environment variables

Set these in Railway:

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
```

The exact Postgres service name in Railway may differ. If your database service is not named `Postgres`, use the matching Railway variable reference.

### 5. Initialize the database

After the service has its `DATABASE_URL`, run this once from Railway shell or locally with the production database URL:

```bash
npm install
npx prisma db push
```

For early development, `prisma db push` is fine. Once the schema stabilizes, switch to Prisma migrations.

### 6. Start command

Railway should use:

```bash
npm start
```

The included `railway.json` sets:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start"
  }
}
```

## First Discord setup

After the bot is online and slash commands are registered:

1. Run `/setup log_channel:#your-log-channel`.
2. Run `/logging test`.
3. Run `/modules list`.
4. Create teams as needed:

```text
/team create name:Moderator Team description:Mods and Senior Mods
/team add-role team:Moderator Team role:@MODS
/team add-role team:Moderator Team role:@SENIOR MODS
/team allow team:Moderator Team action_key:moderation.warn
```

## Permission model

Every command has:

```text
moduleKey
actionKey
```

Before the command runs, the bot checks:

1. Is the command being used inside a server?
2. Is the module enabled?
3. Is the user a bot owner?
4. Is the user a Discord Administrator?
5. Is the user in a Permission Team with the required action key?

Bot owners and Discord Administrators bypass team checks in this starter version.

## Logging model

Logs can be:

- Immediate
- Batched
- Disabled

Example:

```text
/logging mode event_key:voice delivery:BATCHED interval_seconds:300
/logging mode event_key:moderation delivery:IMMEDIATE
/logging mode event_key:message-delete delivery:BATCHED interval_seconds:900
```

Batched logs are queued in the database and flushed on a timer. If a batch is too large for an embed, the bot attaches a `.txt` file.

## Next modules to build

Recommended order:

```text
v0.2 - Moderation, cases, user notes
v0.3 - Tickets, transcripts, reports
v0.4 - Applications and appeals
v0.5 - Welcome, auto roles, reaction/button roles
v0.6 - Giveaways, birthdays, scheduled messages
v0.7 - Leveling, server stats, join-to-create voice, custom commands
```
