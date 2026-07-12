# SlickBot

SlickBot is an all-in-one Discord server management bot built for the SlickPickleNick server. It uses a TitanBot-style JavaScript foundation with Discord.js, PostgreSQL, Railway deployment support, modular command permissions, polished embeds, interactive setup panels, support workflows, community systems, giveaways, birthdays, and scheduled messages.

## Version

Current package: **v0.8.8**

## v0.8.8 Updates

### Support Workflow Consistency Pass

- Standardized support workflow status displays for tickets, reports, applications, and appeals.
- Report **Resolve** and **Dismiss** controls now open a required decision-reason popup before the report is finalized.
- Report review embeds now preserve the original report content, show decision reason, keep review notes, and include an **Add Details** button while the report is still open.
- Ticket control embeds now show explicit ticket status, opened/closed metadata, close reason, and transcript status when a closed ticket remains visible.
- Application and appeal review embeds now use consistent pending/approved/denied status labels and colors.
- Appeal denials now use red/error styling instead of warning/orange styling in both review embeds and decision DMs.
- Added a backward-compatible `reports.decision_reason` database field.

Updated systems:

```text
Tickets
Reports
Applications
Appeals
Support review controls
```

## v0.8.7 Updates

### Permission and Interaction Audit

- Tightened public-panel submission controls so ticket, report, application, appeal, birthday, giveaway, role-panel, and temp-voice interactions now honor their matching public action permission instead of only checking whether the module is enabled.
- Custom command chat triggers now use SlickBot public action and module-target checks before responding, so disabling or restricting custom-command usage applies to chat triggers too.
- Native reaction-role add/remove handling now checks public action and module-target access before applying roles. Unauthorized reaction adds are removed when possible.
- Standardized private component denial embeds with a clear `⛔ Access Restricted` style.
- Preserved public member actions by default while allowing admins to restrict them through existing permission/public-action controls.
- Removed duplicated permission/default-level checks found during the audit.

Updated systems:

```text
Ticket/report/application/appeal public panels
Birthday setup panel
Role panels and native reaction roles
Giveaway entry buttons
Custom command chat triggers
Join-to-Create temp voice owner controls
Permission defaults
```

## v0.8.6 Updates

### Setup Panel Polish and Permission Visibility

- Removed queued/batched logging controls from the logging command and setup panel. Configured SlickBot logs now use instant delivery in the active UI and runtime path.
- Added activity-type quick buttons to the Status Control panel for Playing, Watching, Listening, Competing, and Streaming.
- Added `/status stream-url` so the Streaming button can use a saved stream URL.
- If the Streaming button is pressed without a saved stream URL, SlickBot now shows a private setup error instead of failing silently.
- Status Control now displays the saved stream URL, includes an Activity Text modal button, and highlights the active status/activity selection in green while inactive options stay gray.
- Added a Back to Setup button to the Status Control panel.
- Expanded Permission Teams to show attached Discord roles, direct users, system-team state, and mapped permission level.
- Expanded the Permission Center with a permission-team selector, selected-team role/user membership, explicit command grants, module grants, public actions, and access model guidance.
- Standardized setup-accessed panel headers with a master category title and a clear Viewing label for the current subgroup.
- Improved the Moderation module status and Moderation Center so it shows configured systems, missing moderation logging setup, case counts, active notes, and setup recommendations.
- Removed ticket/report/application/appeal submission buttons from Support Center setup panels so those pages remain staff-control only.
- Standardized the Support Center Tickets navigation button color with the other support navigation buttons.

Updated commands:

```text
/setup
/logging panel
/status view
/status stream-url
/permissions panel
/team list
/mod panel
```

## v0.8.5 Updates

### Setup and Module Manager Refinement

- Refined `/setup` into a practical setup dashboard with shared module health counts, setup categories, and prioritized next actions.
- Refined `/modules panel` with consistent status language matching `/bot test`: Ready, Partially Configured, Needs Setup, Disabled, Warning, Error, and Coming Soon.
- Added module detail pages from the module manager so admins can review each module's purpose, current setup state, recommended setup steps, and useful commands.
- Kept existing command names and did not add the full setup wizard yet, preserving current workflows while preparing for a future guided setup pass.
- Server Stats now treats any configured counter as ready because servers can intentionally configure only one or two counters.
- Expanded the Community Center to include Custom Commands and Join-to-Create Voice summaries and direct buttons.

Updated commands:

```text
/setup
/modules panel
```

## v0.8.4 Updates

### Interactive Help and Diagnostics Polish

