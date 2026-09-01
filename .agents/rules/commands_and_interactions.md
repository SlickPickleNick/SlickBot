# Discord Commands & Interaction Guidelines

This rule defines the exact conventions for creating slash commands, context menus, buttons, select menus, modals, and interaction routing in SlickBot.

---

## 1. Slash Command Structure & Requirements

All commands in `src/commands/` must follow Discord.js v14 conventions and export an object with `data` and `execute`:

```javascript
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replySuccess, replyError } = require('../utils/reply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('example')
    .setDescription('Example command description')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('required_field')
        .setDescription('This required option MUST come first')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('optional_field')
        .setDescription('This optional option comes after required options')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      // Command logic here
      await replySuccess(interaction, 'Operation completed successfully!');
    } catch (error) {
      console.error('[Command: example] Error:', error);
      await replyError(interaction, 'Failed to complete operation: ' + error.message);
    }
  }
};
```

---

## 2. Mandatory Option Ordering (Discord v14 Rule)

> [!CAUTION]
> **Required Options Must Precede Optional Options**
> Discord API rejects command registrations if a required option is added after an optional option within a command, subcommand, or subcommand group.

Always verify command definitions by running:
```bash
npm run validate:commands
```

---

## 3. Command Registration in `src/commands/index.js`

Whenever a new command file is created:
1. Import the command in `src/commands/index.js`.
2. Add it to the `commands` array.
3. The `commandMap` will automatically map it by `command.data.name`.

---

## 4. Interaction Router (`src/services/interactionRouter.js`)

All interactions dispatch through `src/services/interactionRouter.js`. Do not add isolated interaction listeners.

Interaction types handled:
- **`isChatInputCommand()`**: Dispatches to `commandMap.get(interaction.commandName).execute(interaction)`.
- **`isUserContextMenuCommand()` / `isMessageContextMenuCommand()`**: Context menu handlers.
- **`isButton()`**: Routes based on `customId` prefix or exact match.
- **`isStringSelectMenu()` / `isChannelSelectMenu()` / `isRoleSelectMenu()` / `isUserSelectMenu()`**: Routes selection menus.
- **`isModalSubmit()`**: Handles submitted text modal inputs.

---

## 5. Custom IDs & Namespacing (`src/modules/ui/customIds.js`)

All `customId` strings must adhere to structured namespacing:
- **Exact Action IDs**: `slickbot:<domain>:<action>` (e.g., `slickbot:setup:refresh`, `slickbot:logging:test`).
- **Dynamic Prefix IDs**: `slickbot:<domain>:<action>:` (e.g., `slickbot:mod:toggle:<moduleKey>`, `slickbot:ticket:open:<typeId>`).

Register every new custom ID in `src/modules/ui/customIds.js`:
```javascript
const CustomIds = Object.freeze({
  // ...
  MyNewAction: 'slickbot:domain:action',
  MyNewPrefix: 'slickbot:domain:prefix:'
});
```

---

## 6. Interaction Reply Helpers (`src/utils/reply.js`)

To prevent expired interaction errors and ensure consistent ephemeral responses across servers, always use the helpers in `src/utils/reply.js`:

- `replyPrivate(interaction, options)`: Sends an ephemeral reply safely.
- `replySuccess(interaction, message, options)`: Sends a styled success message.
- `replyError(interaction, message, options)`: Sends a styled error message.
- `editReplyPrivate(interaction, options)`: Updates a deferred or existing reply.

### Deferrals for Long Operations
If processing takes more than ~2 seconds (external API fetch, large DB transaction):
```javascript
await interaction.deferReply({ ephemeral: true });
// ... perform async operations ...
await editReplyPrivate(interaction, { embeds: [resultEmbed] });
```
