# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version uses the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, and select menus.

## Version

`v0.2.1`

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

Updated in `v0.2.1`:

- Module-based logging setup
- Event-level overrides when needed
- Immediate log delivery by default for configured log modules
- Optional batched delivery by module or event
- Manual batch flushing
- Internal audit log table
- No fallback spam behavior

Important: Discord log messages are only posted when the related log module or event override has a configured channel. If the `message` log module is not configured, message edit/delete logs will not be sent.

### Log Modules

SlickBot now organizes logs into these groups:

- `core` — system, setup, module config, permission teams, bot status
- `moderation` — moderation actions, cases, user notes
- `member` — joins, leaves, nickname changes, role changes, member updates
- `message` — message edits and deletions
- `voice` — voice joins, leaves, and moves
- `tickets` — future ticket activity
- `applications` — future application activity
- `appeals` — future appeal activity
- `scheduled-messages` — future scheduled message activity

### Moderation, Cases, and User Notes

Included from `v0.2.0`:

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

When you use `/setup log_channel`, SlickBot configures the selected channel for these starter log modules:

- `core`
- `moderation`

No noisy member, message, or voice logs are routed by default. To enable those groups, use:

```text
/logging set-channel module:member channel:#member-logs
/logging set-channel module:message channel:#message-logs
/logging set-channel module:voice channel:#voice-logs
```

All configured log modules default to immediate delivery. To batch a module:

```text
/logging module-mode module:voice delivery:BATCHED interval_seconds:300
```

To override one event inside a module:

```text
/logging event-mode event:message-edit delivery:BATCHED interval_seconds:300
/logging event-channel event:member-roles channel:#role-logs
```

To remove an event override and return it to the parent module behavior:

```text
/logging clear-event event:member-roles
```

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

## Permission Action Keys

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