- Added `/help` as a permission-aware interactive help center.
- Help opens with enabled modules by default and includes a Disabled Modules view for admins who want to inspect hidden module command groups.
- Help pages filter command/control items by the user's current SlickBot permission level and module access where possible.
- Module help pages are grouped into Member Commands, Staff Commands, and Owner / Admin Commands when those sections are visible to the user.
- Improved `/bot test` with clearer module health states: Ready, Partially Configured, Needs Setup, Disabled, Warning, and Error.
- Diagnostic errors now use the Discord `:no_entry:`-style `⛔` icon.
- `/bot test` now includes recommended fixes for failed, incomplete, or unconfigured module checks.
- No existing command groups were renamed in this release.

New command:

```text
/help
```

## v0.8.3 Updates

### Join-to-Create User Picker Controls

- Replaced typed-user modals for Permit User, Remove User, and Transfer Ownership with Discord user select menus.
- Members can now search/select users through Discord's native picker instead of typing full usernames, mentions, or IDs.
- Kept typed modals for Rename, Set Limit, and Delete Channel confirmation where typed input is still appropriate.
- Control panels continue to refresh after selected-user actions so ownership and access changes remain visible.

## v0.8.2 Updates

### Join-to-Create Control Panel Polish

- Added lock and unlock emojis to the temporary voice control panel buttons.
- Updated the status field in the temporary voice embed to show `🔒 Locked` or `🔓 Unlocked`.
- Added button-driven modal controls for Rename, Set Limit, Permit User, Remove User, and Transfer Ownership.
- Updated Delete Channel to open a confirmation modal requiring `DELETE` before the temporary room is removed.
- The control panel continues to refresh after owner actions so room status, user limit, and ownership stay current.

## v0.8.1 Updates

### Join-to-Create Control Panels

- Temporary voice channels now receive an automatic control panel message in the voice channel chat when created.
- The control panel pings the temporary channel owner so first-time users can find the controls immediately.
- Added quick buttons for Lock, Unlock, Claim, and Delete Channel.
- The control panel shows the owner, lock status, user limit, available slash commands, and auto-cleanup behavior.
- The control panel refreshes after owner actions such as rename, limit changes, lock/unlock, ownership transfer, and claim.
- Added persistent control message tracking and clear logging when SlickBot cannot post the control panel because of channel or permission limitations.


## v0.8.0 Updates

### Join-to-Create Voice Module

- Added the **Join-to-Create Voice** module as a completed implemented module.
- Staff can register an existing voice channel as a join-to-create hub or create a new hub channel through SlickBot.
- When a member joins a configured hub, SlickBot creates a temporary voice channel, moves the member into it, and tracks the channel owner.
- Temporary voice channels support owner controls for rename, user limit, lock, unlock, permit, remove, transfer, and claim.
- Empty temporary voice channels are automatically deleted after the configured delay.
- Startup repair checks tracked temporary channels after Railway restarts and schedules cleanup for empty rooms.
- Added persistent hub/temp-channel storage, module diagnostics, module-manager status, permission defaults, and logging events.

New command group:

```text
/join-create panel
/join-create setup source_channel:Join to Create category:Voice name_template:{username}'s Voice
/join-create create-hub name:Join to Create category:Voice
/join-create list
/join-create view hub:Hub
/join-create enable hub:Hub
/join-create disable hub:Hub
/join-create delete hub:Hub delete_active:false
/join-create cleanup include_occupied:false
/join-create rename name:New Room Name
/join-create limit limit:5
/join-create lock
/join-create unlock
/join-create permit user:@member
/join-create remove user:@member
/join-create transfer user:@member
/join-create claim
```

## v0.7.0 Updates

### Custom Commands Module

- Added the **Custom Commands** module as a completed implemented module.
- Staff can create, edit, delete, enable, disable, list, view, and test custom commands from Discord.
- Members can trigger enabled commands with the configured prefix, such as `!rules`.
- Custom command responses support plain text or embed mode. Embed mode can be enabled or disabled when creating or editing a command.
- Embed responses support an optional title and hex accent color.
- Commands support per-user cooldowns plus optional channel and role restrictions.
- Added persistent command storage, usage tracking, module diagnostics, module manager status, permission defaults, and logging events.

New command group:

```text
/custom-command panel
/custom-command create trigger:rules response:Read the rules in #rules embed_mode:true
/custom-command edit command:rules embed_mode:false
/custom-command delete command:rules
/custom-command list
/custom-command view command:rules
/custom-command enable command:rules
/custom-command disable command:rules
/custom-command test command:rules
/custom-command prefix prefix:!
```

