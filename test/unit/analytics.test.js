const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AnalyticsBuffer,
  analyticsBuffer,
  getHourBucketDate,
  getDateString
} = require('../../src/modules/analytics/analyticsBuffer');
const {
  AnalyticsService,
  analyticsService,
  DEFAULT_CONFIG
} = require('../../src/modules/analytics/analyticsService');
const {
  renderBarChart,
  renderSparkline,
  buildOverviewEmbed,
  buildActivityHeatmapEmbed,
  buildRetentionEmbed,
  buildChannelActivityEmbed,
  buildStaffActivityEmbed,
  buildAnalyticsManagerPanel
} = require('../../src/modules/analytics/analyticsUi');
const {
  AnalyticsDigestRunner,
  analyticsDigest
} = require('../../src/modules/analytics/analyticsDigest');
const { MockDatabase } = require('../helpers/mockDb');
const { ModuleKeys, defaultModules, implementedModules } = require('../../src/modules/moduleRegistry');
const { ActionKeys, defaultActionLevels, defaultModuleLevels } = require('../../src/modules/permissions/actionKeys');
const analyticsCmd = require('../../src/commands/analytics');
const { commands, commandMap } = require('../../src/commands');
const { CustomIds } = require('../../src/modules/ui/customIds');
const { getModuleStatus } = require('../../src/modules/ui/panels');

const mockDb = new MockDatabase();

