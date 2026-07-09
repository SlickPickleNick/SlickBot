# SlickBot

SlickBot is a custom all-in-one Discord server management bot for the SlickPickleNick community.

This version keeps the working TitanBot-style JavaScript foundation: Discord.js, PostgreSQL, Railway Docker deployment, interactive embeds, buttons, select menus, and modals.

## Version

`v0.4.0`

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
/roles create-panel
/roles add-option
/roles remove-option
/roles delete-panel
/roles post-panel
/roles list
```

Example:

```text
/roles create-panel name:Game Roles title:Choose Your Game Roles description:Use the buttons below to toggle roles. mode:MULTI color:#7869ff
/roles add-option panel:Game Roles role:@Fortnite label:Fortnite emoji:🎮
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
```
