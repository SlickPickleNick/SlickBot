const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys, defaultModules } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildSetupPanel } = require('../modules/ui/panels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open the SlickBot setup center for this server.')
    .addChannelOption((option) =>
      option
        .setName('log_channel')
        .setDescription('Default channel for SlickBot logs.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  actionKey: ActionKeys.Setup,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction, ctx) {
    const logChannel = interaction.options.getChannel('log_channel', false);

    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (logChannel) {
      await query(
        `UPDATE guild_configs SET default_log_channel_id = $1, updated_at = NOW() WHERE guild_id = $2`,
        [logChannel.id, interaction.guildId]
      );
    }

    for (const moduleConfig of defaultModules) {
      await query(
        `INSERT INTO module_configs (guild_id, module_key, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET enabled = module_configs.enabled, updated_at = NOW()`,
        [interaction.guildId, moduleConfig.key, moduleConfig.enabled]
      );
    }

    await ctx.permissions.ensureOwnerTeam(interaction.guildId, interaction.user.id);

    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.Setup,
      targetType: 'GuildConfig',
      targetId: interaction.guildId,
      summary: 'SlickBot setup center opened.',
      metadata: { logChannelId: logChannel ? logChannel.id : null }
    });

    await replyPrivate(interaction, await buildSetupPanel(interaction.guildId, interaction.guild ? interaction.guild.name : null));
  }
};