test('Server Analytics & Engagement Pulse Module Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  const guildId = '111111111111111111';
  const channelId = '222222222222222222';
  const userId = '333333333333333333';

  // 1. In-Memory Buffer Tests
  await t.test('AnalyticsBuffer records and aggregates messages, unique chatters, and channels', () => {
    const buffer = new AnalyticsBuffer();
    buffer.recordMessage(guildId, channelId, 'user-1');
    buffer.recordMessage(guildId, channelId, 'user-2');
    buffer.recordMessage(guildId, channelId, 'user-1'); // Duplicate chatter

    const summary = buffer.getBufferSummary(guildId);
    assert.equal(summary.messages, 3);

    const hourKey = `${guildId}:${getHourBucketDate().toISOString()}`;
    const hourly = buffer.hourlyBuffer.get(hourKey);
    assert.ok(hourly);
    assert.equal(hourly.messageCount, 3);
    assert.equal(hourly.uniqueChatters.size, 2); // user-1 and user-2

    const channelKey = `${guildId}:${channelId}:${getDateString()}`;
    const channel = buffer.channelBuffer.get(channelKey);
    assert.ok(channel);
    assert.equal(channel.messageCount, 3);
    assert.equal(channel.uniqueAuthors.size, 2);
  });

  await t.test('AnalyticsBuffer records voice minutes, joins, leaves, and verifications', () => {
    const buffer = new AnalyticsBuffer();
    buffer.recordVoiceMinutes(guildId, userId, 15);
    buffer.recordMemberJoin(guildId, userId);
    buffer.recordMemberLeave(guildId, userId);
    buffer.recordMemberVerified(guildId, userId);

    const summary = buffer.getBufferSummary(guildId);
    assert.equal(summary.voiceMinutes, 15);
    assert.equal(summary.joins, 1);
    assert.equal(summary.leaves, 1);

    const flowKey = `${guildId}:${getDateString()}`;
    const flow = buffer.memberFlowBuffer.get(flowKey);
    assert.ok(flow);
    assert.equal(flow.joinsCount, 1);
    assert.equal(flow.leavesCount, 1);
    assert.equal(flow.verifiedCount, 1);
  });

  await t.test('AnalyticsBuffer records staff moderation and ticket actions', () => {
    const buffer = new AnalyticsBuffer();
    buffer.recordStaffAction(guildId, 'staff-1', 'warn');
    buffer.recordStaffAction(guildId, 'staff-1', 'timeout');
    buffer.recordStaffAction(guildId, 'staff-1', 'kick');
    buffer.recordStaffAction(guildId, 'staff-1', 'ban');
    buffer.recordStaffAction(guildId, 'staff-1', 'ticket_claim');
    buffer.recordStaffAction(guildId, 'staff-1', 'ticket_close');

    const staffKey = `${guildId}:staff-1:${getDateString()}`;
    const staff = buffer.staffBuffer.get(staffKey);
    assert.ok(staff);
    assert.equal(staff.warnsCount, 1);
    assert.equal(staff.timeoutsCount, 1);
    assert.equal(staff.kicksCount, 1);
    assert.equal(staff.bansCount, 1);
    assert.equal(staff.ticketsClaimedCount, 1);
    assert.equal(staff.ticketsClosedCount, 1);
  });

  await t.test('AnalyticsBuffer.flush safely flushes memory buffers into database tables', async () => {
    const buffer = new AnalyticsBuffer();
    buffer.recordMessage(guildId, channelId, userId);
    buffer.recordVoiceMinutes(guildId, userId, 20);
    buffer.recordMemberJoin(guildId, userId);
    buffer.recordStaffAction(guildId, 'staff-1', 'warn');

    let hourlyFlushed = false;
    let channelFlushed = false;
    let memberFlowFlushed = false;
    let staffFlushed = false;

    mockDb.addHandler('INSERT INTO analytics_hourly_activity', () => {
      hourlyFlushed = true;
      return { rowCount: 1 };
    });
    mockDb.addHandler('INSERT INTO analytics_channel_activity', () => {
      channelFlushed = true;
      return { rowCount: 1 };
    });
    mockDb.addHandler('INSERT INTO analytics_member_flow', () => {
      memberFlowFlushed = true;
      return { rowCount: 1 };
    });
    mockDb.addHandler('INSERT INTO analytics_staff_activity', () => {
      staffFlushed = true;
      return { rowCount: 1 };
    });

    const res = await buffer.flush();
    assert.ok(res.flushedCount >= 4);
    assert.equal(hourlyFlushed, true);
    assert.equal(channelFlushed, true);
    assert.equal(memberFlowFlushed, true);
    assert.equal(staffFlushed, true);

    // Buffers should be empty after flush
    assert.equal(buffer.hourlyBuffer.size, 0);
    assert.equal(buffer.channelBuffer.size, 0);
    assert.equal(buffer.memberFlowBuffer.size, 0);
    assert.equal(buffer.staffBuffer.size, 0);
  });

  // 2. Analytics Service Configuration & Query Tests
  await t.test('AnalyticsService.getConfig returns default configuration when none exists', async () => {
    const service = new AnalyticsService();
    mockDb.addHandler('SELECT * FROM analytics_configs', () => ({ rows: [] }));

    const config = await service.getConfig(guildId);
    assert.equal(config.guild_id, guildId);
    assert.equal(config.enabled, true);
    assert.equal(config.digest_frequency, 'WEEKLY');
    assert.equal(config.digest_day_of_week, 1);
    assert.equal(config.digest_hour_utc, 14);
    assert.equal(config.retention_days, 90);
  });

  await t.test('AnalyticsService.updateConfig updates digest settings and frequency', async () => {
    const service = new AnalyticsService();
    let savedRow = null;

    mockDb.addHandler('INSERT INTO analytics_configs', (text, params) => {
      savedRow = {
        guild_id: params[0],
        enabled: params[1],
        digest_channel_id: params[2],
        digest_frequency: params[3],
        digest_day_of_week: params[4],
        digest_hour_utc: params[5],
        retention_days: params[6]
      };
      return { rowCount: 1 };
    });
    mockDb.addHandler('SELECT * FROM analytics_configs', () => ({
      rows: savedRow ? [savedRow] : []
    }));

    const updated = await service.updateConfig(guildId, {
      digest_channel_id: '999999999999999999',
      digest_frequency: 'MONTHLY',
      digest_hour_utc: 16
    });

    assert.equal(updated.digest_channel_id, '999999999999999999');
    assert.equal(updated.digest_frequency, 'MONTHLY');
    assert.equal(updated.digest_hour_utc, 16);
  });

  await t.test('AnalyticsService.getOverview computes velocity, health score, and totals', async () => {
    const service = new AnalyticsService();

    mockDb.addHandler('total_messages', () => ({
      rows: [{ total_messages: 500, total_voice_minutes: 300, peak_chatters: 25, peak_voice: 8 }]
    }));
    mockDb.addHandler('messages_24h', () => ({
      rows: [{ messages_24h: 120, voice_minutes_24h: 60, chatters_24h: 15 }]
    }));
    mockDb.addHandler('FROM analytics_member_flow', () => ({
      rows: [{ total_joins: 30, total_leaves: 5, total_verified: 27 }]
    }));
    mockDb.addHandler('FROM analytics_staff_activity', () => ({
      rows: [{ total_warns: 4, total_timeouts: 2, total_kicks: 1, total_bans: 1, total_closed_tickets: 8 }]
    }));
    mockDb.addHandler('FROM moderation_cases', () => ({
      rows: [{ count: 8 }]
    }));
    mockDb.addHandler('FROM tickets', () => ({
      rows: [{ count: 2 }]
    }));

    const overview = await service.getOverview(guildId, 30);
    assert.ok(overview);
    assert.equal(overview.totalMessages >= 500, true);
    assert.equal(overview.totalJoins, 30);
    assert.equal(overview.totalLeaves, 5);
    assert.equal(overview.netMemberGrowth, 25);
    assert.equal(overview.verificationRate, 90);
    assert.equal(overview.voiceHours, 5.0);
    assert.equal(overview.totalModCases, 8);
    assert.equal(overview.healthScore >= 80, true);
  });

  await t.test('AnalyticsService.getActivityHeatmap constructs 7x24 grid and recommends peak window', async () => {
    const service = new AnalyticsService();

    mockDb.addHandler('FROM analytics_hourly_activity', () => ({
      rows: [
        { day: 5, hour: 20, messages: 150, voice_minutes: 80 }, // Friday 8PM
        { day: 6, hour: 20, messages: 200, voice_minutes: 120 }, // Saturday 8PM
        { day: 1, hour: 10, messages: 30, voice_minutes: 10 }
      ]
    }));

    const heatmap = await service.getActivityHeatmap(guildId, 30, 'messages');
    assert.equal(heatmap.heatmap.length, 168); // 7 * 24 cells
    assert.equal(heatmap.peakDay, 'Saturday');
    assert.ok(heatmap.peakWindowRecommendation.includes('Saturday'));
    assert.ok(heatmap.peakWindowRecommendation.includes('20:00'));
  });

  await t.test('AnalyticsService.getRetentionFunnel calculates cohort survival and referrals', async () => {
    const service = new AnalyticsService();

    mockDb.addHandler('FROM analytics_member_flow', () => ({
      rows: [
        { bucket_date: '2026-08-01', joins_count: 50, leaves_count: 10, verified_count: 45, retained_day_1: 45, retained_day_7: 40, retained_day_30: 35 }
      ]
    }));
    mockDb.addHandler('FROM referral_links', () => ({
      rows: [
        { code: 'VIP2026', title: 'Summer VIP', uses_count: 120, attributed_joins: 48 }
      ]
    }));

    const funnel = await service.getRetentionFunnel(guildId, 30);
    assert.ok(funnel);
    assert.equal(funnel.totalJoins, 50);
    assert.equal(funnel.totalLeaves, 10);
    assert.equal(funnel.netGrowth, 40);
    assert.equal(funnel.conversionRate, 90);
    assert.equal(funnel.topReferrals[0].code, 'VIP2026');
    assert.equal(funnel.topReferrals[0].attributedJoins, 48);
  });

  await t.test('AnalyticsService.getChannelActivity ranks traffic and detects ghost channels (< 5 msgs)', async () => {
    const service = new AnalyticsService();

    mockDb.addHandler('FROM analytics_channel_activity', () => ({
      rows: [
        { channel_id: 'ch-active-1', message_count: 450, unique_authors: 30 },
        { channel_id: 'ch-active-2', message_count: 200, unique_authors: 15 },
        { channel_id: 'ch-ghost-1', message_count: 2, unique_authors: 1 },
        { channel_id: 'ch-ghost-2', message_count: 0, unique_authors: 0 }
      ]
    }));

    const activity = await service.getChannelActivity(guildId, 30, 'most_active');
    assert.equal(activity.channels.length >= 4, true);
    assert.equal(activity.ghostChannels.length >= 2, true);
    assert.equal(activity.channels[0].id, 'ch-active-1');
    assert.equal(activity.channels[0].messages, 450);
  });

  await t.test('AnalyticsService.getStaffPerformance breaks down moderation and support metrics', async () => {
    const service = new AnalyticsService();

    mockDb.addHandler('FROM analytics_staff_activity', () => ({
      rows: [
        { staff_user_id: 'mod-1', warns: 5, timeouts: 3, kicks: 1, bans: 1, tickets_claimed: 10, tickets_closed: 8 },
        { staff_user_id: 'mod-2', warns: 2, timeouts: 1, kicks: 0, bans: 0, tickets_claimed: 4, tickets_closed: 4 }
      ]
    }));

    const result = await service.getStaffPerformance(guildId, 30);
    assert.equal(result.staff.length, 2);
    assert.equal(result.staff[0].userId, 'mod-1');
    assert.equal(result.staff[0].warns, 5);
    assert.equal(result.staff[0].ticketsClosed, 8);
    assert.equal(result.staff[0].totalActions, 18);
  });

  await t.test('AnalyticsService.exportData formats CSV and JSON exports', async () => {
    const service = new AnalyticsService();

    mockDb.addHandler('FROM analytics_hourly_activity', () => ({
      rows: [{ bucket_hour: '2026-08-30T14:00:00Z', message_count: 100, unique_chatters_count: 20, voice_minutes: 40, active_voice_count: 5 }]
    }));
    mockDb.addHandler('FROM analytics_channel_activity', () => ({
      rows: [{ channel_id: 'ch-1', bucket_date: '2026-08-30', message_count: 100, unique_authors_count: 20 }]
    }));
    mockDb.addHandler('FROM analytics_member_flow', () => ({
      rows: [{ bucket_date: '2026-08-30', joins_count: 10, leaves_count: 2, verified_count: 9, retained_day_1: 8, retained_day_7: 7, retained_day_30: 6 }]
    }));
    mockDb.addHandler('FROM analytics_staff_activity', () => ({
      rows: [{ staff_user_id: 'mod-1', bucket_date: '2026-08-30', warns_count: 1, timeouts_count: 0, kicks_count: 0, bans_count: 0, tickets_claimed_count: 2, tickets_closed_count: 2 }]
    }));

    const csv = await service.exportData(guildId, 30, 'csv');
    assert.ok(csv.includes('[HOURLY_ACTIVITY]'));
    assert.ok(csv.includes('[CHANNEL_ACTIVITY]'));
    assert.ok(csv.includes('[MEMBER_FLOW]'));
    assert.ok(csv.includes('[STAFF_ACTIVITY]'));

    const json = await service.exportData(guildId, 30, 'json');
    const parsed = JSON.parse(json);
    assert.equal(parsed.guildId, guildId);
    assert.equal(parsed.hourlyActivity.length, 1);
    assert.equal(parsed.memberFlow.length, 1);
  });

  // 3. UI Helpers and Embed Tests
  await t.test('Analytics UI visual chart helpers render correctly', () => {
    const barFull = renderBarChart(100, 100, 10);
    assert.equal(barFull, '██████████');

    const barHalf = renderBarChart(50, 100, 10);
    assert.equal(barHalf.startsWith('█████'), true);

    const barEmpty = renderBarChart(0, 100, 10);
    assert.equal(barEmpty, '░░░░░░░░░░');

    const spark = renderSparkline([10, 20, 50, 80, 100]);
    assert.equal(spark.length, 5);
  });

  await t.test('Analytics UI embed generators produce valid Discord embeds', () => {
    const overviewEmbed = buildOverviewEmbed({
      guildId,
      timeframeDays: 30,
      totalMessages: 5420,
      messages24h: 310,
      totalVoiceMinutes: 720,
      voiceHours: 12.0,
      voiceHours24h: 2.5,
      totalJoins: 45,
      totalLeaves: 8,
      netMemberGrowth: 37,
      totalVerified: 40,
      verificationRate: 89,
      activeChannels: 12,
      totalModCases: 6,
      openTickets: 1,
      staffWarns: 3,
      staffTimeouts: 2,
      staffBans: 1,
      healthScore: 92
    }, 'Slick Community');

    assert.ok(overviewEmbed.data.title.includes('Server Analytics Overview'));
    assert.ok(overviewEmbed.data.description.includes('92%'));
    assert.ok(overviewEmbed.data.description.includes('5,420'));

    const heatmapEmbed = buildActivityHeatmapEmbed({
      metric: 'messages',
      timeframeDays: 30,
      heatmap: [{ hour: 20, count: 50 }],
      peakWindowRecommendation: 'Friday | 20:00 – 23:00 UTC',
      dowStats: [{ day: 'Friday', total: 500 }]
    }, 'Slick Community');
    assert.ok(heatmapEmbed.data.title.includes('Peak Engagement Heatmap'));
    assert.ok(heatmapEmbed.data.description.includes('Friday | 20:00 – 23:00 UTC'));

    // Test with dowTotals fallback and empty heatmap
    const heatmapFallbackEmbed = buildActivityHeatmapEmbed({
      metric: 'voice',
      timeframeDays: 30,
      heatmap: [],
      peakWindowRecommendation: 'Saturday | 18:00 – 21:00 UTC',
      dowTotals: [{ day: 'Saturday', total: 300 }]
    }, 'Slick Community');
    assert.ok(heatmapFallbackEmbed.data.title.includes('Peak Engagement Heatmap'));
    assert.ok(heatmapFallbackEmbed.data.description.includes('Saturday | 18:00 – 21:00 UTC'));

    const panel = buildAnalyticsManagerPanel(DEFAULT_CONFIG, { totalMessages: 1000, voiceHours: 10, healthScore: 90 }, 'Slick Community');
    assert.equal(panel.embeds.length, 1);
    assert.equal(panel.components.length, 3);
  });

  // 4. Executive Digest Tests
  await t.test('AnalyticsDigestRunner.sendGuildDigest creates and dispatches digest embed', async () => {
    const mockChannel = {
      id: 'digest-ch-1',
      isTextBased: () => true,
      send: async (payload) => {
        assert.ok(payload.embeds);
        assert.ok(payload.embeds[0].data.title.includes('Community Pulse'));
        return { id: 'msg-1' };
      }
    };

    const mockClient = {
      channels: {
        cache: new Map([['digest-ch-1', mockChannel]]),
        fetch: async () => mockChannel
      },
      guilds: {
        cache: new Map([[guildId, { name: 'Test Guild' }]]),
        fetch: async () => ({ name: 'Test Guild' })
      }
    };

    mockDb.addHandler('SELECT * FROM analytics_configs', () => ({
      rows: [{ guild_id: guildId, enabled: true, digest_channel_id: 'digest-ch-1', digest_frequency: 'WEEKLY' }]
    }));
    mockDb.addHandler('FROM analytics_hourly_activity', () => ({
      rows: [{ total_messages: 200, total_voice_minutes: 120 }]
    }));
    mockDb.addHandler('FROM analytics_member_flow', () => ({
      rows: [{ total_joins: 10, total_leaves: 2, total_verified: 9 }]
    }));
    mockDb.addHandler('FROM analytics_channel_activity', () => ({
      rows: [{ channel_id: 'ch-1', message_count: 100, unique_authors: 10 }]
    }));
    mockDb.addHandler('FROM analytics_staff_activity', () => ({
      rows: [{ staff_user_id: 'staff-1', warns: 1, timeouts: 0, kicks: 0, bans: 0, tickets_claimed: 1, tickets_closed: 1 }]
    }));

    const result = await analyticsDigest.sendGuildDigest(guildId, mockClient, null, true);
    assert.equal(result.ok, true);
    assert.equal(result.channelId, 'digest-ch-1');
  });

  // 5. Slash Command Suite & Metadata Tests
  await t.test('/analytics slash command definition and subcommands', () => {
    assert.equal(analyticsCmd.data.name, 'analytics');
    assert.equal(analyticsCmd.moduleKey, ModuleKeys.ANALYTICS);
    assert.equal(analyticsCmd.actionKey, ActionKeys.AnalyticsView);

    const subcommands = analyticsCmd.data.options.map((opt) => opt.name);
    assert.ok(subcommands.includes('overview'));
    assert.ok(subcommands.includes('activity'));
    assert.ok(subcommands.includes('retention'));
    assert.ok(subcommands.includes('channels'));
    assert.ok(subcommands.includes('staff'));
    assert.ok(subcommands.includes('setup'));
    assert.ok(subcommands.includes('export'));
    assert.ok(subcommands.includes('manager'));
  });

  await t.test('analytics command is registered in command map', () => {
    assert.ok(commandMap.has('analytics'));
    assert.equal(commandMap.get('analytics'), analyticsCmd);
  });

  // 6. Permissions and Setup Center Health Tests
  await t.test('ANALYTICS module is registered in defaultModules, implementedModules, and permission action levels', () => {
    assert.ok(defaultModules.some((m) => m.key === ModuleKeys.ANALYTICS));
    assert.ok(implementedModules.includes(ModuleKeys.ANALYTICS));
    assert.equal(defaultModuleLevels[ModuleKeys.ANALYTICS], 'MODERATOR');
    assert.equal(defaultActionLevels[ActionKeys.AnalyticsView], 'MODERATOR');
    assert.equal(defaultActionLevels[ActionKeys.AnalyticsManage], 'SENIOR_MODERATOR');
    assert.equal(defaultActionLevels[ActionKeys.AnalyticsExport], 'SENIOR_MODERATOR');
  });

  await t.test('getModuleStatus evaluates ANALYTICS readiness correctly', async () => {
    mockDb.addHandler('SELECT enabled, digest_channel_id, digest_frequency FROM analytics_configs', () => ({
      rows: [{ enabled: true, digest_channel_id: 'ch-digest', digest_frequency: 'WEEKLY' }]
    }));

    const status = await getModuleStatus(guildId, { module_key: ModuleKeys.ANALYTICS, enabled: true });
    assert.equal(status.state, 'READY');
    assert.equal(status.emoji, '✅');
    assert.ok(status.note.includes('WEEKLY digest'));
  });
});
