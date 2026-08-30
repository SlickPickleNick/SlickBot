const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, SlickBotColors, formatEnabled } = require('../ui/uiService');

/**
 * Render a Unicode bar chart with custom length and shading
 */
function renderBarChart(value, max, length = 10) {
  if (!max || max <= 0 || !value || value <= 0) {
    return '░'.repeat(length);
  }
  const ratio = Math.max(0, Math.min(1, value / max));
  const fullBlocks = Math.floor(ratio * length);
  const remainder = (ratio * length) - fullBlocks;

  let bar = '█'.repeat(fullBlocks);
  if (fullBlocks < length) {
    if (remainder >= 0.66) bar += '▓';
    else if (remainder >= 0.33) bar += '▒';
    else if (remainder > 0) bar += '░';
  }
  while (bar.length < length) {
    bar += '░';
  }
  return bar.slice(0, length);
}

/**
 * Render ASCII sparklines
 */
function renderSparkline(values) {
  if (!Array.isArray(values) || values.length === 0) return ' ';
  const sparks = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return sparks[3].repeat(values.length);

  return values
    .map((v) => {
      const idx = Math.min(7, Math.max(0, Math.round(((v - min) / (max - min)) * 7)));
      return sparks[idx];
    })
    .join('');
}

/**
 * Build Server Overview Embed
 */
