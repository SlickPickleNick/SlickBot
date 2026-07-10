# SlickBot Project Plan

## Current Version: 0.6.0

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

## v0.6.0 Scope

- Fixed native reaction-role syncing so more than four options can be added reliably.
- Added retry/pacing and Discord’s 20-unique-reaction limit handling.
- Added `/mod untimeout` and `/mod unban`.
- Added the Leveling & XP module with automatic message XP, rank/leaderboard views, ignored channels/roles, level-up announcements, and level-role rewards.

## Future Modules

- Join-to-create voice channels
- Custom commands
- Utility tools
- Full onboarding wizard

## Design Direction

SlickBot should continue to use polished embeds, buttons, setup panels, guided message flows, and compact status indicators instead of plain text-only command output.
