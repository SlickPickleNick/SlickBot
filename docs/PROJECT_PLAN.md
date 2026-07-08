# SlickBot Project Plan

## Current Version: v0.1.3

SlickBot is a bot-only all-in-one Discord management system for the SlickPickleNick server. It is intentionally built for one server first, while preserving a database structure that can support selected external servers later.

## Current Foundation

- JavaScript runtime
- discord.js v14
- PostgreSQL through `pg`
- Railway Docker deployment
- Slash commands
- Permission Teams
- Module toggles
- Ephemeral/private responses
- Styled embeds/buttons/select menus
- Batched logging
- Bot presence/status controls

## Design Direction

SlickBot responses should feel like a dark creator command center: polished embeds, compact metadata, clear hierarchy, interactive controls, and fewer plain text lists.

## v0.1.3 Scope

### Added

- Privileged gateway intents:
  - Presence
  - Server Members
  - Message Content
- `STATUS` core module
- `/status view`
- `/status set`
- `/status clear`
- Saved status/activity settings
- Presence restore on bot startup
- Interactive setup panel
- Interactive module manager
- Interactive logging center
- Interactive status buttons
- Styled UI helper layer
- Event listeners for batched logging:
  - Member joins
  - Member leaves
  - Message deletes
  - Message edits
  - Voice state changes

## v0.2.0 Recommended Scope

### Moderation & Case Management

- `/warn`
- `/timeout`
- `/untimeout`
- `/kick`
- `/ban`
- `/unban`
- `/case view`
- `/case list`
- `/note add`
- `/note view`
- `/note delete`
- Confirmation buttons for dangerous actions
- Case IDs
- Moderator notes
- Immediate moderation audit logs

## v0.3.0 Recommended Scope

### Tickets, Reports, Applications, Appeals

- Advanced ticket system
- Ticket limits
- Claiming
- Priority
- Transcript `.txt` export
- Report system
- Application system
- Appeals system

## v0.4.0 Recommended Scope

### Community Systems

- Welcome messages
- Auto roles
- Reaction/button roles
- Giveaways
- Birthdays
- Scheduled messages

## v0.5.0 Recommended Scope

### Advanced Systems

- Leveling and XP
- Server stats
- Join-to-create voice
- Custom command creation

