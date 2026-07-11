# SlickBot

SlickBot is an all-in-one Discord server management bot built for the SlickPickleNick server. It uses a TitanBot-style JavaScript foundation with Discord.js, PostgreSQL, Railway deployment support, modular command permissions, polished embeds, interactive setup panels, support workflows, community systems, giveaways, birthdays, and scheduled messages.

## Version

Current package: **v0.6.2**

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
LOG_BATCH_FLUSH_SECONDS=300
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