## v0.6.7 Updates

### Server Stats Voice Counter Flow

- Voice-state events now use a dedicated server-stats path instead of sharing the same general debounce queue as full stat refreshes.
- When a member joins, leaves, or moves voice channels, SlickBot queues a near-immediate refresh of only the configured `In Voice` counter.
- After the voice counter refresh, SlickBot also queues a short verification pass for the configured server-stat channels so the wider stats set can be checked without delaying the voice counter update.
- The periodic server-stats fallback refresh now runs every 15 minutes instead of every 5 minutes.
- Voice totals are calculated using both Discord voice-state cache and voice-channel member cache, using the stronger available count.

## v0.6.6 Updates

### Bot Updates Module

- Added a new **Bot Updates** module for sending configured SlickBot release announcements.
- Added update-channel setup and optional role pings. Roles are not required.
- Bot update messages include structured patch notes from `src/data/releases.json`.
- Startup announcements are sent only when the module is enabled, a channel is configured, and the current version has not already been announced for that guild.
- Added preview and manual send tools for testing release messages.

New commands:

```text
/bot-updates panel
/bot-updates setup channel:#updates role_1:@Role role_2:@Role role_3:@Role enabled:true ping_roles:true
/bot-updates channel channel:#updates
/bot-updates role-add role:@Role
/bot-updates role-remove role:@Role
/bot-updates roles
/bot-updates clear-roles
/bot-updates enable
/bot-updates disable
/bot-updates preview
/bot-updates send force:false
```

### Server Stats Reliability

- Server stats now uses debounced event updates for member joins/leaves and voice-state changes instead of renaming counters immediately on every event.
- Voice-state refreshes avoid unnecessary full member fetches, improving consistency for the `In Voice` counter.
- Periodic server stat refreshes were temporarily changed to 5 minutes in v0.6.6, then restored to a 15-minute fallback cadence in v0.6.7.
- `/stats refresh` now reports channel rename failures instead of silently hiding them.
- Server stats stores the latest refresh error in `server_stats_configs.last_error` and shows it in the manager panel.

## v0.6.5 Updates

### Application Review Workflow

- Application review embeds now preserve the original application details when approved or denied instead of replacing the message with a generic status embed.
- Application review status colors now match the final state: pending is orange, approved is green, and denied is red.
- Approve and Deny now open a required reason modal before the decision is submitted.
- Application review embeds include the approval or denial reason after review.
- Application review messages remove action buttons after a final decision.
- Added an Open Review Thread button for staff discussion. Threads are named from the applicant and application name.
- Review threads are automatically locked and archived after approval or denial.
- Application approval or denial generates a TXT transcript and attaches it to the updated application review message.

## v0.6.4 Updates

### Expanded Bot Diagnostics

- `/bot test` now runs deeper module health checks for all implemented modules.
- Enabled modules are checked for database/table readiness and configuration records where applicable.
- Disabled modules are shown as paused, while query or migration issues are reported as errors.

### Application System Fixes

- Fixed the DM application flow so answers now advance to the next configured question and then show a submit/cancel confirmation panel.
- Removed automatic starter questions from newly created application types.
- Removed the built-in default Moderator application type behavior. Existing auto-created Moderator templates from the old default behavior are cleaned up by migration when their original default description matches.
- Application types now require staff-created questions through `/application question-add` before users can apply.

### Appeal Review Updates

- Appeal review messages now update in place after approval or denial.
- Reviewed appeal embeds change color by decision, show the reviewer and decision reason, and remove decision buttons after review.
- `dm_include_submission` now includes the original appeal submission in the decision DM.
- Added `/appeal edit` so appeal settings can be changed without redoing full setup.

### Report Review Updates

- Resolved and dismissed reports now preserve the full report embed instead of replacing it with a generic success message.
- Report review embeds now change color by final status and remove action buttons after resolution/dismissal.
- Report follow-up tickets now update the report embed to show who opened the ticket and when.

## v0.6.3 Updates

### Server Stats Response Fix

- `/stats manager`, `/stats setup`, and `/stats refresh` now defer their private response before running slower member/channel checks.
- This prevents Discord from showing `The application did not respond` while server stats counts or channel rename operations are running.

### Ticket Workflow Updates

- Added `/ticket remove-user` for removing users who were granted ticket access through `/ticket add-user`.
- Ticket control messages now update in place when a ticket is claimed, escalated, prioritized, or when users are added/removed.
- The ticket control embed was simplified by removing unnecessary escalation configuration text and generic staff instructions.
- Ticket controls now verify that the interacting user is part of the assigned ticket staff role/team or escalation role/team before allowing claim, escalation, or close actions.

