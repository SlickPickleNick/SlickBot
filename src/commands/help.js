const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { buildHelpPayload, getHelpAutocomplete } = require('../modules/help/helpService');
const { replyPrivate } = require('../utils/reply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Open the interactive SlickBot help menu or inspect specific command syntax.')
    .addStringOption((option) =>
      option
        .setName('command')
        .setDescription('Command name to view full syntax, arguments, and examples for.')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('module')
        .setDescription('Module key to view all commands for.')
        .setRequired(false)
        .setAutocomplete(true)
    ),
  actionKey: ActionKeys.Help,
  moduleKey: ModuleKeys.PERMISSIONS,
  isPublic() {
    return true;
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const choices = getHelpAutocomplete(focused.name, focused.value);
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction, ctx) {
    await replyPrivate(interaction, await buildHelpPayload(interaction, ctx));
  }
};
