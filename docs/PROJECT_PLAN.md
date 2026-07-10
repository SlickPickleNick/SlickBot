# SlickBot Project Plan

## Current Version: 0.6.1

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
- Leveling / XP

## v0.6.1 Scope

- Fixed role bundles so they no longer overwrite a standalone option that uses the bundle’s first role.
- Added XP multiplier roles with configurable multiplier values.
- Added configurable level-up announcement behavior for all levels or reward levels only.
- Added XP curve analysis with CSV export for every selected level.
- Added the public `/levels info` panel explaining the server leveling system.

## Future Modules

- Join-to-create voice channels
- Custom commands
- Utility tools
- Full onboarding wizard

## Design Direction

SlickBot should continue to use polished embeds, buttons, setup panels, guided message flows, and compact status indicators instead of plain text-only command output.
