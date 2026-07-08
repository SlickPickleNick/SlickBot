# SlickBot

## v0.3.1 Hotfix

This version fixes the Discord command registration error from v0.3.0 where `/appeal submit` had an optional option before a required option. Discord requires required slash-command options to appear before optional options.

This version also adds command payload validation before command deployment, so future option-order issues fail with a clear local validation message before Discord rejects the command list.


SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version uses the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, select menus, and modals.

## Version

`v0.3.1`

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

- Module-based logging setup
- Event-level overrides when needed
- Immediate log delivery by default for configured log modules
- Optional batched delivery by module or event
- Manual batch flushing
- Internal audit log table
- No fallback spam behavior

Important: Discord log messages are only posted when the related log module or event override has a configured channel. If the `message` log module is not configured, message edit/delete logs will not be sent.

### Log Modules

SlickBot organizes logs into these groups:

- `core` — system, setup, module config, permission teams, bot status
- `moderation` — moderation actions, cases, user notes
- `member` — joins, leaves, nickname changes, role changes, member updates
- `message` — message edits and deletions
- `voice` — voice joins, leaves, and moves
- `tickets` — ticket opens, claims, priority changes, closes, and transcripts
- `reports` — report submissions and staff review actions
- `applications` — application submissions and review actions
- `appeals` — appeal submissions and review actions
- `scheduled-messages` — future scheduled message activity

### Moderation, Cases, and User Notes

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

### Tickets

- `/ticket manager`
- `/ticket setup`
- `/ticket panel`
- `/ticket open`
- `/ticket claim`
- `/ticket priority`
- `/ticket close`

Tickets create private channels by default. Ticket close generates a `.txt` transcript and sends it to the configured ticket log channel when transcripts are enabled.

### Reports

- `/report manager`
- `/report setup`
- `/report panel`
- `/report user`
- `/report issue`

Reports can be submitted from slash commands or from a public report panel. Staff review cards include Resolve and Dismiss buttons.

### Applications

- `/application manager`
- `/application setup`
- `/application panel`
- `/application apply`

Applications support configurable application types, review channels, pending roles, approved roles, and optional auto-assignment on approval. Public application panels open a modal-based form.

### Appeals

- `/appeal manager`
- `/appeal setup`
- `/appeal panel`
- `/appeal submit`

Appeals can be submitted from slash commands or from a public appeal panel. Staff review cards include Approve and Deny buttons.

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

To enable the v0.3.1 support workflow logs:

```text
/logging set-channel module:tickets channel:#ticket-logs
/logging set-channel module:reports channel:#report-logs
/logging set-channel module:applications channel:#application-logs
/logging set-channel module:appeals channel:#appeal-logs
```

All configured log modules default to immediate delivery. To batch a module:

```text
/logging module-mode module:voice delivery:BATCHED interval_seconds:300
```

## Support Workflow Setup

Tickets:

```text
/ticket setup category:#tickets log_channel:#ticket-logs staff_role:@Moderators ticket_limit:1 transcripts:true
/ticket panel channel:#support type:Admin Support
```

Reports:

```text
/report setup review_channel:#staff-reports
/report panel channel:#support
```

Applications:

```text
/application setup type:Moderator review_channel:#mod-apps pending_role:@Applicant approved_role:@Trial-Mod auto_assign:true
/application panel type:Moderator channel:#apply
```

Appeals:

```text
/appeal setup review_channel:#appeals
/appeal panel channel:#support
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
/team allow team:Moderator Team action_key:tickets.claim
/team allow team:Moderator Team action_key:tickets.close
/team allow team:Moderator Team action_key:reports.review
/team allow team:Moderator Team action_key:applications.review
/team allow team:Moderator Team action_key:appeals.review
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
