const { query } = require('../../services/db');
const { analyticsService } = require('./analyticsService');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');
const { renderBarChart } = require('./analyticsUi');

class AnalyticsDigestRunner {
  /**
   * Build and post an executive summary digest to the configured staff digest channel
   */
  async sendGuildDigest(guildId, client, logger = null, isManual = false) {
    if (!guildId || !client) return { ok: false, reason: 'Missing guildId or client' };

    const config = await analyticsService.getConfig(guildId);
    if (!config.digest_channel_id) {
      return { ok: false, reason: 'No digest channel configured for this server.' };
    }

    const channel = client.channels.cache.get(config.digest_channel_id) || (await client.channels.fetch(config.digest_channel_id).catch(() => null));
    if (!channel || !channel.isTextBased()) {
      return { ok: false, reason: 'Configured digest channel could not be resolved or is not text-based.' };
    }

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    const guildName = guild ? guild.name : 'Server';
    const isMonthly = config.digest_frequency === 'MONTHLY';
    const days = isMonthly ? 30 : 7;

    const [overview, channelData, staffData] = await Promise.all([
      analyticsService.getOverview(guildId, days),
      analyticsService.getChannelActivity(guildId, days, 'most_active', client),
      analyticsService.getStaffPerformance(guildId, days, null, client)
    ]);

    const timeframeLabel = isMonthly ? 'Monthly Executive Summary' : 'Weekly Community Pulse';
    const netGrowthStr = overview.netMemberGrowth >= 0 ? `+${overview.netMemberGrowth}` : `${overview.netMemberGrowth}`;
    const healthBar = renderBarChart(overview.healthScore, 100, 10);

    const topChannelsList = channelData.channels.slice(0, 3).map((ch, i) => {
      const icon = ch.type === 'voice' ? '🔊' : '#';
      return `\`${i + 1}.\` **${icon} ${ch.name}** — ${ch.messages.toLocaleString()} msgs (${ch.activityPercent}%)`;
    });

    const topStaffList = staffData.staff.slice(0, 3).map((st, i) => {
      const name = st.userTag || `<@${st.userId}>`;
      return `\`${i + 1}.\` **${name}** — ${st.totalActions} actions (${st.warns}w · ${st.timeouts}t · ${st.bans}b · ${st.ticketsClosed} tickets)`;
    });

    const embed = createBaseEmbed({
      title: `📊 ${timeframeLabel} • ${guildName}`,
      description: [
        `Automated server health and activity report for the past **${days} days**.`,
        '',
        `**📈 Community Health Score: ${overview.healthScore}%** \`[${healthBar}]\``,
        '',
        '**💬 Chat & Voice Velocity**',
        `• Total Messages: **${overview.totalMessages.toLocaleString()}** (24h: ${overview.messages24h.toLocaleString()})`,
        `• Voice Participation: **${overview.voiceHours}** hours (${overview.totalVoiceMinutes.toLocaleString()} min)`,
        `• Active Channels: **${channelData.activeChannelCount}** · Ghost Channels: **${channelData.ghostChannelCount}**`,
        '',
        '**👥 Growth & Retention**',
        `• Net Growth: **${netGrowthStr}** members`,
        `• New Joins: **${overview.totalJoins.toLocaleString()}** · Leaves: **${overview.totalLeaves.toLocaleString()}**`,
        `• Verification Rate: **${overview.verificationRate}%**`,
        '',
        '**🏆 Top Active Channels**',
        topChannelsList.length ? topChannelsList.join('\n') : '• *No channel messages recorded.*',
        '',
        '**🛡️ Staff Moderation & Support**',
        topStaffList.length ? topStaffList.join('\n') : '• *No staff moderation actions in this period.*',
        '',
        isManual ? '*(On-Demand Executive Dispatch)*' : `*(Scheduled Executive Dispatch · Next run in ${isMonthly ? '30' : '7'} days)*`
      ].join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: `SlickBot Executive Digest • Generated for Staff Review`
    });

    await channel.send({ embeds: [embed] });

    if (logger && typeof logger.log === 'function') {
      await logger.log({
        guildId,
        eventKey: 'analytics-digest',
        title: 'Executive Digest Dispatched',
        body: `Posted ${timeframeLabel} to <#${channel.id}>.`,
        metadata: { channelId: channel.id, isManual, days }
      }).catch(() => {});
    }

    return { ok: true, channelId: channel.id };
  }

  /**
   * Check and dispatch scheduled digests across all active guilds
   */
  async processScheduledDigests(readyClient, logger = null) {
    if (!readyClient) return;
    const now = new Date();
    const currentUtcDay = now.getUTCDay() === 0 ? 7 : now.getUTCDay(); // 1 = Mon, 7 = Sun
    const currentUtcDate = now.getUTCDate();
    const currentUtcHour = now.getUTCHours();

    try {
      const res = await query(
        `SELECT guild_id, digest_channel_id, digest_frequency, digest_day_of_week, digest_hour_utc
         FROM analytics_configs
         WHERE enabled = true AND digest_frequency != 'OFF' AND digest_channel_id IS NOT NULL`
      );

      for (const config of res.rows) {
        const guildId = config.guild_id;
        const targetHour = Number(config.digest_hour_utc) || 14;
        if (currentUtcHour !== targetHour) continue;

        if (config.digest_frequency === 'WEEKLY') {
          const targetDay = Number(config.digest_day_of_week) || 1;
          if (currentUtcDay === targetDay) {
            await this.sendGuildDigest(guildId, readyClient, logger).catch(() => {});
          }
        } else if (config.digest_frequency === 'MONTHLY') {
          if (currentUtcDate === 1) {
            await this.sendGuildDigest(guildId, readyClient, logger).catch(() => {});
          }
        }
      }
    } catch (e) {
      if (logger && typeof logger.error === 'function') {
        logger.error(`Failed to process scheduled digests: ${e.message}`, { error: e });
      }
    }
  }
}

const analyticsDigest = new AnalyticsDigestRunner();

module.exports = {
  AnalyticsDigestRunner,
  analyticsDigest
};
