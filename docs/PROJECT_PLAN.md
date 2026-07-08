# SlickBot Project Plan

## Current Version: v0.2.1

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
- Module-based log routing
- Event-level log overrides
- Batched logging support
- Bot presence/status controls
- Moderation cases
- Private staff user notes

## Design Direction

SlickBot responses should feel like a dark creator command center: polished embeds, compact metadata, clear hierarchy, interactive controls, and fewer plain text lists.

## v0.2.1 Scope

### Added / Updated

- Logging now uses module-style groups instead of requiring every event to be routed individually.
- Configured log modules default to immediate delivery.
- Event-specific overrides can still be configured when needed.
- Added `log_module_settings` database table.
- Existing event settings remain supported for backwards compatibility.
- Member logging now includes nickname changes and role changes.
- Voice logging now uses specific event keys for joins, leaves, and moves.
- Logging panel now summarizes modules and event overrides.

## Current Log Modules

- `core`
- `moderation`
- `member`
- `message`
- `voice`
- `tickets`
- `applications`
- `appeals`
- `scheduled-messages`

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
