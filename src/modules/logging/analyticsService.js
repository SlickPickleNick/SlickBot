const { analyticsBuffer } = require('../analytics/analyticsBuffer');
const { analyticsService } = require('../analytics/analyticsService');
const { query } = require('../../services/db');

class GuildAnalyticsService {
  /**
   * Track message activity via buffer
   */
  async trackMessage(guildId, userId, channelId = null) {
    if (!guildId) return;
    analyticsBuffer.recordMessage(guildId, channelId, userId);
  }

  /**
   * Track member joins via buffer
   */
  async trackMemberJoin(guildId, userId = null) {
    if (!guildId) return;
    analyticsBuffer.recordMemberJoin(guildId, userId);
  }

  /**
   * Track member leaves via buffer
   */
  async trackMemberLeave(guildId, userId = null) {
    if (!guildId) return;
    analyticsBuffer.recordMemberLeave(guildId, userId);
  }

  /**
   * Track command executions
   */
  async trackCommand(guildId) {
    if (!guildId) return;
    // Command activity is logged to standard audit and commands
  }

  /**
   * Track voice participation in minutes via buffer
   */
  async trackVoiceMinutes(guildId, minutes = 1, userId = null) {
    if (!guildId || minutes <= 0) return;
    analyticsBuffer.recordVoiceMinutes(guildId, userId, minutes);
  }

  /**
   * Retrieve historical metrics for dashboard analytics
   */
  async getMetrics(guildId, days = 30) {
    if (!guildId) return { daily: [], hourly24h: [] };
    const [dailyRes, hourlyRes] = await Promise.all([
      query(
        `SELECT * FROM guild_daily_analytics
         WHERE guild_id = $1 AND record_date >= CURRENT_DATE - $2::int
         ORDER BY record_date ASC`,
        [guildId, days]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT * FROM guild_hourly_activity
         WHERE guild_id = $1 AND hour_timestamp >= NOW() - INTERVAL '24 hours'
         ORDER BY hour_timestamp ASC`,
        [guildId]
      ).catch(() => ({ rows: [] }))
    ]);

    return {
      daily: dailyRes.rows || [],
      hourly24h: hourlyRes.rows || []
    };
  }
}

const guildAnalyticsService = new GuildAnalyticsService();

module.exports = {
  GuildAnalyticsService,
  guildAnalyticsService
};
