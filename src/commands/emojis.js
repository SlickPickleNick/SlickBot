const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emojis')
    .setDescription('View all custom emojis uploaded on this server.')
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number to view').setRequired(false).setMinValue(1)
    ),
  actionKey: ActionKeys.UtilityView,
  moduleKey: ModuleKeys.UTILITY,
  isPublic: true,
  async execute(interaction, ctx) {
    const page = interaction.options.getInteger('page', false) || 1;
    const payload = await utility.buildEmojiListPayload(interaction.guild, page);
    return replyPrivate(interaction, payload);
  }
};
