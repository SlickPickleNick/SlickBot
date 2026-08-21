const { ApplicationCommandType, ContextMenuCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');

const utility = new UtilityService();

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('View Avatar')
    .setType(ApplicationCommandType.User),
  moduleKey: ModuleKeys.UTILITY,
  actionKey: ActionKeys.UtilityView,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const targetUser = interaction.targetUser;
    const targetMember = interaction.targetMember || (interaction.guild ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null);

    const embed = utility.generateAvatarEmbed(targetUser, targetMember);
    return replyPrivate(interaction, { embeds: [embed] });
  }
};
