const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('View and download a user’s avatar.')
    .addUserOption((option) =>
      option.setName('user').setDescription('User whose avatar you want to view (defaults to yourself).').setRequired(false)
    ),
  actionKey: ActionKeys.UtilityView,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const targetUser = interaction.options.getUser('user', false) || interaction.user;
    const targetMember = interaction.guild ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;

    const embed = utility.generateAvatarEmbed(targetUser, targetMember);
    return replyPrivate(interaction, { embeds: [embed] });
  }
};
