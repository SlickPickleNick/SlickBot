# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version uses the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, and select menus.

## Version

`v0.2.0`

## Included Modules

### Core

- Discord.js bot startup
- Railway Docker deployment
- Railway health endpoint at `/health`
- PostgreSQL database initialization on startup
- Slash command deployment
- Privileged gateway intents supported:
  - Presence
  - Server Members
  - Message Content
- Ephemeral/private command responses
- Interactive setup panels
- Permission Teams
- Module manager
- Bot status/activity controls

### Logging

- Event-specific logging channels
- Immediate log delivery
- Batched log delivery
- Manual batch flushing
- Internal audit log table
- No fallback spam behavior

Important: Discord log messages are only posted when that specific event has a configured channel. If `message-delete` does not have a channel configured, message delete logs will not be sent. The internal audit log still stores important bot actions where applicable.

### Moderation, Cases, and User Notes

New in `v0.2.0`:

- `/mod panel`
- `/mod warn`
- `/mod timeout`
- `/mod kick`
- `/mod ban`
- `/mod massban`
- `/case panel`
- `/case view`
- `/case user`
- `/case close`
- `/case reopen`
- `/note add`
- `/note list`
- `/note remove`

Moderation actions create case records automatically. User notes are private staff records and are only shown through ephemeral command responses.

## Railway Variables

Required:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_URL=
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=
NODE_ENV=production
```

Optional:

```env
DEFAULT_TIMEZONE=America/New_York
DEFAULT_BOT_STATUS=online
DEFAULT_BOT_ACTIVITY_TYPE=WATCHING
DEFAULT_BOT_ACTIVITY_TEXT=the server
DEFAULT_BOT_ACTIVITY_URL=
LOG_BATCH_FLUSH_SECONDS=300
```

TitanBot-style aliases are also supported:

```env
CLIENT_ID=
GUILD_ID=
OWNER_IDS=
POSTGRES_URL=
```

## First Setup Commands

After deploying, run:

```text
/setup log_channel:#staff-logs
/modules panel
/logging panel
/mod panel
/status view
```

When you use `/setup log_channel`, SlickBot configures the selected channel for core/admin event logs only:

- `system`
- `setup`
- `module-config`
- `permission-team`
- `status`
- `moderation`
- `cases`
- `user-notes`

No noisy event logs are routed by default. To route message, member, or voice logs, use:

```text
/logging set-channel event:message-delete channel:#message-logs
/logging set-channel event:voice channel:#voice-logs
/logging mode event:voice delivery:BATCHED interval_seconds:300
```

## Available Log Events

- `system`
- `setup`
- `module-config`
- `permission-team`
- `status`
- `moderation`
- `cases`
- `user-notes`
- `member-join`
- `member-leave`
- `message-delete`
- `message-edit`
- `voice`
- `tickets`
- `applications`
- `appeals`
- `scheduled-messages`

## Permission Teams

The Bot Owners team gets all current action keys during setup. Other teams can be configured with:

```text
/team create
/team add-role
/team allow
```

Example:

```text
/team create name:Moderator Team description:MODS and SENIOR MODS
/team add-role team:Moderator Team role:@MODS
/team add-role team:Moderator Team role:@SENIOR MODS
/team allow team:Moderator Team action_key:moderation.warn
/team allow team:Moderator Team action_key:moderation.timeout
/team allow team:Moderator Team action_key:cases.view
/team allow team:Moderator Team action_key:user-notes.view
```

## New Permission Action Keys

Moderation:

```text
moderation.panel
moderation.warn
moderation.timeout
moderation.kick
moderation.ban
moderation.massban
```

Cases:

```text
cases.view
cases.manage
```

User notes:

```text
user-notes.view
user-notes.manage
```

## Deployment Notes

The repo root should directly contain:

```text
package.json
Dockerfile
railway.json
src/
README.md
.env.example
```

It should not be nested inside another `slickbot/` folder.

Railway should build using the included Dockerfile and start with:

```text
npm start
```

The app exposes a health endpoint using Railway's `PORT` variable.
