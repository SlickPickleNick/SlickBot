# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version keeps the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, select menus, and modals.

## Version

`v0.4.2`

## v0.4.2 Guided Panel Builder Update

This update replaces the modal-first panel design workflow with guided setup-channel message flows. This is better for longer panel text because Discord message replies preserve line breaks and spacing.

### Added

- New `/panel setup` guided message-based designer for public panels.
- New `/roles panel-wizard` guided message-based role panel creator.
- New `/roles bulk-add-wizard` guided bulk role button setup.
- Reaction-role button labels are now optional.
- Emoji-only role buttons are supported.
- If a reaction-role option has no label and no emoji, SlickBot auto-selects a colored square emoji from the provided hex color.
- Existing `/panel design` modal editor remains available for quick edits.

### Guided Panel Setup

```text
/panel setup target:ticket
/panel setup target:report
/panel setup target:appeal
/panel setup target:application name:Moderator
/panel setup target:role name:Game Roles
```

SlickBot will ask for:

```text
Panel title
Panel description
Accent color
```

For descriptions, paste formatted multiline text directly into the setup channel. SlickBot preserves the line breaks.

### Guided Role Panel Creation

```text
/roles panel-wizard
/roles panel-wizard name:Color Roles
```

SlickBot will ask for:

```text
Internal panel name
Public panel title
Public panel description
Selection mode: single or multi
Accent color
```

### Guided Bulk Role Button Setup

```text
/roles bulk-add-wizard panel:Color Roles
```

Paste one role option per line:

```text
@Role | Button Label | Emoji | #hex
@Red || 🟥 | #ff0000
@Blue || 🟦 | #5865f2
@Green || 🟩 | #57f287
```

Button text can be left blank. Discord requires a button to have either text or an emoji, so if both label and emoji are blank, SlickBot uses a colored square emoji based on the hex color. Discord does not support fully custom button hex colors, so SlickBot stores the hex and maps it to the closest native Discord button style.


## v0.4.1 Panel Builder Update

This update improves public panel customization before moving to the next major module set.

### Added

- New `/panel design` modal editor for multiline public panel descriptions.
- Reusable panel design support for:
  - Ticket panels
  - Report panels
  - Application panels
  - Appeal panels
  - Reaction role panels
- New `/panel help` command.
- Reaction-role button color option using `button_color` hex values. Discord does not support arbitrary button hex colors, so SlickBot stores the requested hex and maps it to the closest native Discord button style.
- New `/roles bulk-add` command for adding multiple reaction-role options at once.

### Panel Designer

```text
/panel setup target:ticket
/panel setup target:report
/panel setup target:appeal
/panel setup target:application name:Moderator
/panel setup target:role name:Game Roles
```

The modal supports:

```text
Title
Multiline description
Accent color, example: #7869ff
```

After editing a panel design, repost the panel with its normal post command so the public message uses the updated embed.

### Bulk Reaction Role Format

```text
@Role|Button Label|emoji|#hex
@Fortnite|Fortnite|🎮|#5865f2
@Minecraft|Minecraft|⛏️|#57f287
@GeoGuessr|GeoGuessr|🌎|#f2b84b
```

Command:

```text
/roles bulk-add panel:Game Roles entries:<lines above>
```

## v0.4.0 Community Modules

This update adds the first community module set and improves module status reporting.

### Added

- Welcome system
- Auto roles on member join
- DM welcome option
- Custom welcome embed title, description, message text, and accent color
- Button role panels for self-assignable roles
- Multi-role and single-role role panel modes
- Role panel template creation/deletion
- Role panel option creation/removal
- Role panel posting command
- Module panel now shows unfinished modules as `🕒 Coming Soon`
- Logging core module now shows configuration completeness:
  - `🟣 Needs configuration` when no log groups have channels
  - `🟠 Partially enabled` when some log groups have channels
  - `🟢 Fully enabled` when all log groups have channels

## New Commands

### Welcome / Auto Roles

```text
/welcome manager
/welcome setup
/welcome auto-role-add
/welcome auto-role-remove
/welcome auto-role-list
/welcome test
```

Example:

```text
/welcome setup channel:#welcome enabled:true title:Welcome to {server} description:Glad to have you here, {user}. color:#7869ff
/welcome auto-role-add role:@Member
/welcome test
```

Supported placeholders:

```text
{user}
{username}
{tag}
{server}
{memberCount}
{createdAt}
```

### Role Panels

```text
/roles manager
/roles panel-wizard
/roles create-panel
/roles add-option
/roles bulk-add
/roles bulk-add-wizard
/roles remove-option
/roles delete-panel
/roles post-panel
/roles list
```

Example:

```text
/roles panel-wizard name:Game Roles
/roles bulk-add-wizard panel:Game Roles
/roles add-option panel:Game Roles role:@Fortnite emoji:🎮 button_color:#5865f2
/roles add-option panel:Game Roles role:@Minecraft label:Minecraft emoji:⛏️
/roles post-panel panel:Game Roles channel:#roles
```

## Permissions

New default permission keys are included in the v0.4.0 permission seed.

| Action | Default Level |
|---|---|
| `welcome.view` | `MODERATOR` |
| `welcome.configure` | `SENIOR_MODERATOR` |
| `welcome.test` | `SENIOR_MODERATOR` |
| `reaction-roles.view` | `MODERATOR` |
| `reaction-roles.configure` | `SENIOR_MODERATOR` |
| `reaction-roles.panel.post` | `SENIOR_MODERATOR` |
| `reaction-roles.use` | `EVERYONE` |

After deploying, run:

```text
/permissions apply-defaults
/modules panel
```

## Logging

New log modules and events:

```text
welcome
reaction-roles
welcome-config
welcome-member
auto-role-config
reaction-role-config
reaction-role-toggle
```

Configure them with:

```text
/logging set-channel module:welcome channel:#member-logs
/logging set-channel module:reaction-roles channel:#role-logs
```

## Railway Variables

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
DATABASE_URL
AUTO_DEPLOY_COMMANDS=true
BOT_OWNER_IDS
DEFAULT_TIMEZONE=America/New_York
LOG_BATCH_FLUSH_SECONDS=300
NODE_ENV=production
```

## Deployment

Replace the GitHub repo contents with this package, then redeploy Railway.

Recommended post-deploy checks:

```text
/ping
/permissions apply-defaults
/modules panel
/welcome manager
/roles manager
/panel help
```
