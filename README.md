# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version keeps the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, select menus, and modals.

## Version

`v0.3.3`

## v0.3.3 Support Workflow Expansion

This update expands the support workflow modules without changing the working Railway deployment foundation from v0.3.2.

### Added / Improved

- DM-based applications with custom questions
- Application questions are sent one at a time in DM
- Application responses are recorded and submitted after the final answer
- Ticket types with separate panel buttons
- Custom ticket questions per ticket type
- Ticket naming formats, such as `ticket-{username}-{number}` or `{type}-{username}-{number}`
- Ticket escalation to a configured role or Permission Team
- Ticket control embed now includes a Close With Reason button
- Report claiming
- Report Add Details button
- Report Open Ticket button for staff follow-up
- Report setup can ping a role and/or Permission Team when a report is submitted
- Appeal setup can enable DM decision notices
- Appeal decision buttons now support optional decision reasons

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

Discord log messages are only posted when the related log module or event override has a configured channel.

### Log Modules

- `core` — system, setup, module config, permission teams, bot status
- `moderation` — moderation actions, cases, user notes
- `member` — joins, leaves, nickname changes, role changes, member updates
- `message` — message edits and deletions
- `voice` — voice joins, leaves, and moves
- `tickets` — ticket opens, claims, priority changes, escalations, closes, and transcripts
- `reports` — report submissions, claims, notes, and decisions
- `applications` — DM application starts, submissions, and review actions
- `appeals` — appeal submissions and review actions
- `scheduled-messages` — future scheduled message activity

## Support Workflow Setup

### Tickets

Default settings:

```text
/ticket setup category:#tickets log_channel:#ticket-logs staff_role:@Moderators ticket_limit:1 transcripts:true naming_format:ticket-{username}-{number}
```

Create ticket types:

```text
/ticket type-setup name:Admin Support label:Admin Support staff_role:@Moderators escalated_role:@Senior-Mods naming_format:admin-{username}-{number}
/ticket type-setup name:Giveaway Claim label:Giveaway Claim staff_role:@Giveaway-Team naming_format:claim-{username}-{number}
```

Add ticket questions:

```text
/ticket question-add type:Admin Support question:What do you need help with? required:true
/ticket question-add type:Giveaway Claim question:Which giveaway did you win? required:true
```

Post a panel with ticket-type buttons:

```text
/ticket panel channel:#support
```

Inside a ticket, staff can use:

```text
/ticket claim
/ticket escalate reason:Needs senior review
/ticket close reason:Issue resolved
```

The ticket embed also includes interactive buttons for Claim, Escalate, and Close With Reason.

### Reports

Setup:

```text
/report setup review_channel:#staff-reports ping_role:@Moderators
/report setup review_channel:#staff-reports ping_team:Moderator Team
/report panel channel:#support
```

Reports now support:

- Claim
- Resolve
- Dismiss
- Add Details
- Open Ticket

Claiming changes the report status to `CLAIMED`, but the report remains open until resolved or dismissed.

### Applications

Setup:

```text
/application setup type:Moderator review_channel:#mod-apps pending_role:@Applicant approved_role:@Trial-Mod auto_assign:true
```

Add custom DM questions:

```text
/application question-add type:Moderator question:Why do you want to become a moderator? required:true order:1
/application question-add type:Moderator question:What moderation experience do you have? required:true order:2
/application question-add type:Moderator question:What is your weekly availability? required:false order:3
/application question-list type:Moderator
```

Post the application panel:

```text
/application panel type:Moderator channel:#apply
```

Users can also start from command:

```text
/application apply type:Moderator
```

SlickBot will DM the user each question one at a time, record each reply, and submit the completed application to the review channel.

### Appeals

Setup:

```text
/appeal setup review_channel:#appeals dm_decision:true
/appeal panel channel:#support
```

Appeal reviewers can approve or deny immediately, or use the `Approve + Reason` and `Deny + Reason` buttons to include an optional decision reason. If `dm_decision` is enabled, SlickBot DMs the user with the decision.

## First Setup Commands

After deploying, run:

```text
/setup log_channel:#staff-logs
/modules panel
/logging panel
/mod panel
/status view
```

To enable support workflow logs:

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

## Railway Install Path

This package keeps the v0.3.2 Railway install fix: Docker uses `npm ci --omit=dev` with the committed lockfile and `.npmrc` forces the public npm registry.
