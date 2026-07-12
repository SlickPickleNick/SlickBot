# SlickBot Project Plan

## Current Version: 0.8.8

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
- Bot update announcements
- Custom commands
- Join-to-create voice channels
- Leveling / XP

## v0.8.8 Scope

### Support Workflow Consistency Pass

- Reviewed the main ticket, report, application, and appeal review flows for consistency.
- Added required decision-reason modals for report resolve/dismiss controls, matching the reason-first review behavior used by applications and appeals.
- Updated report review embeds so they preserve original content, display decision reasons, keep review notes, and expose Add Details while the report is still open.
- Fixed the report Add Details modal PostgreSQL parameter typing issue reported from Railway logs.
- Updated ticket control embeds so closed tickets show closed status, close reason, closed-by metadata, and transcript status if the channel remains visible.
- Standardized support status labels/colors across review embeds: open/pending items use orange, approved/resolved items use green, denied items use red, and dismissed/closed items use muted styling.
- Added a backward-compatible `reports.decision_reason` migration.
- Added confirmed support-module reset commands for testing/rebuilding individual support modules: `/ticket reset`, `/report reset`, `/application reset`, and `/appeal reset`.
- Reset commands show a private confirmation prompt with affected record counts before clearing module data.
- Added configurable per-question application session timeouts through `/application setup`; the default is 3 minutes.
- Application question DMs now show a live Discord timestamp for the answer deadline.
- Expired active application sessions are cancelled automatically and the applicant is notified by DM.
- Report public panels now use a Discord user picker before the required details modal, reducing username/User ID typing for reporters.
- Report panel submissions now only require the incident details field. Target user/message context are optional, while `/report user` keeps the reported user required for slash-command reports.
- Added `/application close` and `/application reopen` so staff can pause/resume submissions for a type without deleting setup.
- Application public panels can now include all application types in one dropdown panel when posted without a specific type; closed types remain visible but respond with a not-accepting-submissions message.
- Added `/application review-index` for posting a refreshed review index that links to application review messages and supports Pending, Approved, Denied, and All filters.
- Removed deprecated `fetchReply` interaction response options to avoid Discord.js deprecation warnings.
- Application review index filter changes now silently refresh the index without an extra hidden confirmation message.
- Application review index titles now use `{application name} - Review Filter`, or `All Server Applications - Review Filters` for all-type indexes.
- Application review indexes are deleted and resent at the bottom of the review channel when new applications arrive, statuses change, or the index filter changes.
- No command groups were renamed.

Deferred larger work:

- Full setup wizard framework.
- Deeper support transcript parity for reports and appeals if desired later.
- Broader command alias/rename discussion.

## v0.8.7 Scope

### Permission and Interaction Audit

- Audited the primary component, modal, select-menu, message-trigger, and native reaction paths for permission consistency.
- Public panel actions now use their matching public action permission checks instead of only checking module enabled state.
- Custom command chat triggers now honor public action permissions and module target restrictions before responding.
- Native reaction-role panels now check the same public action/module access rules as button and dropdown role panels.
- Temporary voice owner controls continue to validate channel ownership/staff control, but now also honor the public temp-voice control action if admins restrict it.
- Standardized component access denial responses around `⛔ Access Restricted`.
- Removed duplicate permission-default entries discovered during the audit.
- No command groups were renamed.

Deferred larger work:

- Full support workflow consistency pass for tickets, reports, applications, and appeals.
- Full setup wizard framework.
- Broader command alias/rename discussion.

## v0.8.6 Scope

### Setup Panel Polish and Permission Visibility

- Removed batched/queued logging controls from the logging UI and slash command surface so configured logs are treated as instant delivery.
- Added status activity-type buttons and setup navigation to the bot status panel.
- Added a saved stream URL setting through `/status stream-url` so Streaming can be selected from the status panel button and fail gracefully if no URL is configured.
- Status Control now shows the saved stream URL, includes an Activity Text modal button, and highlights active saved status/activity selections in green while inactive options remain gray.
- Expanded Permission Teams and Permission Center views with role membership, direct users, team levels, selected-team inspection, explicit module grants, and explicit command grants.
- Standardized setup-accessed panel headers so group panels show a master category title and the current subgroup being viewed.
- Improved Moderation setup visibility so the module no longer appears as a generic shell. It now reports configured moderation commands, case tracking, user notes, moderation log setup, and recommended next commands.
- Removed submission/opening buttons from Support Center setup panels and standardized Support Center navigation button styling.
- Deferred full setup wizard creation until the setup/status panels are tested and stable.

## v0.8.5 Scope

### Setup and Module Manager Refinement

- Refined `/setup` to use the same module health model as `/bot test`.
- Added setup categories for Core Setup, Support Systems, Community Systems, Automation Systems, and Coming Soon modules.
- Added prioritized next actions to the setup dashboard so admins can quickly see what needs attention.
- Refined `/modules panel` with consistent Ready, Partially Configured, Needs Setup, Disabled, Warning, Error, and Coming Soon language.
- Added interactive module detail pages with each module's purpose, current setup status, recommended setup/review steps, focused panel command, primary setup command, and useful commands.
- Preserved all existing module command names and deferred the full setup wizard until after the setup/status foundation is stable.
- Treated Server Stats as ready when at least one counter is configured, because all counters are optional.
- Expanded the Community Center with Custom Commands and Join-to-Create Voice summaries and focused-panel buttons.

## v0.8.4 Scope

### Interactive Help and Bot Diagnostics

