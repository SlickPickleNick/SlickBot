# SlickBot

SlickBot is an all-in-one Discord server management bot for the SlickPickleNick community.

## Version

`0.5.0`

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

## New in v0.5.0

### Live-updating panels

SlickBot now tracks posted public panel messages and updates them automatically when their source configuration changes.

Tracked panel types:

- Ticket panels
- Report panels
- Application panels
- Appeal panels
- Reaction/button role panels

When a panel is reposted using commands such as `/ticket panel`, `/report panel`, `/application panel`, `/appeal panel`, or `/roles post-panel`, SlickBot stores the message ID. Future edits through `/panel setup`, `/panel design`, ticket type changes, application changes, or reaction-role changes will attempt to edit the already-posted panel message.

### Reaction role panel cleanup

Added:

```text
/roles remove-all
```

This removes all role options from a role panel. Posted role panels are live-updated after the options are cleared.

### Giveaways

Added:

```text
/giveaway manager
/giveaway setup
/giveaway start
/giveaway end
/giveaway reroll
/giveaway list
```

Features:

- Multiple winners
- Automatic winner selection
- Giveaway entry button
- Manual early ending
- Reroll support
- Default giveaway channel
- Optional giveaway ping role
- Automatic due-giveaway processing every minute

Example:

```text
/giveaway setup default_channel:#giveaways ping_role:@Giveaway Ping
/giveaway start prize:Discord Nitro duration:1d winners:2 description:Thanks for being part of the community.
```

### Module status

The module panel still shows unfinished systems as:

```text
🕒 Coming Soon
```

Giveaways are now implemented, so they will show as needs configuration or ready depending on setup.

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

## After deploying v0.5.0

Run:

```text
/permissions apply-defaults
/modules panel
/giveaway setup default_channel:#giveaways
```

Optional log setup:

```text
/logging set-channel module:giveaways channel:#giveaway-logs
```

## Notes

Discord buttons do not support arbitrary hex colors. SlickBot stores requested hex colors for reaction-role buttons and maps them to the closest supported native Discord button style.
