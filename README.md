# SlickBot

SlickBot is an all-in-one Discord server management bot built for the SlickPickleNick server. It uses a TitanBot-style JavaScript foundation with Discord.js, PostgreSQL, Railway deployment support, modular command permissions, polished embeds, interactive setup panels, support workflows, community systems, giveaways, and birthdays.

## Version

Current package: **v0.5.2**

## v0.5.2 Updates

### Birthday UX Improvements

- Added timezone autocomplete/suggestions to birthday setup and user birthday commands.
- Added common timezone labels such as:
  - `America/New_York` — Eastern Time, ET / EST / EDT
  - `America/Chicago` — Central Time, CT / CST / CDT
  - `America/Denver` — Mountain Time, MT / MST / MDT
  - `America/Los_Angeles` — Pacific Time, PT / PST / PDT
- Added `/birthday panel` to post a public birthday setup panel.
- Birthday panels open an interactive private setup flow with dropdowns for:
  - Month
  - Day 1–25
  - Day 26–31
  - Timezone
- Added `/birthday test` to send a test birthday announcement without changing roles.
- Updated `/birthday list` to use an interactive dropdown for:
  - Full Year
  - Individual months

### Panel Editing Improvements

- Added `/panel edit` to edit one field at a time without wiping other panel content.
- Supported fields:
  - Title
  - Description
  - Accent Color
  - Display Mode
- `/roles panel-wizard` now preserves existing panel content when you type `skip`, instead of resetting existing title/description/mode values.
- Birthday panels are now supported in the panel designer.

### Reaction Role Cleanup

- SlickBot no longer auto-adds emojis to role buttons/dropdowns unless they are explicitly configured.
- Blank-label color-role buttons are supported using an invisible label fallback when no emoji is provided.
- Dropdown role panels still require visible option labels due to Discord dropdown requirements, so blank labels are displayed as fallback role option labels.

### Giveaway Live Entry Counts

- Giveaway panels now live-update the entry count when a user enters the giveaway.

### User Action Response Cleanup

- Basic user interactions, such as reaction-role toggles, giveaway entries, and simple birthday actions, now attempt to auto-dismiss private confirmation messages after a short delay.
- Configuration menus and setup flows remain persistent so admins can continue working through setup steps.

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
```

## Notes

- Discord buttons do not support arbitrary hex colors. SlickBot stores the requested hex value for reaction-role options and maps it to the closest native Discord button style.
- Discord dropdown options require visible labels. For blank-label color roles, button mode is still the best display mode.
- Posted panels are live-updated only after they have been posted or reposted with a SlickBot version that tracks panel messages.
