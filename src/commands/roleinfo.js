const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { UtilityService } = require('../modules/utility/utilityService');

const utility = new UtilityService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Display detailed information and permissions for a server role.')
    .addRoleOption((option) =>
      option.setName('role').setDescription('Role to inspect.').setRequired(true)
    ),
  actionKey: ActionKeys.UtilityView,
  moduleKey: ModuleKeys.UTILITY,
  async execute(interaction, ctx) {
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    const role = interaction.options.getRole('role', true);
    const embed = await utility.generateRoleInfoEmbed(interaction.guild, role);
    return replyPrivate(interaction, { embeds: [embed] });
  }
};
