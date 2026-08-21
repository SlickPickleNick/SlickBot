const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');
const { createSuccessEmbed } = require('../modules/ui/uiService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your AFK status and notify members who mention you.')
    .addStringOption((option) =>
      option.setName('message').setDescription('AFK reason or note (defaults to "AFK").').setRequired(false).setMaxLength(250)
    ),
  actionKey: ActionKeys.UtilityAfkUse,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const message = interaction.options.getString('message', false) || 'AFK';
    await utility.setAfk(interaction.guildId, interaction.user, message);

    return replyPrivate(interaction, {
      embeds: [createSuccessEmbed(
        '💤 AFK Status Set',
        `Your AFK status is now active: **${message}**\n\nI will automatically notify members who mention you and clear your status when you send your next message!`
      )]
    });
  }
};
