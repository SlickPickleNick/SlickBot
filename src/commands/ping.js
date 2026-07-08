const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether SlickBot is online.'),
  actionKey: ActionKeys.BotPing,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction) {
    await replyPrivate(interaction, `SlickBot is online. Latency: ${interaction.client.ws.ping}ms`);
  }
};
