# SlickBot

SlickBot is an all-in-one Discord server management bot built for the SlickPickleNick server. It uses a TitanBot-style JavaScript foundation with Discord.js, PostgreSQL, Railway deployment support, modular command permissions, polished embeds, interactive setup panels, support workflows, community systems, giveaways, birthdays, and scheduled messages.

## Version

Current package: **v0.5.4**

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
