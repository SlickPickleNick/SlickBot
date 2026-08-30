const {
  AttachmentBuilder,
  ChannelType,
  SlashCommandBuilder
} = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../modules/ui/uiService');
const { analyticsService } = require('../modules/analytics/analyticsService');
const {
  buildOverviewEmbed,
  buildActivityHeatmapEmbed,
  buildRetentionEmbed,
  buildChannelActivityEmbed,
  buildStaffActivityEmbed,
  buildAnalyticsManagerPanel
} = require('../modules/analytics/analyticsUi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('Server analytics, peak engagement heatmaps, retention funnels, and ghost channel audits.')
    .addSubcommand((sub) =>
      sub
        .setName('overview')
        .setDescription('High-level server engagement dashboard with message/voice velocity and growth.')
        .addStringOption((opt) =>
          opt
            .setName('timeframe')
            .setDescription('Timeframe window to analyze')
            .setRequired(false)
            .addChoices(
              { name: '7 Days', value: '7' },
              { name: '30 Days (Default)', value: '30' },
              { name: '90 Days', value: '90' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('activity')
        .setDescription('Hourly & day-of-week engagement heatmaps and peak announcement windows.')
        .addStringOption((opt) =>
          opt
            .setName('metric')
            .setDescription('Activity metric to visualize')
            .setRequired(false)
            .addChoices(
              { name: 'Chat Messages (Default)', value: 'messages' },
              { name: 'Voice Minutes', value: 'voice' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('timeframe')
            .setDescription('Timeframe window')
            .setRequired(false)
            .addChoices(
              { name: '7 Days', value: '7' },
              { name: '30 Days (Default)', value: '30' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('retention')
        .setDescription('New member conversion funnel, cohort survival rates, and referral sources.')
        .addStringOption((opt) =>
          opt
            .setName('timeframe')
            .setDescription('Timeframe window')
            .setRequired(false)
            .addChoices(
              { name: '30 Days (Default)', value: '30' },
              { name: '90 Days', value: '90' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('channels')
        .setDescription('Channel activity leaderboard and dormant ghost channel audit.')
        .addStringOption((opt) =>
          opt
            .setName('sort')
            .setDescription('Channel sorting order')
            .setRequired(false)
            .addChoices(
              { name: 'Most Active Channels (Default)', value: 'most_active' },
              { name: 'Least Active Channels', value: 'least_active' },
              { name: 'Ghost Channels (< 5 msgs in 30d)', value: 'ghost' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('staff')
        .setDescription('Staff moderation actions, case distribution, and support KPIs.')
        .addUserOption((opt) =>
          opt
            .setName('staff_member')
            .setDescription('Filter metrics for a specific staff member')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('timeframe')
            .setDescription('Timeframe window')
            .setRequired(false)
            .addChoices(
              { name: '7 Days', value: '7' },
              { name: '30 Days (Default)', value: '30' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure scheduled executive summary staff digests.')
        .addChannelOption((opt) =>
          opt
            .setName('digest_channel')
            .setDescription('Staff channel to post weekly/monthly executive digests')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('frequency')
            .setDescription('Digest frequency')
            .setRequired(false)
            .addChoices(
              { name: 'Weekly (Mondays at 14:00 UTC)', value: 'WEEKLY' },
              { name: 'Monthly (1st of month)', value: 'MONTHLY' },
              { name: 'Disable Digests', value: 'OFF' }
            )
        )
        .addIntegerOption((opt) =>
          opt
            .setName('day')
            .setDescription('Day of week for weekly digests (1 = Monday, 7 = Sunday)')
            .setMinValue(1)
            .setMaxValue(7)
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('hour_utc')
            .setDescription('Hour in UTC (0 - 23, default 14:00 UTC)')
            .setMinValue(0)
            .setMaxValue(23)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('export')
        .setDescription('Export raw server analytics datasets as a downloadable CSV or JSON file.')
        .addStringOption((opt) =>
          opt
            .setName('timeframe')
            .setDescription('Timeframe window')
            .setRequired(false)
            .addChoices(
              { name: '7 Days', value: '7' },
              { name: '30 Days (Default)', value: '30' },
              { name: '90 Days', value: '90' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('format')
            .setDescription('Export file format')
            .setRequired(false)
            .addChoices(
              { name: 'CSV Document (Default)', value: 'csv' },
              { name: 'JSON Document', value: 'json' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('manager')
        .setDescription('Open the interactive Server Analytics management panel.')
    ),

  actionKey: ActionKeys.AnalyticsView,
  moduleKey: ModuleKeys.ANALYTICS,

  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand?.();
    if (sub === 'overview') return ActionKeys.AnalyticsView;
    if (sub === 'activity') return ActionKeys.AnalyticsActivity;
    if (sub === 'retention') return ActionKeys.AnalyticsRetention;
    if (sub === 'channels') return ActionKeys.AnalyticsChannels;
    if (sub === 'staff') return ActionKeys.AnalyticsStaff;
    if (sub === 'setup' || sub === 'manager') return ActionKeys.AnalyticsManage;
    if (sub === 'export') return ActionKeys.AnalyticsExport;
    return ActionKeys.AnalyticsView;
  },

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guildName = interaction.guild ? interaction.guild.name : 'Server';

    // 1. Overview
    if (sub === 'overview') {
      const days = Number(interaction.options.getString('timeframe') || '30');
      const overviewData = await analyticsService.getOverview(guildId, days);
      const embed = buildOverviewEmbed(overviewData, guildName);
      await replyPrivate(interaction, { embeds: [embed] });
      return;
    }

    // 2. Activity Heatmap
    if (sub === 'activity') {
      const metric = interaction.options.getString('metric') || 'messages';
      const days = Number(interaction.options.getString('timeframe') || '30');
      const heatmapData = await analyticsService.getActivityHeatmap(guildId, days, metric);
      const embed = buildActivityHeatmapEmbed(heatmapData, guildName);
      await replyPrivate(interaction, { embeds: [embed] });
      return;
    }

    // 3. Retention Funnel
    if (sub === 'retention') {
      const days = Number(interaction.options.getString('timeframe') || '30');
      const retentionData = await analyticsService.getRetentionFunnel(guildId, days);
      const embed = buildRetentionEmbed(retentionData, guildName);
      await replyPrivate(interaction, { embeds: [embed] });
      return;
    }

    // 4. Channel Activity & Ghost Channels
    if (sub === 'channels') {
      const sort = interaction.options.getString('sort') || 'most_active';
      const channelData = await analyticsService.getChannelActivity(guildId, 30, sort, interaction.client);
      const embed = buildChannelActivityEmbed(channelData, guildName, sort);
      await replyPrivate(interaction, { embeds: [embed] });
      return;
    }

    // 5. Staff Performance
    if (sub === 'staff') {
      const staffUser = interaction.options.getUser('staff_member');
      const days = Number(interaction.options.getString('timeframe') || '30');
      const staffData = await analyticsService.getStaffPerformance(guildId, days, staffUser?.id || null, interaction.client);
      const embed = buildStaffActivityEmbed(staffData, guildName);
      await replyPrivate(interaction, { embeds: [embed] });
      return;
    }

    // 6. Setup Digests
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('digest_channel');
      const frequency = interaction.options.getString('frequency');
      const day = interaction.options.getInteger('day');
      const hourUtc = interaction.options.getInteger('hour_utc');

      const updates = {};
      if (channel) updates.digest_channel_id = channel.id;
      if (frequency) updates.digest_frequency = frequency;
      if (day !== null) updates.digest_day_of_week = day;
      if (hourUtc !== null) updates.digest_hour_utc = hourUtc;

      const updated = await analyticsService.updateConfig(guildId, updates);
      await ctx.logger?.writeAudit?.({
        guildId,
        actorUserId: interaction.user.id,
        actionKey: ActionKeys.AnalyticsManage,
        targetType: 'AnalyticsConfig',
        targetId: guildId,
        details: `Updated analytics digest settings: freq=${updated.digest_frequency}, ch=${updated.digest_channel_id || 'none'}`
      }).catch(() => {});

      const embed = createSuccessEmbed({
        title: '📊 Analytics Digest Configured',
        description: [
          'Executive staff digest settings updated successfully:',
          `• **Digest Channel:** ${updated.digest_channel_id ? `<#${updated.digest_channel_id}>` : '*Not set*'}`,
          `• **Frequency:** **${updated.digest_frequency}**`,
          `• **Schedule:** Day ${updated.digest_day_of_week} at ${updated.digest_hour_utc}:00 UTC`
        ].join('\n')
      });
      await replyPrivate(interaction, { embeds: [embed] });
      return;
    }

    // 7. Export Data
    if (sub === 'export') {
      const days = Number(interaction.options.getString('timeframe') || '30');
      const format = (interaction.options.getString('format') || 'csv').toLowerCase();
      const payload = await analyticsService.exportData(guildId, days, format);

      const ext = format === 'json' ? 'json' : 'csv';
      const file = new AttachmentBuilder(Buffer.from(payload, 'utf8'), {
        name: `slickbot-analytics-${guildId}-${days}d.${ext}`
      });

      await replyPrivate(interaction, {
        content: `Here is your **${days}-day** server analytics data export in **${format.toUpperCase()}** format:`,
        files: [file]
      });
      return;
    }

    // 8. Manager Panel
    if (sub === 'manager') {
      const config = await analyticsService.getConfig(guildId);
      const overview = await analyticsService.getOverview(guildId, 30);
      const panel = buildAnalyticsManagerPanel(config, overview, guildName);
      await replyPrivate(interaction, panel);
      return;
    }
  }
};