- Added `/help` as a polished interactive help center.
- The help menu shows enabled modules by default and includes a Disabled Modules view.
- Help content is filtered by the user's current SlickBot permission level and module access where possible.
- Module pages group visible commands into Member Commands, Staff Commands, and Owner / Admin Commands.
- Expanded `/bot test` output with clearer module health language and status icons.
- Updated diagnostic errors to use the Discord `:no_entry:`-style `⛔` icon.
- Added recommended fixes to `/bot test` when modules are missing setup, partially configured, or failing database/config checks.
- Deferred broader `/modules` and `/setup` redesign work to the next version as requested.

## v0.8.3 Scope

### Join-to-Create User Picker Controls

- Replaced the Permit User, Remove User, and Transfer Ownership control-panel typed-user modals with Discord user select menus.
- Members can now use Discord's native user picker/autocomplete behavior for user-based temporary voice controls.
- Preserved typed modals for rename, user limit, and delete confirmation.
- Kept slash-command owner controls available for users who prefer commands or staff who need direct command workflows.

## v0.8.2 Scope

### Join-to-Create Control Panel Polish

- Added lock/unlock emoji styling to the temporary voice control panel buttons.
- Updated the temporary voice status field to use `🔒 Locked` and `🔓 Unlocked` labels.
- Added modal-based button controls for rename, user limit, permit user, remove user, and transfer ownership.
- Changed Delete Channel from an instant button action to a confirmation modal requiring `DELETE`.
- Preserved slash-command owner controls while making the embedded panel usable for first-time members who are not comfortable with commands.

## v0.8.1 Scope

### Join-to-Create Control Panels

- Added automatic temporary voice channel control panels posted in the created voice channel chat.
- Control panels ping the temporary channel owner and provide quick buttons for Lock, Unlock, Claim, and Delete Channel.
- Control panels show owner, status, user limit, command help, and auto-cleanup details.
- Temporary voice control panels are refreshed after channel owner actions so the displayed status remains accurate.
- Added `control_message_id` and `control_message_error` tracking to `join_create_temp_channels`.
- Added graceful logging when a control panel cannot be posted because the voice channel chat is unavailable or SlickBot lacks permissions.


## v0.8.0 Scope

### Join-to-Create Voice

- Implemented the `JOIN_TO_CREATE` module.
- Added `/join-create` command group for hub setup, hub creation, list/view, enable/disable, delete, cleanup, and member owner controls.
- Added voice-state handling so joining a configured hub creates a tracked temporary voice channel and moves the member into it.
- Added temporary voice owner controls for rename, user limit, lock, unlock, permit, remove, transfer, and claim.
- Added automatic cleanup for empty temporary channels using the configured deletion delay.
- Added startup repair to mark missing tracked channels deleted and schedule cleanup for empty temporary channels after restarts.
- Added `join_create_hubs` and `join_create_temp_channels` persistence tables.
- Added Join-to-Create permission actions, public owner-control defaults, module default permission level, logging events, diagnostics, module-manager status, and release notes.

## v0.7.0 Scope

### Custom Commands

- Implemented the `CUSTOM_COMMANDS` module.
- Added `/custom-command` command group for staff-managed command creation, editing, deletion, listing, viewing, enabling, disabling, testing, and prefix configuration.
- Added text-channel trigger handling so members can run commands such as `!rules`.
- Added optional embed mode when creating or editing a command. Embed responses support optional title and color settings.
- Added per-command cooldowns and optional allowed-channel and allowed-role restrictions.
- Added persistent custom command configuration, command storage, and usage tracking tables.
- Added Custom Commands permission actions, public usage defaults, module default permission level, logging events, diagnostics, module-manager status, and release notes.

## v0.6.7 Scope

### Server Stats Voice Counter Flow

- Split voice-state server stat updates from the general full-refresh debounce queue.
- Voice joins, leaves, and moves now queue a near-immediate voice-counter-only refresh.
- A separate short verification pass follows voice changes to check the wider configured server-stat counters without delaying the voice count.
- Restored the periodic server stats fallback interval to 15 minutes.
- Improved voice count calculation by comparing the guild voice-state cache and voice-channel member cache.

## v0.6.6 Scope

### Bot Updates

- Implemented the `BOT_UPDATES` module.
- Added `/bot-updates` command group for setup, channel selection, optional role pings, previewing, manual sending, and enabling/disabling update announcements.
- Added per-guild bot update configuration, ping-role tracking, and per-version announcement tracking.
- Added startup announcement logic that avoids duplicate release posts after Railway restarts.
- Added Bot Updates permission actions, module default permission level, module registry entry, logging events, diagnostics, and module-manager status logic.

### Server Stats Reliability

- Reworked server stats updates to support debounced event-triggered refreshes.
- Reduced unnecessary member fetches during voice-state updates so voice counts use the voice channel cache instead of waiting on full guild member refreshes.
- Added explicit server stats failure reporting and stored last refresh error text.
- Temporarily increased periodic refresh cadence from 15 minutes to 5 minutes in v0.6.6; v0.6.7 restored the interval to 15 minutes and made voice events responsible for prompt voice-counter updates.

## v0.6.5 Scope

- Updated application review messages so approval/denial preserves the original application details instead of replacing them with a generic reviewed message.
- Application review embeds now use status colors: pending review is orange, approved is green, and denied is red.
- Application approval and denial now open a required decision-reason modal before the status is applied.
- Added an application review-thread button that opens a per-application staff thread named from the applicant and application name.
- Application review threads automatically lock and archive after approval or denial is submitted.
- Application approval/denial now generates a TXT transcript and attaches it to the updated review message.
- Application review embeds now show the approval/denial reason and remove review buttons after a final decision.

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

- Utility tools
- Full onboarding wizard

## Design Direction

SlickBot should continue to use polished embeds, buttons, setup panels, guided message flows, and compact status indicators instead of plain text-only command output.
