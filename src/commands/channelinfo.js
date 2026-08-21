const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Display detailed information about a channel.')
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel to inspect (defaults to current channel).').setRequired(false)
    ),
  actionKey: ActionKeys.UtilityView,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const channel = interaction.options.getChannel('channel', false) || interaction.channel;
    const embed = await utility.generateChannelInfoEmbed(interaction.guild, channel);
    return replyPrivate(interaction, { embeds: [embed] });
  }
};
