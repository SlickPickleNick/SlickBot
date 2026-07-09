# SlickBot Project Plan

## Current Version: 0.5.4

SlickBot is being built as a modular all-in-one Discord server management bot for the SlickPickleNick community.

## Implemented Modules

- Core setup
- Permissions and Permission Teams
- Module manager
- Module-based logging
- Bot presence/status controls
- Moderation
- Case management
- User notes
- Tickets
- Reports
- Applications
- Appeals
- Welcome messages
- Auto roles
- Reaction/button roles
- Guided panel builder
- Live-updating posted panels
- Giveaways
- Birthdays
- Scheduled messages
- Server stats

## v0.5.4 Scope

- Fixed reaction-role `/panel edit` live updates by exporting the role panel ID lookup used during refresh.
- Added `/panel delete` for deleting/unposting tracked panel messages by target/name.
- Updated `/panel setup` to create missing named role/application panels when needed.
- Fixed the birthday **Enter Day** button/modal interaction failure.
- Added Server Stats module with member, human, bot, and voice counter channel support.

## Future Modules

- Leveling / XP
- Join-to-create voice channels
- Custom commands
- Utility tools
- Full onboarding wizard

## Design Direction

SlickBot should continue to use polished embeds, buttons, setup panels, guided message flows, and compact status indicators instead of plain text-only command output.
