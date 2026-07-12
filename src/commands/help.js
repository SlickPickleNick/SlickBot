const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { buildHelpPayload } = require('../modules/help/helpService');
const { replyPrivate } = require('../utils/reply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Open the interactive SlickBot help menu.'),
  actionKey: ActionKeys.Help,
  moduleKey: ModuleKeys.PERMISSIONS,
  isPublic() {
    return true;
  },
  async execute(interaction, ctx) {
    await replyPrivate(interaction, await buildHelpPayload(interaction, ctx));
  }
};
