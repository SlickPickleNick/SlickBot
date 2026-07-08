const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys, defaultModules } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildSetupPanel } = require('../modules/ui/panels');
const { StarterLogEventKeys, getLogEvent } = require('../modules/logging/logEventCatalog');
const { botOwnerIds } = require('../config/env');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Open the SlickBot setup center for this server.')
    .addChannelOption((option) =>
      option
        .setName('log_channel')
        .setDescription('Optional channel for core/admin event logs. No noisy logs are routed by default.')
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

      for (const eventKey of StarterLogEventKeys) {
        const event = getLogEvent(eventKey);
        await query(
          `INSERT INTO log_settings (guild_id, event_key, delivery_mode, channel_id, enabled)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (guild_id, event_key)
           DO UPDATE SET
             channel_id = EXCLUDED.channel_id,
             enabled = true,
             delivery_mode = EXCLUDED.delivery_mode,
             updated_at = NOW()`,
          [interaction.guildId, eventKey, event?.defaultDelivery || 'IMMEDIATE', logChannel.id]
        );
      }
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

    for (const ownerId of botOwnerIds) {
      await ctx.permissions.ensureOwnerTeam(interaction.guildId, ownerId);
    }

    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.Setup,
      targetType: 'GuildConfig',
      targetId: interaction.guildId,
      summary: 'SlickBot setup center opened.',
      metadata: { starterLogChannelId: logChannel?.id || null }
    });

    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'setup',
      title: 'SlickBot Setup Updated',
      body: [
        `Updated By: <@${interaction.user.id}>`,
        logChannel ? `Starter Log Channel: <#${logChannel.id}>` : 'No log channel was changed.'
      ].join('\n'),
      metadata: { actorUserId: interaction.user.id, starterLogChannelId: logChannel?.id || null }
    });

    await replyPrivate(interaction, await buildSetupPanel(interaction.guildId, interaction.guild ? interaction.guild.name : null));
  }
};
