const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { LogDeliveryMode } = require('../modules/logging/loggingService');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildLoggingPanel } = require('../modules/ui/panels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Configure or test SlickBot logging.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the interactive logging center.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-channel')
        .setDescription('Set the default log channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Default log channel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mode')
        .setDescription('Configure a log event delivery mode.')
        .addStringOption((option) => option.setName('event_key').setDescription('Example: system, moderation, voice, message-delete.').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('delivery')
            .setDescription('How logs should be delivered.')
            .setRequired(true)
            .addChoices(
              { name: 'Immediate', value: LogDeliveryMode.IMMEDIATE },
              { name: 'Batched', value: LogDeliveryMode.BATCHED },
              { name: 'Disabled', value: LogDeliveryMode.DISABLED }
            )
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Optional channel override for this event.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval_seconds')
            .setDescription('Batch interval in seconds. Recommended: 300 or higher.')
            .setMinValue(60)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) => subcommand.setName('test').setDescription('Send a test log.'))
    .addSubcommand((subcommand) => subcommand.setName('flush').setDescription('Flush queued batched logs now.')),
  actionKey: ActionKeys.LoggingConfigure,
  moduleKey: ModuleKeys.LOGGING,
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'panel') {
      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'set-channel') {
      const channel = interaction.options.getChannel('channel', true);
      await query(
        `UPDATE guild_configs SET default_log_channel_id = $1, updated_at = NOW() WHERE guild_id = $2`,
        [channel.id, interaction.guildId]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'mode') {
      const eventKey = interaction.options.getString('event_key', true).trim();
      const delivery = interaction.options.getString('delivery', true);
      const channel = interaction.options.getChannel('channel', false);
      const intervalSeconds = interaction.options.getInteger('interval_seconds', false) || 300;

      await query(
        `INSERT INTO log_settings (guild_id, event_key, delivery_mode, channel_id, batch_interval_seconds, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (guild_id, event_key)
         DO UPDATE SET
           delivery_mode = EXCLUDED.delivery_mode,
           channel_id = COALESCE(EXCLUDED.channel_id, log_settings.channel_id),
           batch_interval_seconds = EXCLUDED.batch_interval_seconds,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [interaction.guildId, eventKey, delivery, channel ? channel.id : null, intervalSeconds, delivery !== LogDeliveryMode.DISABLED]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'test') {
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'system',
        title: 'SlickBot Test Log',
        body: `Test log created by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      });

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'flush') {
      await ctx.logger.flushGuildBatches(interaction.guildId);
      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
    }
  }
};
