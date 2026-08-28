const { query } = require('../../services/db');

class GuildAnalyticsService {
  /**
   * Track message activity in hourly and daily analytics rollups
   */
  async trackMessage(guildId, userId) {
    if (!guildId) return;
    try {
      const now = new Date();
      const hourTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const dateStr = now.toISOString().split('T')[0];

      await Promise.all([
        query(
          `INSERT INTO guild_hourly_activity (guild_id, hour_timestamp, messages_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, hour_timestamp)
           DO UPDATE SET messages_count = guild_hourly_activity.messages_count + 1, updated_at = NOW()`,
          [guildId, hourTs]
        ).catch(() => {}),
        query(
          `INSERT INTO guild_daily_analytics (guild_id, record_date, messages_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, record_date)
           DO UPDATE SET messages_count = guild_daily_analytics.messages_count + 1, updated_at = NOW()`,
          [guildId, dateStr]
        ).catch(() => {})
      ]);
    } catch (e) {}
  }

  /**
   * Track member joins
   */
  async trackMemberJoin(guildId) {
    if (!guildId) return;
    try {
      const now = new Date();
      const hourTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const dateStr = now.toISOString().split('T')[0];

      await Promise.all([
        query(
          `INSERT INTO guild_hourly_activity (guild_id, hour_timestamp, joins_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, hour_timestamp)
           DO UPDATE SET joins_count = guild_hourly_activity.joins_count + 1, updated_at = NOW()`,
          [guildId, hourTs]
        ).catch(() => {}),
        query(
          `INSERT INTO guild_daily_analytics (guild_id, record_date, joins_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, record_date)
           DO UPDATE SET joins_count = guild_daily_analytics.joins_count + 1, updated_at = NOW()`,
          [guildId, dateStr]
        ).catch(() => {})
      ]);
    } catch (e) {}
  }

  /**
   * Track member leaves
   */
  async trackMemberLeave(guildId) {
    if (!guildId) return;
    try {
      const now = new Date();
      const hourTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const dateStr = now.toISOString().split('T')[0];

      await Promise.all([
        query(
          `INSERT INTO guild_hourly_activity (guild_id, hour_timestamp, leaves_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, hour_timestamp)
           DO UPDATE SET leaves_count = guild_hourly_activity.leaves_count + 1, updated_at = NOW()`,
          [guildId, hourTs]
        ).catch(() => {}),
        query(
          `INSERT INTO guild_daily_analytics (guild_id, record_date, leaves_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, record_date)
           DO UPDATE SET leaves_count = guild_daily_analytics.leaves_count + 1, updated_at = NOW()`,
          [guildId, dateStr]
        ).catch(() => {})
      ]);
    } catch (e) {}
  }

  /**
   * Track command executions
   */
  async trackCommand(guildId) {
    if (!guildId) return;
    try {
      const now = new Date();
      const hourTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const dateStr = now.toISOString().split('T')[0];

      await Promise.all([
        query(
          `INSERT INTO guild_hourly_activity (guild_id, hour_timestamp, commands_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, hour_timestamp)
           DO UPDATE SET commands_count = guild_hourly_activity.commands_count + 1, updated_at = NOW()`,
          [guildId, hourTs]
        ).catch(() => {}),
        query(
          `INSERT INTO guild_daily_analytics (guild_id, record_date, commands_count, updated_at)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (guild_id, record_date)
           DO UPDATE SET commands_count = guild_daily_analytics.commands_count + 1, updated_at = NOW()`,
          [guildId, dateStr]
        ).catch(() => {})
      ]);
    } catch (e) {}
  }

  /**
   * Track voice participation in minutes
   */
  async trackVoiceMinutes(guildId, minutes = 1) {
    if (!guildId || minutes <= 0) return;
    try {
      const now = new Date();
      const hourTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      const dateStr = now.toISOString().split('T')[0];

      await Promise.all([
        query(
          `INSERT INTO guild_hourly_activity (guild_id, hour_timestamp, voice_minutes, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (guild_id, hour_timestamp)
           DO UPDATE SET voice_minutes = guild_hourly_activity.voice_minutes + $3, updated_at = NOW()`,
          [guildId, hourTs, minutes]
        ).catch(() => {}),
        query(
          `INSERT INTO guild_daily_analytics (guild_id, record_date, voice_minutes, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (guild_id, record_date)
           DO UPDATE SET voice_minutes = guild_daily_analytics.voice_minutes + $3, updated_at = NOW()`,
          [guildId, dateStr, minutes]
        ).catch(() => {})
      ]);
    } catch (e) {}
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