function buildOverviewEmbed(data, guildName = 'Server') {
  const healthEmoji = data.healthScore >= 80 ? '🟢' : data.healthScore >= 50 ? '🟡' : '🔴';
  const healthBar = renderBarChart(data.healthScore, 100, 12);
  const netGrowthStr = data.netMemberGrowth >= 0 ? `+${data.netMemberGrowth}` : `${data.netMemberGrowth}`;

  const embed = createBaseEmbed({
    title: `📊 Server Analytics Overview • ${guildName}`,
    description: [
      `Aggregated engagement metrics for the last **${data.timeframeDays} days**.`,
      '',
      `**📈 Community Health Score: ${data.healthScore}%** ${healthEmoji}`,
      `\`[${healthBar}]\` (${data.healthScore}/100)`,
      '',
      '**💬 Message & Chat Velocity**',
      `• Total Messages: **${data.totalMessages.toLocaleString()}**`,
      `• Last 24 Hours: **${data.messages24h.toLocaleString()}** msgs`,
      `• Active Channels: **${data.activeChannels}** channels`,
      '',
      '**🔊 Voice Participation**',
      `• Total Voice Time: **${data.voiceHours.toLocaleString()}** hours (${data.totalVoiceMinutes.toLocaleString()} min)`,
      `• Last 24 Hours: **${data.voiceHours24h}** hours`,
      '',
      '**👥 Member Flow & Retention**',
      `• Net Growth: **${netGrowthStr}** members`,
      `• Total Joins: **${data.totalJoins.toLocaleString()}** · Leaves: **${data.totalLeaves.toLocaleString()}**`,
      `• Verification Rate: **${data.verificationRate}%** (${data.totalVerified} verified)`,
      '',
      '**🛡️ Moderation & Support Pulse**',
      `• Moderation Cases: **${data.totalModCases}** (${data.staffWarns} warns · ${data.staffTimeouts} timeouts · ${data.staffBans} bans)`,
      `• Active Support Tickets: **${data.openTickets}** open`
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Analytics Engine • ${data.timeframeDays}d Window`
  });

  return embed;
}

/**
 * Build Activity Heatmap Embed
 */
function buildActivityHeatmapEmbed(data, guildName = 'Server') {
  const isVoice = data.metric === 'voice';
  const unit = isVoice ? 'min' : 'msgs';

  // Group into 4-hour buckets for compact discord visual representation
  const blockTotals = [
    { label: '12 AM – 04 AM', sum: 0 },
    { label: '04 AM – 08 AM', sum: 0 },
    { label: '08 AM – 12 PM', sum: 0 },
    { label: '12 PM – 04 PM', sum: 0 },
    { label: '04 PM – 08 PM', sum: 0 },
    { label: '08 PM – 12 AM', sum: 0 }
  ];

  const heatmap = Array.isArray(data?.heatmap) ? data.heatmap : [];
  heatmap.forEach((cell) => {
    const blockIdx = Math.min(5, Math.floor((cell.hour || 0) / 4));
    blockTotals[blockIdx].sum += (cell.count || 0);
  });

  const maxBlock = Math.max(...blockTotals.map((b) => b.sum), 1);

  const blockLines = blockTotals.map((b) => {
    const bar = renderBarChart(b.sum, maxBlock, 10);
    const isPeak = b.sum === maxBlock && b.sum > 0;
    return `\`${b.label}\` ${bar} **${b.sum.toLocaleString()}** ${unit}${isPeak ? ' 🔥 **PEAK**' : ''}`;
  });

  // Day of week bars
  const dowList = Array.isArray(data?.dowStats) ? data.dowStats : Array.isArray(data?.dowTotals) ? data.dowTotals : [];
  const maxDow = Math.max(...dowList.map((d) => d.total || 0), 1);
  const dowLines = dowList.length
    ? dowList.map((d) => {
        const bar = renderBarChart(d.total || 0, maxDow, 8);
        const shortDay = (d.day || '').slice(0, 3);
        return `\`${shortDay}\` ${bar} ${(d.total || 0).toLocaleString()}`;
      })
    : ['• *No daily activity recorded yet in this window.*'];

  const embed = createBaseEmbed({
    title: `🔥 Peak Engagement Heatmap • ${guildName}`,
    description: [
      `Analyzing hourly ${isVoice ? 'voice minutes' : 'message volume'} over the last **${data.timeframeDays} days**.`,
      '',
      `**🎯 Optimal Announcement Window:**`,
      `**${data.peakWindowRecommendation}**`,
      '',
      '**⏰ Hourly Activity Blocks (UTC)**',
      ...blockLines,
      '',
      '**📅 Day of Week Volume**',
      ...dowLines
    ].join('\n'),
    color: SlickBotColors.WARNING,
    footer: `Tip: Schedule high-priority announcements during peak windows for 3-5x higher impressions.`
  });

  return embed;
}

/**
 * Build Member Retention Funnel Embed
 */
function buildRetentionEmbed(data, guildName = 'Server') {
  const d1Bar = renderBarChart(data.retentionCohorts.day1, 100, 10);
  const d7Bar = renderBarChart(data.retentionCohorts.day7, 100, 10);
  const d30Bar = renderBarChart(data.retentionCohorts.day30, 100, 10);
  const convBar = renderBarChart(data.conversionRate, 100, 10);

  const referralLines = data.topReferrals.length
    ? data.topReferrals.map((rf) => `• \`${rf.code}\` (${rf.title}): **${rf.attributedJoins}** joins · ${rf.uses} total clicks`)
    : ['• *No custom referral codes tracked yet (use `/referral create`).*'];

  const embed = createBaseEmbed({
    title: `👥 Member Retention & Funnel • ${guildName}`,
    description: [
      `New member conversion and cohort survival over **${data.timeframeDays} days**.`,
      '',
      '**🎯 Conversion Funnel**',
      `• Total Joins: **${data.totalJoins.toLocaleString()}**`,
      `• Onboarding / Verified: **${data.totalVerified.toLocaleString()}** (\`${convBar}\` ${data.conversionRate}%)`,
      `• Net Member Growth: **${data.netGrowth >= 0 ? '+' : ''}${data.netGrowth}**`,
      '',
      '**📊 Retention Cohorts**',
      `• Day 1 Retention:  \`${d1Bar}\` **${data.retentionCohorts.day1}%**`,
      `• Day 7 Retention:  \`${d7Bar}\` **${data.retentionCohorts.day7}%**`,
      `• Day 30 Retention: \`${d30Bar}\` **${data.retentionCohorts.day30}%**`,
      '',
      '**🔗 Top Referral Sources**',
      ...referralLines
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: `SlickBot Retention Funnel • ${data.timeframeDays}d Window`
  });

  return embed;
}

/**
 * Build Channel Activity & Ghost Channel Audit Embed
 */
function buildChannelActivityEmbed(data, guildName = 'Server', sort = 'most_active') {
  const topList = data.channels.slice(0, 8);
  const maxMsgs = Math.max(...topList.map((c) => c.messages), 1);

  const channelLines = topList.map((ch) => {
    const icon = ch.type === 'voice' ? '🔊' : '#';
    const bar = renderBarChart(ch.messages, maxMsgs, 8);
    return `• **${icon} ${ch.name}**: \`${bar}\` **${ch.messages.toLocaleString()}** msgs (${ch.activityPercent}%)`;
  });

  const ghostLines = data.ghostChannels.length
    ? data.ghostChannels.slice(0, 6).map((ch) => `• <#${ch.id}> (${ch.messages} msgs in ${data.channels.length ? '30d' : ''})`)
    : ['• ✅ *No dormant ghost channels found! All channels active.*'];

  const embed = createBaseEmbed({
    title: `📡 Channel Engagement & Ghost Audit • ${guildName}`,
    description: [
      `Server channel traffic distribution (${sort === 'ghost' ? 'Ghost Sort' : 'Activity Rank'}).`,
      '',
      `**📊 Total Channel Messages:** **${data.totalMessages.toLocaleString()}** across **${data.channels.length}** channels`,
      `**Active Channels:** ${data.activeChannelCount} · **Ghost Channels:** ${data.ghostChannelCount}`,
      '',
      '**🏆 Top Active Channels**',
      ...channelLines,
      '',
      '**👻 Ghost Channels (< 5 msgs in 30 days)**',
      ...ghostLines,
      data.ghostChannels.length > 6 ? `*+${data.ghostChannels.length - 6} more ghost channels...*` : '',
      '',
      '💡 *Tip: Consolidate or archive dormant ghost channels to reduce clutter and focus community discussions.*'
    ].filter(Boolean).join('\n'),
    color: data.ghostChannels.length > 3 ? SlickBotColors.WARNING : SlickBotColors.PRIMARY,
    footer: `SlickBot Channel Audit • ${data.activeChannelCount} Active / ${data.ghostChannelCount} Ghost`
  });

  return embed;
}

/**
 * Build Staff Moderation & Support KPI Embed
 */
function buildStaffActivityEmbed(data, guildName = 'Server') {
  const staffLines = data.staff.length
    ? data.staff.slice(0, 10).map((st, idx) => {
        const name = st.userTag || `<@${st.userId}>`;
        return `**${idx + 1}. ${name}** — **${st.totalActions}** actions\n` +
               `   • Cases: ${st.warns} warns · ${st.timeouts} timeouts · ${st.kicks} kicks · ${st.bans} bans\n` +
               `   • Tickets: ${st.ticketsClaimed} claimed · ${st.ticketsClosed} closed`;
      })
    : ['• *No staff moderation or ticket actions recorded in this timeframe.*'];

  const embed = createBaseEmbed({
    title: `🛡️ Staff Moderation & Support Audit • ${guildName}`,
    description: [
      `Staff activity and case distribution over the last **${data.timeframeDays} days**.`,
      '',
      `**Total Staff Actions Recorded:** **${data.totalActions}**`,
      '',
      ...staffLines
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Staff Audit • ${data.timeframeDays}d Window`
  });

  return embed;
}

/**
 * Build Interactive Analytics Manager Panel
 */
function buildAnalyticsManagerPanel(config, overview, guildName = 'Server') {
  const isEnabled = config.enabled !== false;
  const digestChannelDisplay = config.digest_channel_id ? `<#${config.digest_channel_id}>` : '*Not configured*';
  const frequencyDisplay = config.digest_frequency === 'OFF' ? '❌ Disabled' : `📅 ${config.digest_frequency} (Day ${config.digest_day_of_week}, ${config.digest_hour_utc}:00 UTC)`;

  const embed = createBaseEmbed({
    title: `📊 Server Analytics Center • ${guildName}`,
    description: [
      `**Module Status:** ${formatEnabled(isEnabled)}`,
      '',
      '**⚙️ Scheduled Executive Staff Digest**',
      `• Channel: ${digestChannelDisplay}`,
      `• Frequency: **${frequencyDisplay}**`,
      `• Data Retention: **${config.retention_days} days**`,
      '',
      '**📈 30-Day Snapshot**',
      `• Total Messages: **${(overview?.totalMessages || 0).toLocaleString()}** (24h: ${(overview?.messages24h || 0).toLocaleString()})`,
      `• Voice Hours: **${overview?.voiceHours || 0} hrs** (24h: ${overview?.voiceHours24h || 0} hrs)`,
      `• Net Growth: **${overview?.netMemberGrowth >= 0 ? '+' : ''}${overview?.netMemberGrowth || 0}** members`,
      `• Health Score: **${overview?.healthScore || 50}%**`,
      '',
      'Use the interactive buttons below to configure automated digests, export full CSV/JSON reports, or trigger on-demand reports.'
    ].join('\n'),
    color: isEnabled ? SlickBotColors.PRIMARY : SlickBotColors.MUTED,
    footer: 'SlickBot Analytics Center • In-Memory Buffer & 5-Min Flush'
  });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CustomIds.AnalyticsRefresh)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄'),
    new ButtonBuilder()
      .setCustomId(CustomIds.AnalyticsToggle)
      .setLabel(isEnabled ? 'Pause Tracking' : 'Enable Tracking')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setEmoji(isEnabled ? '⏸️' : '▶️'),
    new ButtonBuilder()
      .setCustomId(CustomIds.AnalyticsSendDigestNow)
      .setLabel('Send Digest Now')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📬')
      .setDisabled(!config.digest_channel_id),
    new ButtonBuilder()
      .setCustomId(CustomIds.AnalyticsExportModal)
      .setLabel('Export Data')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📥')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(CustomIds.AnalyticsDigestChannelSelect)
      .setPlaceholder('Select staff channel for weekly/monthly digests...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CustomIds.AnalyticsFrequencySelect)
      .setPlaceholder('Select executive digest frequency...')
      .addOptions([
        { label: 'Weekly on Mondays (Recommended)', value: 'WEEKLY', description: 'Posts full executive report every Monday at 14:00 UTC', default: config.digest_frequency === 'WEEKLY' },
        { label: 'Monthly (1st of month)', value: 'MONTHLY', description: 'Posts monthly overview on the 1st of every month', default: config.digest_frequency === 'MONTHLY' },
        { label: 'Disable Scheduled Digests', value: 'OFF', description: 'Disable automated executive digests', default: config.digest_frequency === 'OFF' }
      ])
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = {
  renderBarChart,
  renderSparkline,
  buildOverviewEmbed,
  buildActivityHeatmapEmbed,
  buildRetentionEmbed,
  buildChannelActivityEmbed,
  buildStaffActivityEmbed,
  buildAnalyticsManagerPanel
};
