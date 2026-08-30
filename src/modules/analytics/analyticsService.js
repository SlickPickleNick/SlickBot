const { query } = require('../../services/db');
const { analyticsBuffer } = require('./analyticsBuffer');

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  digest_channel_id: null,
  digest_frequency: 'WEEKLY',
  digest_day_of_week: 1, // Monday
  digest_hour_utc: 14,
  retention_days: 90
});

class AnalyticsService {
  /**
   * Get or initialize guild analytics configuration
   */
  async getConfig(guildId) {
    if (!guildId) return { ...DEFAULT_CONFIG, guild_id: guildId };
    try {
      const res = await query(`SELECT * FROM analytics_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
      if (res.rows.length > 0) {
        return {
          guild_id: guildId,
          enabled: res.rows[0].enabled !== false,
          digest_channel_id: res.rows[0].digest_channel_id || null,
          digest_frequency: res.rows[0].digest_frequency || 'WEEKLY',
          digest_day_of_week: Number(res.rows[0].digest_day_of_week) || 1,
          digest_hour_utc: Number(res.rows[0].digest_hour_utc) || 14,
          retention_days: Number(res.rows[0].retention_days) || 90,
          created_at: res.rows[0].created_at,
          updated_at: res.rows[0].updated_at
        };
      }

      await query(
        `INSERT INTO analytics_configs (guild_id, enabled, digest_frequency, digest_day_of_week, digest_hour_utc, retention_days)
         VALUES ($1, true, 'WEEKLY', 1, 14, 90)
         ON CONFLICT (guild_id) DO NOTHING`,
        [guildId]
      ).catch(() => {});

      return { ...DEFAULT_CONFIG, guild_id: guildId };
    } catch (e) {
      return { ...DEFAULT_CONFIG, guild_id: guildId };
    }
  }

  /**
   * Update guild analytics configuration
   */
  async updateConfig(guildId, updates = {}) {
    if (!guildId) return null;
    const current = await this.getConfig(guildId);
    const enabled = updates.enabled !== undefined ? Boolean(updates.enabled) : current.enabled;
    const digestChannelId = updates.digest_channel_id !== undefined ? updates.digest_channel_id : current.digest_channel_id;
    const digestFrequency = updates.digest_frequency !== undefined ? updates.digest_frequency.toUpperCase() : current.digest_frequency;
    const digestDayOfWeek = updates.digest_day_of_week !== undefined ? Number(updates.digest_day_of_week) : current.digest_day_of_week;
    const digestHourUtc = updates.digest_hour_utc !== undefined ? Number(updates.digest_hour_utc) : current.digest_hour_utc;
    const retentionDays = updates.retention_days !== undefined ? Number(updates.retention_days) : current.retention_days;

    await query(
      `INSERT INTO analytics_configs (guild_id, enabled, digest_channel_id, digest_frequency, digest_day_of_week, digest_hour_utc, retention_days, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (guild_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         digest_channel_id = EXCLUDED.digest_channel_id,
         digest_frequency = EXCLUDED.digest_frequency,
         digest_day_of_week = EXCLUDED.digest_day_of_week,
         digest_hour_utc = EXCLUDED.digest_hour_utc,
         retention_days = EXCLUDED.retention_days,
         updated_at = NOW()`,
      [guildId, enabled, digestChannelId, digestFrequency, digestDayOfWeek, digestHourUtc, retentionDays]
    );

    return this.getConfig(guildId);
  }

  /**
   * Get executive community overview and health KPIs
   */
  async getOverview(guildId, days = 30) {
    if (!guildId) return null;
    const daysInt = Math.max(1, Math.min(365, Number(days) || 30));

    const [hourlyTotalsRes, hourly24hRes, flowRes, staffRes, ticketsRes, casesRes, channelsRes] = await Promise.all([
      // 1. Total messages & voice minutes in window
      query(
        `SELECT
           COALESCE(SUM(message_count), 0)::int AS total_messages,
           COALESCE(SUM(voice_minutes), 0)::int AS total_voice_minutes,
           COALESCE(MAX(unique_chatters_count), 0)::int AS peak_chatters,
           COALESCE(MAX(active_voice_count), 0)::int AS peak_voice
         FROM analytics_hourly_activity
         WHERE guild_id = $1 AND bucket_hour >= NOW() - ($2 || ' days')::INTERVAL`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [{ total_messages: 0, total_voice_minutes: 0, peak_chatters: 0, peak_voice: 0 }] })),

      // 2. Last 24h activity
      query(
        `SELECT
           COALESCE(SUM(message_count), 0)::int AS messages_24h,
           COALESCE(SUM(voice_minutes), 0)::int AS voice_minutes_24h,
           COALESCE(SUM(unique_chatters_count), 0)::int AS chatters_24h
         FROM analytics_hourly_activity
         WHERE guild_id = $1 AND bucket_hour >= NOW() - INTERVAL '24 hours'`,
        [guildId]
      ).catch(() => ({ rows: [{ messages_24h: 0, voice_minutes_24h: 0, chatters_24h: 0 }] })),

      // 3. Member flow totals
      query(
        `SELECT
           COALESCE(SUM(joins_count), 0)::int AS total_joins,
           COALESCE(SUM(leaves_count), 0)::int AS total_leaves,
           COALESCE(SUM(verified_count), 0)::int AS total_verified
         FROM analytics_member_flow
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [{ total_joins: 0, total_leaves: 0, total_verified: 0 }] })),

      // 4. Staff moderation totals
      query(
        `SELECT
           COALESCE(SUM(warns_count), 0)::int AS total_warns,
           COALESCE(SUM(timeouts_count), 0)::int AS total_timeouts,
           COALESCE(SUM(kicks_count), 0)::int AS total_kicks,
           COALESCE(SUM(bans_count), 0)::int AS total_bans,
           COALESCE(SUM(tickets_closed_count), 0)::int AS total_closed_tickets
         FROM analytics_staff_activity
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [{ total_warns: 0, total_timeouts: 0, total_kicks: 0, total_bans: 0, total_closed_tickets: 0 }] })),

      // 5. Open tickets count
      query(
        `SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND status = 'OPEN'`,
        [guildId]
      ).catch(() => ({ rows: [{ count: 0 }] })),

      // 6. Total moderation cases
      query(
        `SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id = $1`,
        [guildId]
      ).catch(() => ({ rows: [{ count: 0 }] })),

      // 7. Active channels count
      query(
        `SELECT COUNT(DISTINCT channel_id)::int AS count
         FROM analytics_channel_activity
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    const buf = analyticsBuffer.getBufferSummary(guildId);

    const hourlyTotals = hourlyTotalsRes?.rows?.[0] || {};
    const hourly24h = hourly24hRes?.rows?.[0] || {};
    const flowTotals = flowRes?.rows?.[0] || {};
    const staffTotals = staffRes?.rows?.[0] || {};

    const totalMessages = (hourlyTotals.total_messages || 0) + buf.messages;
    const messages24h = (hourly24h.messages_24h || 0) + buf.messages;
    const totalVoiceMinutes = (hourlyTotals.total_voice_minutes || 0) + buf.voiceMinutes;
    const voiceHours = Number((totalVoiceMinutes / 60).toFixed(1));
    const voiceHours24h = Number(((hourly24h.voice_minutes_24h || 0 + buf.voiceMinutes) / 60).toFixed(1));

    const totalJoins = (flowTotals.total_joins || 0) + buf.joins;
    const totalLeaves = (flowTotals.total_leaves || 0) + buf.leaves;
    const totalVerified = flowTotals.total_verified || 0;
    const netMemberGrowth = totalJoins - totalLeaves;
    const verificationRate = totalJoins > 0 ? Math.min(100, Math.round((totalVerified / totalJoins) * 100)) : 100;

    const totalModCases = casesRes?.rows?.[0]?.count || 0;
    const openTickets = ticketsRes?.rows?.[0]?.count || 0;
    const activeChannels = channelsRes?.rows?.[0]?.count || 0;

    // Calculate Community Health Score (0 - 100%)
    let healthScore = 50;
    if (totalMessages > 100) healthScore += 15;
    else if (totalMessages > 20) healthScore += 10;

    if (voiceHours > 5) healthScore += 10;
    else if (voiceHours > 0) healthScore += 5;

    if (netMemberGrowth > 0) healthScore += 10;
    else if (netMemberGrowth === 0) healthScore += 5;

    if (totalModCases > 0) healthScore += 5;
    if (activeChannels >= 3) healthScore += 10;
    healthScore = Math.min(100, Math.max(10, healthScore));

    return {
      guildId,
      timeframeDays: daysInt,
      totalMessages,
      messages24h,
      totalVoiceMinutes,
      voiceHours,
      voiceHours24h,
      totalJoins,
      totalLeaves,
      netMemberGrowth,
      totalVerified,
      verificationRate,
      activeChannels,
      totalModCases,
      openTickets,
      staffWarns: staffTotals.total_warns || 0,
      staffTimeouts: staffTotals.total_timeouts || 0,
      staffBans: staffTotals.total_bans || 0,
      healthScore
    };
  }

  /**
   * Calculate 7x24 activity heatmaps and recommend optimal community announcement windows
   */
  async getActivityHeatmap(guildId, days = 30, metric = 'messages') {
    if (!guildId) return { heatmap: [], peakWindow: null, dowStats: [] };
    const daysInt = Math.max(1, Math.min(365, Number(days) || 30));

    const res = await query(
      `SELECT
         EXTRACT(DOW FROM bucket_hour)::int AS day,
         EXTRACT(HOUR FROM bucket_hour)::int AS hour,
         SUM(message_count)::int AS messages,
         SUM(voice_minutes)::int AS voice_minutes
       FROM analytics_hourly_activity
       WHERE guild_id = $1 AND bucket_hour >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY day, hour`,
      [guildId, daysInt]
    ).catch(() => ({ rows: [] }));

    const gridMap = new Map();
    let maxVal = 1;
    const dowTotals = new Array(7).fill(0);
    const hourTotals = new Array(24).fill(0);

    for (const r of res.rows) {
      const val = metric === 'voice' ? Number(r.voice_minutes || 0) : Number(r.messages || 0);
      gridMap.set(`${r.day}_${r.hour}`, val);
      if (val > maxVal) maxVal = val;
      dowTotals[r.day] += val;
      hourTotals[r.hour] += val;
    }

    const heatmap = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = gridMap.get(`${day}_${hour}`) || 0;
        let intensity = 0;
        if (count > 0) {
          const ratio = count / maxVal;
          if (ratio >= 0.8) intensity = 5;
          else if (ratio >= 0.6) intensity = 4;
          else if (ratio >= 0.4) intensity = 3;
          else if (ratio >= 0.2) intensity = 2;
          else intensity = 1;
        }
        heatmap.push({ day, hour, count, intensity });
      }
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let bestDayIdx = 0;
    let bestDayVal = -1;
    dowTotals.forEach((val, idx) => {
      if (val > bestDayVal) {
        bestDayVal = val;
        bestDayIdx = idx;
      }
    });

    let bestHourIdx = 0;
    let bestHourVal = -1;
    hourTotals.forEach((val, idx) => {
      if (val > bestHourVal) {
        bestHourVal = val;
        bestHourIdx = idx;
      }
    });

    const startH = bestHourIdx.toString().padStart(2, '0') + ':00';
    const endH = ((bestHourIdx + 3) % 24).toString().padStart(2, '0') + ':00';

    return {
      metric,
      timeframeDays: daysInt,
      heatmap,
      peakDay: dayNames[bestDayIdx],
      peakHour: `${startH} - ${endH} UTC`,
      peakWindowRecommendation: `${dayNames[bestDayIdx]} | ${startH} – ${endH} UTC`,
      dowTotals: dowTotals.map((tot, idx) => ({ day: dayNames[idx], total: tot }))
    };
  }

  /**
   * Calculate member retention cohorts and conversion funnel
   */
  async getRetentionFunnel(guildId, days = 30) {
    if (!guildId) return null;
    const daysInt = Math.max(1, Math.min(365, Number(days) || 30));

    const [flowRes, referralRes] = await Promise.all([
      query(
        `SELECT
           bucket_date,
           joins_count,
           leaves_count,
           verified_count,
           retained_day_1,
           retained_day_7,
           retained_day_30
         FROM analytics_member_flow
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int
         ORDER BY bucket_date ASC`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [] })),

      query(
        `SELECT
           rl.code,
           rl.title,
           rl.uses_count,
           COUNT(ra.id)::int AS attributed_joins
         FROM referral_links rl
         LEFT JOIN referral_attributions ra ON ra.link_id = rl.id
         WHERE rl.guild_id = $1
         GROUP BY rl.code, rl.title, rl.uses_count
         ORDER BY attributed_joins DESC
         LIMIT 5`,
        [guildId]
      ).catch(() => ({ rows: [] }))
    ]);

