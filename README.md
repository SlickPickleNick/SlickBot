# SlickBot

SlickBot is an all-in-one Discord server management bot for the SlickPickleNick community.

## Version

`0.5.1`

## Included Systems

- Core setup panel
- Permission Teams and permission levels
- Ignored users
- Module manager
- Module-based logging
- Bot status/activity controls
- Moderation, cases, and user notes
- Tickets, reports, applications, and appeals
- Welcome messages and auto roles
- Reaction/button role panels
- Guided panel builders
- Live-updating posted panels
- Giveaways
- Birthdays

## New in v0.5.1

### Panel display modes

Public panels can now be displayed as either:

```text
BUTTONS
DROPDOWN
```

Buttons remain the default.

Supported panels:

- Ticket panels
- Report panels
- Application panels
- Appeal panels
- Reaction/button role panels

Configuration examples:

```text
/ticket setup display_mode:DROPDOWN
/report setup display_mode:DROPDOWN
/application setup type:Moderator display_mode:DROPDOWN
/appeal setup display_mode:DROPDOWN
/roles display-mode panel:Color Roles display_mode:DROPDOWN
```

Guided setup through `/panel setup` and `/roles panel-wizard` now asks whether the panel should use buttons or a dropdown menu.

### Reaction role dropdowns

Reaction role panels can now be posted as dropdown/select menus instead of buttons.

Notes:

- Buttons are still the default.
- Dropdown mode supports up to 25 role options on one panel.
- Dropdown role selection toggles one selected role at a time.
- Discord dropdown options require a text label, so emoji-only color role panels are best used in button mode.

### Birthdays

Added:

```text
/birthday manager
/birthday setup
/birthday set
/birthday view
/birthday remove
/birthday list
```

Features:

- User birthday tracking
- Optional birthday announcement channel
- Optional birthday role
- Timezone support
- Hourly birthday processing
- Birthday role is removed after the birthday has passed
- Announcement template placeholders:
  - `{user}`
  - `{username}`
  - `{server}`
  - `{date}`

Example setup:

```text
/birthday setup channel:#birthdays birthday_role:@Birthday message:Happy birthday, {user}! 🎉 timezone:America/New_York enabled:true
```

User setup:

```text
/birthday set month:7 day:9 timezone:America/New_York
```

### Live-updating panels

Tracked panels still live-update after configuration changes.

Tracked panel types:

- Ticket panels
- Report panels
- Application panels
- Appeal panels
- Reaction/button role panels

Panels posted before v0.5.0 were not tracked. Repost each panel once if needed, then future edits should update the existing posted panel.

## Railway Variables

Required:

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DATABASE_URL
```

Recommended:

```text
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS=<your Discord user ID>
DEFAULT_TIMEZONE=America/New_York
LOG_BATCH_FLUSH_SECONDS=300
NODE_ENV=production
```

Aliases also supported:

```text
CLIENT_ID
GUILD_ID
OWNER_IDS
POSTGRES_URL
```

## Deployment

This package is Railway/Docker ready.

The repo root should directly contain:

```text
package.json
Dockerfile
railway.json
src/
README.md
.env.example
```

Do not upload the files inside an extra nested folder.

## After deploying v0.5.1

Run:

```text
/permissions apply-defaults
/modules panel
/birthday setup channel:#birthdays birthday_role:@Birthday
```

Optional log setup:

```text
/logging set-channel module:birthdays channel:#birthday-logs
```

## Notes

Discord buttons do not support arbitrary hex colors. SlickBot stores requested hex colors for reaction-role buttons and maps them to the closest supported native Discord button style.
