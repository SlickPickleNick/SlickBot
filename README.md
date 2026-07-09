# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version keeps the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, select menus, and modals.

## Version

`v0.3.6`

## v0.3.6 Default Permission Seeding

This update keeps the stable v0.3.5 support workflow foundation and adds a complete default permission seed system for all current commands, modules, and public actions.

### Added / Improved

- Added built-in default permission levels for every current command/action key.
- Added built-in default permission levels for every current module.
- Added default public action seeding for basic user-facing actions.
- Added one-time automatic permission default migration for existing servers.
- Added `/permissions apply-defaults` to intentionally reapply SlickBot's built-in permission map.
- Updated support workflow commands so manager panels, public panels, public submissions, and staff actions use distinct permission keys.
- Updated module lock behavior so module-level team/role locks are checked before command-level permission access.
- Kept all v0.3.5 additions: reset, template deletion, colored module statuses, support workflows, and owner-only high-risk controls.

## Default Permission Levels

SlickBot now seeds the following access model automatically.

| Level | Intended Use |
|---|---|
| `EVERYONE` | Basic public commands, such as opening tickets, submitting reports, applying, submitting appeals, and `/ping`. |
| `MODERATOR` | Active staff tools, such as viewing panels, claiming/closing tickets, reviewing reports, viewing cases, adding notes, and basic moderation. |
| `SENIOR_MODERATOR` | Bot configuration tools, such as setup, module configuration, logging configuration, support-system setup, application/appeal approvals, and posting public panels. |
| `OWNER` | Highest-risk controls, such as permission management, permission team management, mass bans, and server reset. |

The Discord server owner always has owner-level access. Discord administrators are treated as owner-level for normal permission checks, but `/reset` still requires the actual Discord server owner.

### Public actions seeded by default

```text
bot.ping
tickets.open
reports.submit
applications.apply
appeals.submit
```

### Permission defaults command

Use this after upgrading if you want to force the built-in defaults back into the database:

```text
/permissions apply-defaults
```

This reapplies:

```text
Command/action default levels
Module default levels
Public action defaults
```

## Permission Configuration

Role/team level mapping:

```text
/permissions role-level role:@Mods level:MODERATOR
/permissions role-level role:@Senior-Mods level:SENIOR_MODERATOR
/permissions team-level team:Moderator Team level:MODERATOR
```

Command/module level overrides:

```text
/permissions command-level action_key:tickets.close level:MODERATOR
/permissions module-level module:APPLICATIONS level:EVERYONE
```

Direct team/role allow controls:

```text
/permissions module-allow-team module:MODERATION team:Moderator Team
/permissions module-allow-role module:TICKETS role:@Support Team
/permissions command-allow-team action_key:tickets.close team:Senior Mods
/permissions command-allow-role action_key:reports.resolve role:@Moderators
```

Public command toggle:

```text
/permissions command-public action_key:reports.submit enabled:true
/permissions command-public action_key:reports.submit enabled:false
```

Ignored users:

```text
/permissions ignore-add user:@ExampleUser reason:Abusing bot interactions
/permissions ignore-remove user:@ExampleUser
/permissions ignore-list
```

Ignored users cannot use commands, buttons, select menus, modals, or DM application controls.

## Current Command Permission Highlights

### Everyone

```text
/ping
/ticket open
/report user
/report issue
/application apply
/appeal submit
```

### Moderator

```text
/mod panel
/mod warn
/mod timeout
/case view
/case user
/note add
/note list
/ticket manager
/ticket claim
/ticket close
/ticket priority
/ticket escalate
/report manager
/report claim/resolve/dismiss controls
/application manager
/application review controls
/appeal manager
/appeal review controls
/logging panel
/status view
```

### Senior Moderator

```text
/setup
/modules enable/disable
/logging configuration
/status set/clear
/ticket setup/type/question/panel commands
/report setup/panel commands
/application setup/question/panel/delete commands
/appeal setup/panel commands
/application approve/deny controls
/appeal approve/deny controls
/permissions ignore-add/remove/list
```

### Owner

```text
/team create/add-role/remove-role/delete/allow/list
/permissions manage commands
/mod massban
/reset
```

## Template Deletion

Delete ticket types:

```text
/ticket type-delete type:Admin Support confirm:true
```

Ticket types with open tickets cannot be deleted until those tickets are closed.

Delete application types:

```text
/application delete type:Moderator confirm:true
```

This deletes the application type and related application questions/submissions.

Delete non-system permission teams:

```text
/team delete name:Event Team confirm:true
```

System teams, such as Bot Owners, cannot be deleted.

## Fresh Install Reset

Server owner only:

```text
/reset
```

SlickBot will show a confirmation panel before deleting data. Confirming the reset deletes SlickBot data/configuration for the server and recreates fresh default setup records, including the built-in permission defaults.

## Module Status Indicators

`/modules panel` uses:

```text
🟢 Fully enabled
🟠 Partially enabled
🟣 Needs configuration
🔴 Disabled
```

Support modules show 🟣 when enabled but missing required setup, such as review channels, ticket category, or application review configuration.

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
- Permission levels
- Default permission seeding
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

## Support Workflow Setup

### Tickets

Default settings with customizable public panel:

```text
/ticket setup category:#tickets log_channel:#ticket-logs staff_role:@Moderators ticket_limit:1 transcripts:true naming_format:ticket-{username}-{number} delete_seconds:10 panel_title:Need Help? panel_description:Choose a ticket type below. panel_color:#7869ff
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

The ticket embed also includes buttons for Claim, Escalate, and Close With Reason.

### Reports

Setup with public panel customization:

```text
/report setup review_channel:#staff-reports ping_role:@Moderators panel_title:Submit a Report panel_description:Privately report a concern to staff. panel_color:#f2b84b
/report setup review_channel:#staff-reports ping_team:Moderator Team
/report panel channel:#support
```

Reports support:

- Claim
- Resolve
- Dismiss
- Open Ticket

Claiming changes the report status to `CLAIMED`, but the report remains open until resolved or dismissed.

### Applications

Setup with custom DM confirmation and public panel customization:

```text
/application setup type:Moderator review_channel:#mod-apps pending_role:@Applicant approved_role:@Trial-Mod auto_assign:true confirmation_message:Your {type} application was submitted as #{number}. panel_title:Moderator Applications panel_description:Start your application through DM. panel_color:#7869ff
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

SlickBot DMs each question one at a time. Every question includes a Cancel Application button. After the final answer, SlickBot sends a Submit / Cancel confirmation panel before the application is sent to staff.

### Appeals

Setup with optional decision DMs and public panel customization:

```text
/appeal setup review_channel:#appeals dm_decision:true dm_include_submission:true panel_title:Submit an Appeal panel_description:Request staff review of a decision. panel_color:#5aa7ff
/appeal panel channel:#support
```

Appeal reviewers see Approve and Deny buttons. Both open a modal where the reviewer can add optional decision details before submitting the decision.

## First Setup Commands

After deploying, run:

```text
/setup log_channel:#staff-logs
/permissions apply-defaults
/modules panel
/permissions panel
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
LOG_BATCH_FLUSH_SECONDS=300
DEFAULT_BOT_STATUS=online
DEFAULT_BOT_ACTIVITY_TYPE=WATCHING
DEFAULT_BOT_ACTIVITY_TEXT=the server
DEFAULT_BOT_ACTIVITY_URL=
```

## Railway Notes

The repository root should directly contain:

```text
package.json
Dockerfile
railway.json
src/
README.md
.env.example
```

Do not upload the files inside an extra nested folder.
