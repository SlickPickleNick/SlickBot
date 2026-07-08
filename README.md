# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick Discord server.

This version uses the working TitanBot-style foundation: JavaScript, discord.js, PostgreSQL, Railway Docker deployment, slash commands, database-backed settings, and bot-only configuration through Discord.

## Version

`v0.1.3`

## What is included

### Core foundation

- discord.js v14 bot runtime
- Railway Docker deployment
- PostgreSQL database connection through `pg`
- Health check server at `/health`
- Automatic database table initialization
- Slash command deployment on startup
- Permission Teams foundation
- Module enable/disable foundation
- Ephemeral command responses
- Styled embeds/buttons/select menus for setup panels

### Privileged gateway intents

This version enables:

- Presence intent
- Server Members intent
- Message Content intent

The Discord Developer Portal must have all three privileged gateway intents enabled for the bot application.

### New in v0.1.3

- Added privileged intents to the bot client.
- Added `STATUS` core module.
- Added `/status` command.
- Added saved bot presence/activity settings.
- Added startup presence restore.
- Added interactive setup center.
- Added interactive module manager.
- Added interactive logging center.
- Added interactive status buttons.
- Added styled embed response helpers.
- Added batched event logging listeners for:
  - Member joins
  - Member leaves
  - Message deletes
  - Message edits
  - Voice channel joins/leaves/moves

## Commands

### General

```text
/ping
/setup
```

### Status

```text
/status view
/status set
/status clear
```

Examples:

```text
/status set status:online activity_type:WATCHING text:the server
/status set status:idle activity_type:PLAYING text:with commands
/status clear
```

Supported statuses:

```text
online
idle
dnd
invisible
```

Supported activity types:

```text
PLAYING
WATCHING
LISTENING
COMPETING
STREAMING
NONE
```

### Modules

```text
/modules panel
/modules list
/modules enable
/modules disable
```

### Logging

```text
/logging panel
/logging set-channel
/logging mode
/logging test
/logging flush
```

### Permission Teams

```text
/team create
/team add-role
/team remove-role
/team allow
/team list
```

## Railway variables

Required:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_GUILD_ID=your_server_id
DATABASE_URL=railway_postgres_database_url
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=your_discord_user_id
NODE_ENV=production
```

Optional aliases:

```env
CLIENT_ID=your_discord_application_client_id
GUILD_ID=your_server_id
OWNER_IDS=your_discord_user_id
POSTGRES_URL=railway_postgres_database_url
```

Optional defaults:

```env
DEFAULT_TIMEZONE=America/New_York
LOG_BATCH_FLUSH_SECONDS=300
DEFAULT_BOT_STATUS=online
DEFAULT_BOT_ACTIVITY_TYPE=WATCHING
DEFAULT_BOT_ACTIVITY_TEXT=the server
# DEFAULT_BOT_ACTIVITY_URL=https://twitch.tv/yourchannel
WEB_HOST=0.0.0.0
PORT=3000
```

## Railway setup

The repo root should directly contain:

```text
package.json
Dockerfile
railway.json
src/
README.md
.env.example
```

Do not nest those files inside another folder inside the repo.

Railway should build using the included Dockerfile and start with:

```bash
npm start
```

## First run

After the bot is online, run:

```text
/setup log_channel:#your-log-channel
```

Then test:

```text
/ping
/status view
/logging panel
/modules panel
```

## Suggested next development phase

`v0.2.0` should add:

- Moderation actions
- User notes
- Case management
- Styled moderation embeds
- Confirmation buttons for dangerous actions
- Immediate moderation logs

