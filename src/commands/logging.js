const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { LogDeliveryMode } = require('../modules/logging/loggingService');
const {
  LogModuleCatalog,
  LogEventCatalog,
  getLogModule,
  getLogEvent,
  StarterLogModuleKeys
} = require('../modules/logging/logEventCatalog');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildLoggingPanel } = require('../modules/ui/panels');
const { createBaseEmbed, createSuccessEmbed, SlickBotColors } = require('../modules/ui/uiService');

const deliveryChoices = [
  { name: 'Immediate', value: LogDeliveryMode.IMMEDIATE },
  { name: 'Disabled', value: LogDeliveryMode.DISABLED }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Configure or test SlickBot logging.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the interactive logging center.'))
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the interactive logging center.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure aggregated logging hubs across all 27 tracking modules.')
        .addBooleanOption((option) =>
          option
            .setName('auto_create')
            .setDescription('Auto-create a private Server Logs category and all 6 log channels for you.')
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Core & System log channel (setup, permissions, bot status).')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('moderation_channel')
            .setDescription('Moderation, safety, lockdown, and temporary role log channel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('member_channel')
            .setDescription('Member joins/leaves/updates, message edits, and deletions channel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('voice_channel')
            .setDescription('Voice activity and Join-to-Create channel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('support_channel')
            .setDescription('Tickets, reports, applications, and appeals log channel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('community_channel')
            .setDescription('Giveaways, leveling, birthdays, reactions, games, and feed logs.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-channel')
        .setDescription('Route a log module to a channel.')
        .addStringOption((option) =>
          option
            .setName('module')
            .setDescription('Log module to route.')
            .setRequired(true)
            .setAutocomplete(true)
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
            .setAutocomplete(true)
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
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName('delivery')
            .setDescription('How logs should be delivered.')
            .setRequired(true)
            .addChoices(...deliveryChoices)
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
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName('delivery')
            .setDescription('How this event should be delivered.')
            .setRequired(true)
            .addChoices(...deliveryChoices)
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
            .setAutocomplete(true)
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
            .setAutocomplete(true)
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
            .setAutocomplete(true)
        )
    ),
  actionKey: ActionKeys.LoggingConfigure,
  moduleKey: ModuleKeys.LOGGING,
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'panel' || subcommand === 'manager') {
      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'setup') {
      const autoCreate = interaction.options.getBoolean('auto_create', false);
      const defaultChannel = interaction.options.getChannel('channel');
      const modChannel = interaction.options.getChannel('moderation_channel');
      const memberChannel = interaction.options.getChannel('member_channel');
      const voiceChannel = interaction.options.getChannel('voice_channel');
      const supportChannel = interaction.options.getChannel('support_channel');
      const communityChannel = interaction.options.getChannel('community_channel');

      const { LoggingService } = require('../modules/logging/loggingService');
      const logging = new LoggingService();

      if (autoCreate) {
        if (!interaction.guild) {
          return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Guild Required', description: 'Auto-creation must be run inside a Discord server.', color: SlickBotColors.ERROR })] });
        }
        const created = await logging.autoCreateAllLogChannels(interaction.guild);
        const lines = [
          `Category: **${created.category.name}**`,
          ...Object.entries(created.createdChannels).map(([k, ch]) => `• ${k}: <#${ch.id}>`),
          '',
          '✅ All 27 tracking modules have been wired to your new logging category.'
        ];
        await replyPrivate(interaction, { embeds: [createSuccessEmbed('Server Logging Auto-Created', lines.join('\n'))] });
        return;
      }

      if (!defaultChannel && !modChannel && !memberChannel && !voiceChannel && !supportChannel && !communityChannel) {
        return replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      }

      if (defaultChannel) {
        await logging.setupLogGroup(interaction.guildId, 'CORE_SYSTEM', defaultChannel.id);
      }
      if (modChannel) {
        await logging.setupLogGroup(interaction.guildId, 'MODERATION_SAFETY', modChannel.id);
      }
      if (memberChannel) {
        await logging.setupLogGroup(interaction.guildId, 'MEMBER_MESSAGE', memberChannel.id);
      }
      if (voiceChannel) {
        await logging.setupLogGroup(interaction.guildId, 'VOICE_ACTIVITY', voiceChannel.id);
      }
      if (supportChannel) {
        await logging.setupLogGroup(interaction.guildId, 'SUPPORT_TICKETS', supportChannel.id);
      }
      if (communityChannel) {
        await logging.setupLogGroup(interaction.guildId, 'COMMUNITY_FEEDS', communityChannel.id);
      }

      const summaryLines = [
        defaultChannel ? `• 🛡️ Core & System: <#${defaultChannel.id}>` : null,
        modChannel ? `• ⚖️ Moderation & Safety: <#${modChannel.id}>` : null,
        memberChannel ? `• 👥 Member & Messages: <#${memberChannel.id}>` : null,
        voiceChannel ? `• 🎙️ Voice Activity: <#${voiceChannel.id}>` : null,
        supportChannel ? `• 🎟️ Support & Tickets: <#${supportChannel.id}>` : null,
        communityChannel ? `• ✨ Community & Feeds: <#${communityChannel.id}>` : null,
        '',
        'All associated event modules have been routed to these log hubs.'
      ].filter(Boolean);

      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Logging Hubs Configured', summaryLines.join('\n'))] });
      return;
    }

    if (subcommand === 'set-channel') {
      const moduleKey = String(interaction.options.getString('module', true)).trim().toLowerCase();
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
      const moduleKey = String(interaction.options.getString('module', true)).trim().toLowerCase();
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
      const moduleKey = String(interaction.options.getString('module', true)).trim().toLowerCase();
      const delivery = interaction.options.getString('delivery', true);

      await query(
        `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, enabled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, module_key)
         DO UPDATE SET
           delivery_mode = EXCLUDED.delivery_mode,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [interaction.guildId, moduleKey, delivery, delivery !== LogDeliveryMode.DISABLED]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'event-mode') {
      const eventKey = String(interaction.options.getString('event', true)).trim().toLowerCase();
      const delivery = interaction.options.getString('delivery', true);

      await query(
        `INSERT INTO log_settings (guild_id, event_key, delivery_mode, enabled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, event_key)
         DO UPDATE SET
           delivery_mode = EXCLUDED.delivery_mode,
           enabled = EXCLUDED.enabled,
           updated_at = NOW()`,
        [interaction.guildId, eventKey, delivery, delivery !== LogDeliveryMode.DISABLED]
      );

      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'event-channel') {
      const eventKey = String(interaction.options.getString('event', true)).trim().toLowerCase();
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
      const eventKey = String(interaction.options.getString('event', true)).trim().toLowerCase();
      await query(
        `DELETE FROM log_settings WHERE guild_id = $1 AND event_key = $2`,
        [interaction.guildId, eventKey]
      );
      await replyPrivate(interaction, await buildLoggingPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'test') {
      const eventInput = String(interaction.options.getString('event', false) || 'all').trim().toLowerCase();

      if (eventInput === 'all') {
        if (!interaction.guild) {
          return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Server Required', description: 'Log testing must be performed within a Discord server.', color: SlickBotColors.ERROR })] });
        }
        const results = await ctx.logger.testAllHubs(interaction.guild, interaction.user);
        const lines = results.map((r) => `${r.ok ? '✅' : '⚪'} **${r.group.label}**: ${r.channelId ? `<#${r.channelId}>` : '*No channel configured*'}`);
        await replyPrivate(interaction, {
          embeds: [createSuccessEmbed('Logging Hubs Tested', [
            'Test messages have been dispatched to all configured logging hubs:',
            '',
            ...lines
          ].join('\n'))]
        });
        return;
      }

      const result = await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: eventInput,
        title: 'SlickBot Test Log',
        body: `Test log for **${eventInput}** created by <@${interaction.user.id}> (${interaction.user.tag}).`,
        actorUserId: interaction.user.id
      });

      if (result?.reason === 'NO_LOG_MODULE_CHANNEL') {
        await replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'No Log Module Channel Configured',
            description: `No Discord log was sent because **${eventInput}** does not have a configured module or event channel. Use \`/logging setup\` or \`/logging set-channel\` first.`,
            color: SlickBotColors.WARNING
          })]
        });
        return;
      }

      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Test Log Sent', `Successfully sent a test log for **${eventInput}** into <#${result.channelId}>.`)]
      });
      return;
    }

  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const queryText = String(focused?.value || '').toLowerCase().trim();

    if (focused.name === 'module') {
      const choices = LogModuleCatalog.map((m) => ({ name: `${m.label} (${m.key})`.slice(0, 100), value: m.key }));
      const filtered = choices.filter(
        (c) => c.name.toLowerCase().includes(queryText) || c.value.toLowerCase().includes(queryText)
      ).slice(0, 25);
      await interaction.respond(filtered).catch(() => {});
      return;
    }

    if (focused.name === 'event') {
      const allChoices = [
        { name: '🧪 Test All 6 Hubs (all)', value: 'all' },
        ...LogEventCatalog.map((e) => ({ name: `${e.label} (${e.key})`.slice(0, 100), value: e.key }))
      ];
      const filtered = allChoices.filter(
        (c) => c.name.toLowerCase().includes(queryText) || c.value.toLowerCase().includes(queryText)
      ).slice(0, 25);
      await interaction.respond(filtered).catch(() => {});
      return;
    }
  }
};
