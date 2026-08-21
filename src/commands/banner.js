const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('View and download a user’s banner.')
    .addUserOption((option) =>
      option.setName('user').setDescription('User whose banner you want to view (defaults to yourself).').setRequired(false)
    ),
  actionKey: ActionKeys.UtilityView,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const targetUser = interaction.options.getUser('user', false) || interaction.user;
    const fetchedUser = await ctx.client.users.fetch(targetUser.id, { force: true }).catch(() => targetUser);

    const embed = utility.generateBannerEmbed(fetchedUser, interaction.guild);
    return replyPrivate(interaction, { embeds: [embed] });
  }
};