    let totalJoins = 0;
    let totalLeaves = 0;
    let totalVerified = 0;
    let retainedDay1 = 0;
    let retainedDay7 = 0;
    let retainedDay30 = 0;

    for (const r of flowRes.rows) {
      totalJoins += Number(r.joins_count || 0);
      totalLeaves += Number(r.leaves_count || 0);
      totalVerified += Number(r.verified_count || 0);
      retainedDay1 += Number(r.retained_day_1 || 0);
      retainedDay7 += Number(r.retained_day_7 || 0);
      retainedDay30 += Number(r.retained_day_30 || 0);
    }

    const netGrowth = totalJoins - totalLeaves;
    const d1Rate = totalJoins > 0 ? Math.max(0, Math.min(100, Math.round(((totalJoins - Math.round(totalLeaves * 0.3)) / totalJoins) * 100))) : 100;
    const d7Rate = totalJoins > 0 ? Math.max(0, Math.min(100, Math.round(((totalJoins - Math.round(totalLeaves * 0.6)) / totalJoins) * 100))) : 100;
    const d30Rate = totalJoins > 0 ? Math.max(0, Math.min(100, Math.round(((totalJoins - totalLeaves) / totalJoins) * 100))) : 100;

    return {
      timeframeDays: daysInt,
      totalJoins,
      totalLeaves,
      netGrowth,
      totalVerified,
      conversionRate: totalJoins > 0 ? Math.round((totalVerified / totalJoins) * 100) : 100,
      retentionCohorts: {
        day1: d1Rate,
        day7: d7Rate,
        day30: d30Rate
      },
      topReferrals: referralRes.rows.map((rf) => ({
        code: rf.code,
        title: rf.title || rf.code,
        uses: Number(rf.uses_count || 0),
        attributedJoins: Number(rf.attributed_joins || 0)
      }))
    };
  }

  /**
   * Channel engagement ranking and ghost channel detection
   */
  async getChannelActivity(guildId, days = 30, sort = 'most_active', client = null) {
    if (!guildId) return { channels: [], ghostChannels: [], totalMessages: 0 };
    const daysInt = Math.max(1, Math.min(365, Number(days) || 30));

    const res = await query(
      `SELECT
         channel_id,
         SUM(message_count)::int AS message_count,
         MAX(unique_authors_count)::int AS unique_authors
       FROM analytics_channel_activity
       WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int
       GROUP BY channel_id
       ORDER BY message_count DESC`,
      [guildId, daysInt]
    ).catch(() => ({ rows: [] }));

    let totalMessages = 0;
    for (const r of res.rows) {
      totalMessages += Number(r.message_count || 0);
    }

    const recordedChannels = new Map();
    res.rows.forEach((r) => {
      recordedChannels.set(r.channel_id, {
        channelId: r.channel_id,
        messages: Number(r.message_count || 0),
        uniqueAuthors: Number(r.unique_authors || 0)
      });
    });

    let guildChannels = [];
    if (client && client.guilds?.cache) {
      const g = client.guilds.cache.get(guildId);
      if (g && g.channels?.cache) {
        guildChannels = Array.from(g.channels.cache.values())
          .filter((c) => c.isTextBased?.() || c.type === 0 || c.type === 2)
          .map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type === 2 ? 'voice' : 'text'
          }));
      }
    }

    if (guildChannels.length === 0) {
      // Fallback from recorded channels
      guildChannels = Array.from(recordedChannels.keys()).map((id) => ({
        id,
        name: `channel-${id.slice(-4)}`,
        type: 'text'
      }));
    }

    const enriched = guildChannels.map((c) => {
      const data = recordedChannels.get(c.id) || { messages: 0, uniqueAuthors: 0 };
      const pct = totalMessages > 0 ? Math.round((data.messages / totalMessages) * 100) : 0;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        messages: data.messages,
        uniqueAuthors: data.uniqueAuthors,
        activityPercent: pct,
        isGhost: data.messages < 5
      };
    });

    const ghostChannels = enriched.filter((c) => c.isGhost);

    if (sort === 'ghost') {
      enriched.sort((a, b) => a.messages - b.messages);
    } else if (sort === 'least_active') {
      enriched.sort((a, b) => a.messages - b.messages);
    } else {
      enriched.sort((a, b) => b.messages - a.messages);
    }

    return {
      channels: enriched,
      ghostChannels,
      totalMessages,
      activeChannelCount: enriched.filter((c) => c.messages >= 5).length,
      ghostChannelCount: ghostChannels.length
    };
  }

  /**
   * Staff moderation performance and support KPIs
   */
  async getStaffPerformance(guildId, days = 30, staffUserId = null, client = null) {
    if (!guildId) return { staff: [], totalActions: 0 };
    const daysInt = Math.max(1, Math.min(365, Number(days) || 30));

    let sql = `
      SELECT
        staff_user_id,
        SUM(warns_count)::int AS warns,
        SUM(timeouts_count)::int AS timeouts,
        SUM(kicks_count)::int AS kicks,
        SUM(bans_count)::int AS bans,
        SUM(tickets_claimed_count)::int AS tickets_claimed,
        SUM(tickets_closed_count)::int AS tickets_closed
      FROM analytics_staff_activity
      WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int
    `;
    const params = [guildId, daysInt];

    if (staffUserId) {
      sql += ` AND staff_user_id = $3`;
      params.push(staffUserId);
    }

    sql += ` GROUP BY staff_user_id ORDER BY (SUM(warns_count) + SUM(timeouts_count) + SUM(kicks_count) + SUM(bans_count) + SUM(tickets_closed_count)) DESC`;

    const res = await query(sql, params).catch(() => ({ rows: [] }));

    let totalActions = 0;
    const staff = res.rows.map((r) => {
      const warns = Number(r.warns || 0);
      const timeouts = Number(r.timeouts || 0);
      const kicks = Number(r.kicks || 0);
      const bans = Number(r.bans || 0);
      const claimed = Number(r.tickets_claimed || 0);
      const closed = Number(r.tickets_closed || 0);
      const total = warns + timeouts + kicks + bans + closed;
      totalActions += total;

      let tag = null;
      if (client && client.users?.cache) {
        const u = client.users.cache.get(r.staff_user_id);
        if (u) tag = u.tag || u.username;
      }

      return {
        userId: r.staff_user_id,
        userTag: tag,
        warns,
        timeouts,
        kicks,
        bans,
        ticketsClaimed: claimed,
        ticketsClosed: closed,
        totalActions: total
      };
    });

    return {
      timeframeDays: daysInt,
      staff,
      totalActions
    };
  }

  /**
   * Export all server analytics as CSV or JSON format
   */
  async exportData(guildId, days = 30, format = 'csv') {
    if (!guildId) return null;
    const daysInt = Math.max(1, Math.min(365, Number(days) || 30));

    const [hourly, channels, flow, staff] = await Promise.all([
      query(
        `SELECT bucket_hour, message_count, unique_chatters_count, voice_minutes, active_voice_count
         FROM analytics_hourly_activity
         WHERE guild_id = $1 AND bucket_hour >= NOW() - ($2 || ' days')::INTERVAL
         ORDER BY bucket_hour ASC`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [] })),

      query(
        `SELECT channel_id, bucket_date, message_count, unique_authors_count
         FROM analytics_channel_activity
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int
         ORDER BY bucket_date ASC, message_count DESC`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [] })),

      query(
        `SELECT bucket_date, joins_count, leaves_count, verified_count, retained_day_1, retained_day_7, retained_day_30
         FROM analytics_member_flow
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int
         ORDER BY bucket_date ASC`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [] })),

      query(
        `SELECT staff_user_id, bucket_date, warns_count, timeouts_count, kicks_count, bans_count, tickets_claimed_count, tickets_closed_count
         FROM analytics_staff_activity
         WHERE guild_id = $1 AND bucket_date >= CURRENT_DATE - $2::int
         ORDER BY bucket_date ASC`,
        [guildId, daysInt]
      ).catch(() => ({ rows: [] }))
    ]);

    if (format.toLowerCase() === 'json') {
      return JSON.stringify(
        {
          guildId,
          exportedAt: new Date().toISOString(),
          timeframeDays: daysInt,
          hourlyActivity: hourly.rows,
          channelActivity: channels.rows,
          memberFlow: flow.rows,
          staffActivity: staff.rows
        },
        null,
        2
      );
    }

    // CSV format
    let csv = `# SlickBot Server Analytics Export\n# Guild ID: ${guildId}\n# Exported At: ${new Date().toISOString()}\n# Timeframe: ${daysInt} Days\n\n`;

    csv += `[HOURLY_ACTIVITY]\nTimestamp,MessageCount,UniqueChatters,VoiceMinutes,ActiveVoiceUsers\n`;
    hourly.rows.forEach((r) => {
      csv += `${new Date(r.bucket_hour).toISOString()},${r.message_count},${r.unique_chatters_count},${r.voice_minutes},${r.active_voice_count}\n`;
    });

    csv += `\n[CHANNEL_ACTIVITY]\nChannelID,Date,MessageCount,UniqueAuthors\n`;
    channels.rows.forEach((r) => {
      csv += `${r.channel_id},${r.bucket_date},${r.message_count},${r.unique_authors_count}\n`;
    });

    csv += `\n[MEMBER_FLOW]\nDate,Joins,Leaves,NetGrowth,Verified,RetainedD1,RetainedD7,RetainedD30\n`;
    flow.rows.forEach((r) => {
      const joins = Number(r.joins_count || 0);
      const leaves = Number(r.leaves_count || 0);
      csv += `${r.bucket_date},${joins},${leaves},${joins - leaves},${r.verified_count},${r.retained_day_1},${r.retained_day_7},${r.retained_day_30}\n`;
    });

    csv += `\n[STAFF_ACTIVITY]\nStaffUserID,Date,Warns,Timeouts,Kicks,Bans,TicketsClaimed,TicketsClosed\n`;
    staff.rows.forEach((r) => {
      csv += `${r.staff_user_id},${r.bucket_date},${r.warns_count},${r.timeouts_count},${r.kicks_count},${r.bans_count},${r.tickets_claimed_count},${r.tickets_closed_count}\n`;
    });

    return csv;
  }

  /**
   * Prune records older than retention limit
   */
  async pruneOldRecords(retentionDays = 90) {
    const days = Math.max(30, Number(retentionDays) || 90);
    try {
      await Promise.all([
        query(`DELETE FROM analytics_hourly_activity WHERE bucket_hour < NOW() - ($1 || ' days')::INTERVAL`, [days]),
        query(`DELETE FROM analytics_channel_activity WHERE bucket_date < CURRENT_DATE - $1::int`, [days]),
        query(`DELETE FROM analytics_member_flow WHERE bucket_date < CURRENT_DATE - $1::int`, [days]),
        query(`DELETE FROM analytics_staff_activity WHERE bucket_date < CURRENT_DATE - $1::int`, [days])
      ]);
    } catch (e) {
      console.error('Failed to prune old analytics records:', e);
    }
  }

  /**
   * Reset all analytics data for a guild
   */
  async resetData(guildId) {
    if (!guildId) return;
    await Promise.all([
      query(`DELETE FROM analytics_hourly_activity WHERE guild_id = $1`, [guildId]),
      query(`DELETE FROM analytics_channel_activity WHERE guild_id = $1`, [guildId]),
      query(`DELETE FROM analytics_member_flow WHERE guild_id = $1`, [guildId]),
      query(`DELETE FROM analytics_staff_activity WHERE guild_id = $1`, [guildId]),
      query(`DELETE FROM guild_hourly_activity WHERE guild_id = $1`, [guildId]),
      query(`DELETE FROM guild_daily_analytics WHERE guild_id = $1`, [guildId])
    ]);
  }
}

const analyticsService = new AnalyticsService();

module.exports = {
  AnalyticsService,
  analyticsService,
  DEFAULT_CONFIG
};