New ticket command:

```text
/ticket remove-user user:@member reason:Optional context
```

### Bot Diagnostics

Added a new `/bot` command group:

```text
/bot version
/bot test
```

- `/bot version` reports the currently running SlickBot package version and permission defaults version.
- `/bot test` runs a safe diagnostic check for database connectivity, guild configuration, module config rows, permission default coverage, implemented module states, and Discord client readiness.

## v0.6.2 Updates

### Ticket Access and Escalation Fixes

- New tickets now grant access only to the ticket opener and the configured non-escalated support role/team.
- Escalating a ticket removes the non-escalated reviewer role/team access before granting the escalated role/team access.
- Ticket escalation now supports both default escalation settings and ticket-type-specific escalation settings.
- Ticket setup now supports default non-escalated and escalated Permission Teams.

Updated setup options:

```text
/ticket setup staff_role:@Support staff_team:MODS escalated_role:@Escalated escalated_team:SENIOR MODS
```

### Add Users to Tickets

Added:

```text
/ticket add-user user:@member reason:Optional context
```

This grants the selected user access to the current ticket channel and logs the ticket update.

### Leveling Info Command Move

The public leveling information panel now lives under the main leveling module command:

```text
/level info
```

The info panel was refreshed to be more member-facing, easier to scan, and focused on how XP, multiplier roles, rewards, announcements, and user commands work. Multiplier roles are listed from smallest multiplier to largest multiplier.

### Optional Panel Header Images

Public panels can now include an optional header image/media URL posted above the embed. This is available through panel setup/edit flows and module setup commands where applicable.

Supported panel areas include:

- Ticket panels
- Report panels
- Application panels
- Appeal panels
- Role panels
- Giveaway panels
- Birthday panels

For general panel editing, use the header image field in `/panel setup`, `/panel edit`, or the panel design modal.

## v0.6.1 Updates

### Role Bundle Preservation Fix

- Role panel options now use separate unique keys for standalone roles and role bundles.
- Adding a bundle that begins with a role already used by a standalone button no longer replaces that standalone option.
- Example: a standalone `@stream-notifications` option can coexist with a bundle containing `@stream-notifications`, `@announcement-notifications`, and other roles.
- Removing a standalone role option no longer removes bundles that also contain that role.

### XP Multiplier Roles

```text
/level multiplier-add
/level multiplier-remove
/level multiplier-list
```

Multiplier roles increase the XP awarded for eligible messages. If a member has more than one multiplier role, SlickBot uses the highest configured multiplier rather than stacking them.

Example:

```text
/level multiplier-add role:@Subscribers multiplier:1.5
/level multiplier-add role:@VIP multiplier:2
```

### Level-Up Announcement Modes

`/level setup` now includes `level_up_mode`:

```text
ALL_LEVELS
ROLE_REWARDS_ONLY
```

This allows level-up messages to be sent for every level or only when the member reaches a level with a configured role reward.

### XP Curve Analysis

```text
/level analyze max_level:100 multiplier:1
```

The command provides milestone estimates and a CSV containing every analyzed level, total XP requirements, XP from the previous level, and estimated eligible messages.

### Public Leveling Information

```text
/level info
```

This posts a public information embed explaining how XP is earned, cooldowns, multiplier roles, role rewards, announcement behavior, and user commands.

## v0.6.0 Updates

### Expanded Native Reaction Roles

- Fixed the setup path that could stop after only a few native reactions.
- Reaction panel posting now defers the Discord interaction before syncing reactions.
- Reaction sync uses pacing and retry handling.
- One message supports up to 20 unique configured reaction options.
- Missing, duplicate, failed, and over-limit reaction options are reported after posting.

### Reverse Moderation Actions

```text
/mod untimeout
/mod unban
```

Both actions create moderation cases, audit entries, and moderation logs.

### Leveling & XP Module

```text
/level manager
/level setup
/level rank
/level leaderboard
/level role-add
/level role-remove
/level ignored-channel-add
/level ignored-channel-remove
/level ignored-role-add
/level ignored-role-remove
/level set-xp
/level reset
```

Includes automatic message XP, cooldowns, minimum message length, ignored channels and roles, level-up announcements, rank/leaderboard embeds, staff XP adjustments, and automatic level-role rewards.

## v0.5.4 Updates

### Panel Live-Update Fix

- Fixed reaction-role panel live updates by exporting the role panel ID lookup used by the published-panel refresh service.
- `/panel edit` now updates all tracked posts for the matching panel reference when possible.
- Role panels are refreshed by both panel ID and panel name/legacy references.

