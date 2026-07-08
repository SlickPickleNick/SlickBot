const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { LogDeliveryMode } = require('../modules/logging/loggingService');
const { getLogEventChoices, getLogEvent } = require('../modules/logging/logEventCatalog');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildLoggingPanel } = require('../modules/ui/panels');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');

const eventChoices = getLogEventChoices();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Configure or test SlickBot logging.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the interactive logging center.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-channel')
        .setDescription('Route a specific log event to a channel.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Log event to route.')
            .setRequired(true)
            .addChoices(...eventChoices)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel for this event.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear-channel')
        .setDescription('Disable Discord log delivery for a specific event.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Log event to disable.')
            .setRequired(true)
            .addChoices(...eventChoices)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mode')
        .setDescription('Configure a log event delivery mode.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Log event to configure.')
            .setRequired(true)
            .addChoices(...eventChoices)
        )
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
        .addIntegerOption((option) =>
          option
            .setName('interval_seconds')
            .setDescription('Batch interval in seconds. Recommended: 300 or higher.')
            .setMinValue(60)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('test')
        .setDescription('Send a test log to a configured event channel.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Event to test. Defaults to System.')
            .setRequired(false)
            .addChoices(...eventChoices)
        )
    )
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
      const eventKey = interaction.options.getString('event', true);
      const channel = interaction.options.getChannel('channel', true);
      const event = getLogEvent(eventKey);

      await query(
        `INSERT INTO log_settings (guild_id, event_key, delivery_mode, channel_id, enabled)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (guild_id, event_key)
         DO UPDATE SET
           channel_id = EXCLUDED.channel_id,
           enabled = true,
           delivery_mode = CASE
             WHEN log_settings.delivery_mode = 'DISABLED' THEN EXCLUDED.delivery_mode
             ELSE log_settings.delivery_mode
           END,
           updated_at = NOW()`,
        [interaction.guildId, eventKey, event?.defaultDelivery || LogDeliveryMode.BATCHED, channel.id]
      );

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.LoggingConfigure,
        targetType: 'LogSetting',
        targetId: eventKey,
        summary: `${eventKey} logs routed to #${channel.name}.`,
        metadata: { channelId: channel.id }
      });

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'clear-channel') {
      const eventKey = interaction.options.getString('event', true);
      await query(
        `INSERT INTO log_settings (guild_id, event_key, delivery_mode, channel_id, enabled)
         VALUES ($1, $2, 'DISABLED', NULL, false)
         ON CONFLICT (guild_id, event_key)
         DO UPDATE SET channel_id = NULL, enabled = false, delivery_mode = 'DISABLED', updated_at = NOW()`,
        [interaction.guildId, eventKey]
      );

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.LoggingConfigure,
        targetType: 'LogSetting',
        targetId: eventKey,
        summary: `${eventKey} Discord log delivery disabled.`
      });

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'mode') {
      const eventKey = interaction.options.getString('event', true);
      const delivery = interaction.options.getString('delivery', true);
      const intervalSeconds = interaction.options.getInteger('interval_seconds', false) || 300;

      await query(
        `INSERT INTO log_settings (guild_id, event_key, delivery_mode, batch_interval_seconds, enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, event_key)
         DO UPDATE SET
           delivery_mode = EXCLUDED.delivery_mode,
           batch_interval_seconds = EXCLUDED.batch_interval_seconds,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [interaction.guildId, eventKey, delivery, intervalSeconds, delivery !== LogDeliveryMode.DISABLED]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'test') {
      const eventKey = interaction.options.getString('event', false) || 'system';
      const result = await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey,
        title: 'SlickBot Test Log',
        body: `Test log for **${eventKey}** created by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      });

      if (result?.reason === 'NO_EVENT_CHANNEL') {
        await replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'No Channel Configured',
            description: `No Discord log was sent because **${eventKey}** does not have a channel configured. Use \`/logging set-channel\` first.`,
            color: SlickBotColors.WARNING
          })]
        });
        return;
      }

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'flush') {
      const flushed = await ctx.logger.flushGuildBatches(interaction.guildId);
      const panel = await buildLoggingPanel(interaction.guildId);
      if (panel.embeds?.[0]) {
        panel.embeds[0].setDescription(`${panel.embeds[0].data.description}\n\nFlushed **${flushed}** queued log item(s).`);
      }
      await replyPrivate(interaction, panel);
    }
  }
};
