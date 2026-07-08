# Project Plan

## Product direction

SlickBot is a single-server all-in-one Discord management bot that can eventually become a selected-server/public bot.

The first version is bot-only. No dashboard is included yet.

## Core design rules

- Use slash commands, buttons, modals, and embeds where possible.
- Use ephemeral responses for setup, permissions, moderation lookups, and private controls.
- Use Permission Teams for all command/module permissions.
- Keep every module independently configurable.
- Store server data in the database, not JSON files.
- Use batched logs for noisy events.
- Use immediate logs for critical moderation/security events.

## Included foundation modules

- Permissions
- Logging
- Module Registry

## Future modules

- Moderation
- Case Management
- User Notes
- Advanced Tickets
- Ticket Transcripts
- Reports
- Applications
- Appeals
- Welcome and Auto Roles
- Reaction/Button Roles
- Server Stats
- Leveling/XP
- Giveaways
- Birthdays
- Scheduled Messages
- Join-to-Create Voice
- Custom Commands
- Utility Tools

## Permission Team examples

- Bot Owners
- Admin Team
- Moderator Team
- Senior Moderators
- Ticket Staff
- Application Reviewers
- Giveaway Managers
- Voice Managers
- Command Managers

## Sample action keys

```text
permissions.manage
modules.manage
logging.configure
moderation.warn
moderation.timeout
moderation.ban
moderation.massBan
cases.view
cases.edit
notes.view
notes.create
tickets.claim
tickets.close
applications.review
applications.approve
appeals.review
appeals.approve
giveaways.create
giveaways.reroll
scheduledMessages.create
customCommands.create
```
