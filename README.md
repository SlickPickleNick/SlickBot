# SlickBot

SlickBot is an all-in-one Discord server management bot built with Discord.js and PostgreSQL.

## Current version

**v0.7.0**

## Join-to-Create Voice

Join-to-Create creates a temporary voice room when a member joins a configured creation channel. The room owner is moved automatically and receives a control guide in the voice channel's text chat.

Commands:

```text
/voice manager
/voice setup
/voice info
/voice rename
/voice limit
/voice lock
/voice unlock
/voice permit
/voice reject
/voice transfer
/voice claim
/voice cleanup
```

Temporary rooms are deleted automatically when empty. The module is disabled by default until configured.

## Required environment variables

```text
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_URL=
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=
DEFAULT_TIMEZONE=America/New_York
LOG_BATCH_FLUSH_SECONDS=300
NODE_ENV=production
```

## Deployment

```bash
npm install
npm run validate:commands
npm start
```

Railway runs `npm start` and checks `/health` after Discord is connected.
