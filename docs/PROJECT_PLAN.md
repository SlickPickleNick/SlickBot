# SlickBot Project Plan

## Current Version: 0.6.4

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

## v0.6.4 Scope

- Expanded `/bot test` so it checks all implemented modules for database/table readiness and reports module-specific errors.
- Fixed DM-based applications by adding the missing follow-up question and submit/cancel confirmation payloads.
- Removed automatic application starter questions and removed the built-in default Moderator application behavior.
- Added migration cleanup for the legacy auto-created Moderator application template when it still has the original default description.
- Updated applications so user-created application types require staff-created questions before users can apply.
- Added `/appeal edit` for changing appeal settings without rerunning the full setup command.
- Updated appeal review messages to change color, show reviewer/decision details, remove buttons after review, and refresh in the review channel.
- Fixed appeal decision DMs so `dm_include_submission` includes the original appeal submission.
- Updated report review messages so resolved/dismissed reports preserve prior details, change color, remove buttons, and show follow-up ticket metadata when a ticket is opened.

## v0.6.3 Scope

- Fixed server stats commands by deferring private responses before slower count/rename operations.
- Added `/ticket remove-user` to remove users who were added to a ticket with `/ticket add-user`.
- Added ticket participant tracking for users added/removed from tickets.
- Stored the ticket control message ID so the original ticket embed can update in place.
- Updated ticket control embeds when tickets are claimed, escalated, prioritized, or when users are added/removed.
- Simplified the ticket control embed by removing escalation configuration status and generic staff instruction text.
- Restricted ticket control buttons and related ticket management commands to assigned ticket staff/escalation roles, with administrator/server-owner bypass.
- Added `/bot version` for deployment/version verification.
- Added `/bot test` for safe module and configuration diagnostics.

## v0.6.2 Scope

- Fixed ticket creation so new tickets grant access only to the opener and configured non-escalated support role/team.
- Fixed ticket escalation so configured non-escalated reviewer roles/teams are removed before escalated roles/teams are granted.
- Added `/ticket add-user` to grant a selected user access to the current ticket channel.
- Expanded `/ticket setup` with default non-escalated support team and escalated role/team settings.
- Moved the public leveling information panel from `/levels info` to `/level info`.
- Refreshed the leveling info panel for member-facing readability and sorted multiplier roles from smallest to largest multiplier.
- Added optional header image/media URL support for public panel systems.

## v0.6.1 Scope

- Fixed role bundles so they no longer overwrite a standalone option that uses the bundle’s first role.
- Added XP multiplier roles with configurable multiplier values.
- Added configurable level-up announcement behavior for all levels or reward levels only.
- Added XP curve analysis with CSV export for every selected level.
- Added the public `/level info` panel explaining the server leveling system.

## Future Modules

- Join-to-create voice channels
- Custom commands
- Utility tools
- Full onboarding wizard

## Design Direction

SlickBot should continue to use polished embeds, buttons, setup panels, guided message flows, and compact status indicators instead of plain text-only command output.
