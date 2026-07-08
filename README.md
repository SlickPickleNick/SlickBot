# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version keeps the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, select menus, and modals.

## Version

`v0.3.4`

## v0.3.4 Support Workflow Polish + Permission Controls

This update keeps the stable v0.3.3 support workflow foundation and focuses on fixes, permissions, customization, and quality-of-life improvements.

### Added / Improved

- New `/permissions` command group.
- Module-level command permission rules by Permission Team or Discord role.
- Command/action-level permission rules by Permission Team or Discord role.
- Public command/action toggles for commands that should be available to all non-ignored users.
- Ignored users list. Ignored users cannot interact with SlickBot commands, buttons, selects, modals, or DM application controls.
- Permission Center panel available from `/permissions panel` and the main setup panel.
- Ticket close flow now sends a countdown and auto-deletes the ticket channel after transcript success.
- Ticket close delete delay can be configured with `/ticket setup delete_seconds`.
- Ticket escalation pings the escalated role/team in the ticket channel.
- Report Add Details now updates the stored report and refreshes the staff review message when possible.
- Report follow-up tickets now use the report review role/team instead of default ticket staff routing.
- Application DM flow now includes a Cancel Application button on each question.
- Applications now show a final Submit / Cancel confirmation panel before staff receive the submission.
- Application submission confirmation DM message can be customized.
- Appeal decision DMs can optionally include the original appeal submission.
- Appeal review buttons are simplified to Approve and Deny. Both open a modal where decision details are optional.
- Public panel title, description, and accent color can be configured for tickets, reports, applications, and appeals.

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

### Permissions

Main commands:

```text
/permissions panel
/permissions module-allow-team
/permissions module-allow-role
/permissions command-allow-team
/permissions command-allow-role
/permissions command-public
/permissions ignore-add
/permissions ignore-remove
/permissions ignore-list
```

Recommended examples:

```text
/permissions module-allow-team module:MODERATION team:Moderator Team
/permissions module-allow-role module:TICKETS role:@Support Team
/permissions command-allow-team action_key:tickets.close team:Senior Mods
/permissions command-public action_key:bot.ping enabled:true
/permissions ignore-add user:@ExampleUser reason:Abusing bot interactions
```

Permission order:

1. Ignored users are blocked.
2. Bot owners bypass permission checks.
3. Disabled modules block access.
4. Public command/action settings are allowed for all non-ignored users.
5. Discord administrators are allowed.
6. Module-level team/role rules are checked.
7. Action-level team/role rules are checked.

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
- Add Details
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