### Panel Deletion

Added:

```text
/panel delete
```

This can delete/unpost tracked public panels. For named panel systems, use the `name` option.

Examples:

```text
/panel delete target:role name:ColorRoles confirm:true delete_messages:true
/panel delete target:application name:Moderator confirm:true delete_messages:true
```

### `/panel setup` Create-or-Update Behavior

- `/panel setup` can now update existing panels or create missing named role/application panels.
- This prevents setup from failing when a matching panel name does not already exist.
- `/panel edit` remains edit-only and will not create missing panels.

### Birthday Panel Fix

- Fixed the **Enter Day** button interaction failure.
- The birthday day modal no longer sends an empty default value to Discord when no day has been selected.

### Server Stats Module

Added the next module system: **Server Stats**.

New commands:

```text
/stats manager
/stats setup
/stats refresh
```

Includes:

- Member counter channel
- Human counter channel
- Bot counter channel
- Voice counter channel
- Custom channel name templates
- Manual refresh command
- Automatic refresh on member join/leave, voice changes, and periodic interval
- Server stats logging through the `server-stats` log module

## v0.5.3 Updates

### Auto-Dismiss Rework

- Reworked private auto-dismiss behavior for basic user actions.
- Reaction-role button/dropdown interactions now acknowledge quietly instead of creating persistent private confirmation popups.
- Giveaway and birthday user confirmations still use short-lived private responses where a visible confirmation is helpful.

### Live Panel Edit Fix

- `/panel edit` now refreshes tracked live panel messages after edits.
- SlickBot now updates all tracked posts for the same panel, including cases where a panel is posted in more than one channel.
- Role and application panel edits now refresh tracked posts by both panel ID and legacy/name references when available.

### Birthday Timezone Improvements

- Timezone autocomplete now searches all IANA timezones supported by the Node runtime.
- Common timezone references are still prioritized, including:
  - `America/New_York` — ET / EST / EDT
  - `America/Chicago` — CT / CST / CDT
  - `America/Denver` — MT / MST / MDT
  - `America/Los_Angeles` — PT / PST / PDT
- Timezone suggestions include UTC/GMT offset labels where available.
- The birthday panel now uses a single **Enter Day** control instead of split day dropdowns.
- Invalid dates, such as February 31, show the birthday setup panel in warning/yellow state and disable saving until corrected.
- The birthday panel includes an **Enter Custom Timezone** option for timezones not shown in the common dropdown.

### Scheduled Messages Module

Added the next module system: **Scheduled Messages**.

New commands:

```text
/schedule manager
/schedule setup
/schedule create
/schedule list
/schedule cancel
/schedule send-now
```

Includes:

- One-time scheduled messages
- Daily recurring messages
- Weekly recurring messages
- Default scheduled message channel
- Manual send-now support
- Cancellation support
- Due-message processing every minute
- Scheduled message logging through the `scheduled-messages` log module

Example:

```text
/schedule setup default_channel:#announcements enabled:true
/schedule create message:Stream starts soon! delay:2h repeat:NONE
/schedule create message:Weekly community night reminder delay:1d repeat:WEEKLY
```

## Required Railway Variables

```text
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DATABASE_URL=
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=
DEFAULT_TIMEZONE=America/New_York
NODE_ENV=production
```

## Useful post-deploy commands

```text
/permissions apply-defaults
/modules panel
/birthday setup
/birthday panel channel:#birthdays
/birthday test
/schedule setup default_channel:#announcements enabled:true
/schedule manager
/level setup
/level manager
```

Optional log setup:

```text
/logging set-channel module:scheduled-messages channel:#scheduled-message-logs
```

## Notes

- Discord buttons do not support arbitrary hex colors. SlickBot stores the requested hex value for reaction-role options and maps it to the closest native Discord button style.
- Discord dropdown options require visible labels. For blank-label color roles, button mode is still the best display mode.
- Posted panels are live-updated only after they have been posted or reposted with a SlickBot version that tracks panel messages.
- Discord select menus can show up to 25 options, so the birthday panel uses common timezone choices plus a custom timezone entry flow for full timezone support.


## v0.5.5 Hotfix

- Fixed `/panel delete` error caused by a missing `createSuccessEmbed` import.
- Fixed `/stats setup` so you can configure only one or two stat channels without providing every available channel/template option.
- Server stats now safely use default templates when templates are not provided.
- Server stats refresh now handles no configured stat channels gracefully instead of throwing during setup.
