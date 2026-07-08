# SlickBot Project Plan

## Current Version: v0.2.0

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
- Event-specific log routing
- Batched logging
- Bot presence/status controls
- Moderation cases
- Private staff user notes

## Design Direction

SlickBot responses should feel like a dark creator command center: polished embeds, compact metadata, clear hierarchy, interactive controls, and fewer plain text lists.

## v0.2.0 Scope

### Added

- Event-specific log channel routing
- Silent behavior when no event-specific log channel is configured
- Starter log routing through `/setup log_channel`
- Moderation module enabled for new setups
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
- Moderation case database table
- User note database table
- Moderation center interactive panel
- Recent cases interactive panel

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
