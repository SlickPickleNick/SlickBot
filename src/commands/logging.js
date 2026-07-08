const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { LogDeliveryMode } = require('../modules/logging/loggingService');
const {
  getLogModuleChoices,
  getLogEventChoices,
  getLogModule,
  getLogEvent
} = require('../modules/logging/logEventCatalog');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildLoggingPanel } = require('../modules/ui/panels');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');

const moduleChoices = getLogModuleChoices();
const eventChoices = getLogEventChoices();

const deliveryChoices = [
  { name: 'Immediate', value: LogDeliveryMode.IMMEDIATE },
  { name: 'Batched', value: LogDeliveryMode.BATCHED },
  { name: 'Disabled', value: LogDeliveryMode.DISABLED }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Configure or test SlickBot logging.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the interactive logging center.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-channel')
        .setDescription('Route a log module to a channel.')
        .addStringOption((option) =>
          option
            .setName('module')
            .setDescription('Log module to route.')
            .setRequired(true)
            .addChoices(...moduleChoices)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel for this logging module.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear-channel')
        .setDescription('Disable Discord delivery for a log module.')
        .addStringOption((option) =>
          option
            .setName('module')
            .setDescription('Log module to disable.')
            .setRequired(true)
            .addChoices(...moduleChoices)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('module-mode')
        .setDescription('Configure delivery mode for a logging module.')
        .addStringOption((option) =>
          option
            .setName('module')
            .setDescription('Log module to configure.')
            .setRequired(true)
            .addChoices(...moduleChoices)
        )
        .addStringOption((option) =>
          option
            .setName('delivery')
            .setDescription('How logs should be delivered.')
            .setRequired(true)
            .addChoices(...deliveryChoices)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval_seconds')
            .setDescription('Batch interval in seconds. Only used for batched modules.')
            .setMinValue(60)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('event-mode')
        .setDescription('Override delivery mode for a specific event inside a log module.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Specific log event to configure.')
            .setRequired(true)
            .addChoices(...eventChoices)
        )
        .addStringOption((option) =>
          option
            .setName('delivery')
            .setDescription('How this event should be delivered.')
            .setRequired(true)
            .addChoices(...deliveryChoices)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval_seconds')
            .setDescription('Batch interval in seconds. Only used if this event is batched.')
            .setMinValue(60)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('event-channel')
        .setDescription('Optional: route a specific event to a different channel than its module.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Specific log event to route.')
            .setRequired(true)
            .addChoices(...eventChoices)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Override channel for this event.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear-event')
        .setDescription('Remove an event override so it follows the module again.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Specific log event override to remove.')
            .setRequired(true)
            .addChoices(...eventChoices)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('test')
        .setDescription('Send a test log to a configured logging module/event route.')
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
      const moduleKey = interaction.options.getString('module', true);
      const channel = interaction.options.getChannel('channel', true);
      const logModule = getLogModule(moduleKey);

      await query(
        `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, channel_id, enabled)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET
           channel_id = EXCLUDED.channel_id,
           enabled = true,
           delivery_mode = CASE
             WHEN log_module_settings.delivery_mode = 'DISABLED' THEN EXCLUDED.delivery_mode
             ELSE log_module_settings.delivery_mode
           END,
           updated_at = NOW()`,
        [interaction.guildId, moduleKey, logModule?.defaultDelivery || LogDeliveryMode.IMMEDIATE, channel.id]
      );

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.LoggingConfigure,
        targetType: 'LogModuleSetting',
        targetId: moduleKey,
        summary: `${moduleKey} logs routed to #${channel.name}.`,
        metadata: { channelId: channel.id }
      });

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'clear-channel') {
      const moduleKey = interaction.options.getString('module', true);
      await query(
        `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, channel_id, enabled)
         VALUES ($1, $2, 'DISABLED', NULL, false)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET channel_id = NULL, enabled = false, delivery_mode = 'DISABLED', updated_at = NOW()`,
        [interaction.guildId, moduleKey]
      );

      await ctx.logger.writeAudit({
        guildId: interaction.guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.LoggingConfigure,
        targetType: 'LogModuleSetting',
        targetId: moduleKey,
        summary: `${moduleKey} Discord log delivery disabled.`
      });

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'module-mode') {
      const moduleKey = interaction.options.getString('module', true);
      const delivery = interaction.options.getString('delivery', true);
      const intervalSeconds = interaction.options.getInteger('interval_seconds', false) || 300;

      await query(
        `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, batch_interval_seconds, enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET
           delivery_mode = EXCLUDED.delivery_mode,
           batch_interval_seconds = EXCLUDED.batch_interval_seconds,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [interaction.guildId, moduleKey, delivery, intervalSeconds, delivery !== LogDeliveryMode.DISABLED]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'event-mode') {
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

    if (subcommand === 'event-channel') {
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
           delivery_mode = COALESCE(log_settings.delivery_mode, EXCLUDED.delivery_mode),
           updated_at = NOW()`,
        [interaction.guildId, eventKey, event?.defaultDelivery || LogDeliveryMode.IMMEDIATE, channel.id]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'clear-event') {
      const eventKey = interaction.options.getString('event', true);
      await query(
        `DELETE FROM log_settings WHERE guild_id = $1 AND event_key = $2`,
        [interaction.guildId, eventKey]
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

      if (result?.reason === 'NO_LOG_MODULE_CHANNEL') {
        await replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'No Log Module Channel Configured',
            description: `No Discord log was sent because **${eventKey}** does not have a configured module or event channel. Use \`/logging set-channel\` first.`,
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
