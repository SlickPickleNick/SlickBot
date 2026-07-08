const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether SlickBot is online.'),
  actionKey: ActionKeys.BotPing,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction) {
    const embed = createBaseEmbed({
      title: 'SlickBot Online',
      description: `Gateway latency: **${interaction.client.ws.ping}ms**`,
      color: SlickBotColors.SUCCESS
    });
    await replyPrivate(interaction, { embeds: [embed] });
  }
};
