const { query } = require('../../services/db');

function getHourBucketDate(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function getDateString(date = new Date()) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

class AnalyticsBuffer {
  constructor() {
    this.hourlyBuffer = new Map();
    this.channelBuffer = new Map();
    this.memberFlowBuffer = new Map();
    this.staffBuffer = new Map();
    this.lastFlushedAt = null;
    this.totalEventsBuffered = 0;
  }

  /**
   * Record a message event
   */
  recordMessage(guildId, channelId, userId) {
    if (!guildId) return;
    const now = new Date();
    const hourBucket = getHourBucketDate(now);
    const hourKey = `${guildId}:${hourBucket.toISOString()}`;
    const dateStr = getDateString(now);
    const channelKey = `${guildId}:${channelId || 'unknown'}:${dateStr}`;

    // 1. Hourly aggregation
    let hourly = this.hourlyBuffer.get(hourKey);
    if (!hourly) {
      hourly = {
        guildId,
        bucketHour: hourBucket,
        messageCount: 0,
        uniqueChatters: new Set(),
        voiceMinutes: 0,
        activeVoice: new Set()
      };
      this.hourlyBuffer.set(hourKey, hourly);
    }
    hourly.messageCount += 1;
    if (userId) hourly.uniqueChatters.add(userId);

    // 2. Channel aggregation
    if (channelId) {
      let ch = this.channelBuffer.get(channelKey);
      if (!ch) {
        ch = {
          guildId,
          channelId,
          bucketDate: dateStr,
          messageCount: 0,
          uniqueAuthors: new Set()
        };
        this.channelBuffer.set(channelKey, ch);
      }
      ch.messageCount += 1;
      if (userId) ch.uniqueAuthors.add(userId);
    }

    this.totalEventsBuffered += 1;
  }

  /**
   * Record voice participation minutes
   */
  recordVoiceMinutes(guildId, userId, minutes = 1) {
    if (!guildId || minutes <= 0) return;
    const now = new Date();
    const hourBucket = getHourBucketDate(now);
    const hourKey = `${guildId}:${hourBucket.toISOString()}`;

    let hourly = this.hourlyBuffer.get(hourKey);
    if (!hourly) {
      hourly = {
        guildId,
        bucketHour: hourBucket,
        messageCount: 0,
        uniqueChatters: new Set(),
        voiceMinutes: 0,
        activeVoice: new Set()
      };
      this.hourlyBuffer.set(hourKey, hourly);
    }
    hourly.voiceMinutes += Math.max(1, Math.round(minutes));
    if (userId) hourly.activeVoice.add(userId);

    this.totalEventsBuffered += 1;
  }

  /**
   * Record member join event
   */
  recordMemberJoin(guildId, userId = null) {
    if (!guildId) return;
    const now = new Date();
    const dateStr = getDateString(now);
    const flowKey = `${guildId}:${dateStr}`;

    let flow = this.memberFlowBuffer.get(flowKey);
    if (!flow) {
      flow = {
        guildId,
        bucketDate: dateStr,
        joinsCount: 0,
        leavesCount: 0,
        verifiedCount: 0
      };
      this.memberFlowBuffer.set(flowKey, flow);
    }
    flow.joinsCount += 1;
    this.totalEventsBuffered += 1;
  }

  /**
   * Record member leave event
   */
  recordMemberLeave(guildId, userId = null) {
    if (!guildId) return;
    const now = new Date();
    const dateStr = getDateString(now);
    const flowKey = `${guildId}:${dateStr}`;

    let flow = this.memberFlowBuffer.get(flowKey);
    if (!flow) {
      flow = {
        guildId,
        bucketDate: dateStr,
        joinsCount: 0,
        leavesCount: 0,
        verifiedCount: 0
      };
      this.memberFlowBuffer.set(flowKey, flow);
    }
    flow.leavesCount += 1;
    this.totalEventsBuffered += 1;
  }

  /**
   * Record member verification completion
   */
  recordMemberVerified(guildId, userId = null) {
    if (!guildId) return;
    const now = new Date();
    const dateStr = getDateString(now);
    const flowKey = `${guildId}:${dateStr}`;

    let flow = this.memberFlowBuffer.get(flowKey);
    if (!flow) {
      flow = {
        guildId,
        bucketDate: dateStr,
        joinsCount: 0,
        leavesCount: 0,
        verifiedCount: 0
      };
      this.memberFlowBuffer.set(flowKey, flow);
    }
    flow.verifiedCount += 1;
    this.totalEventsBuffered += 1;
  }

  /**
   * Record staff action
   * @param {string} guildId
   * @param {string} staffUserId
   * @param {'warn'|'timeout'|'kick'|'ban'|'ticket_claim'|'ticket_close'} actionType
   */
  recordStaffAction(guildId, staffUserId, actionType) {
    if (!guildId || !staffUserId || !actionType) return;
    const now = new Date();
    const dateStr = getDateString(now);
    const staffKey = `${guildId}:${staffUserId}:${dateStr}`;

    let staff = this.staffBuffer.get(staffKey);
    if (!staff) {
      staff = {
        guildId,
        staffUserId,
        bucketDate: dateStr,
        warnsCount: 0,
        timeoutsCount: 0,
        kicksCount: 0,
        bansCount: 0,
        ticketsClaimedCount: 0,
        ticketsClosedCount: 0
      };
      this.staffBuffer.set(staffKey, staff);
    }

    switch (actionType.toLowerCase()) {
      case 'warn':
      case 'warns':
        staff.warnsCount += 1;
        break;
      case 'timeout':
      case 'timeouts':
        staff.timeoutsCount += 1;
        break;
      case 'kick':
      case 'kicks':
        staff.kicksCount += 1;
        break;
      case 'ban':
      case 'bans':
        staff.bansCount += 1;
        break;
      case 'ticket_claim':
      case 'claim':
        staff.ticketsClaimedCount += 1;
        break;
      case 'ticket_close':
      case 'close':
        staff.ticketsClosedCount += 1;
        break;
      default:
        break;
    }

    this.totalEventsBuffered += 1;
  }

  /**
   * Get buffered counters for a specific guild that have not yet been flushed to DB
   */
  getBufferSummary(guildId) {
    if (!guildId) return { messages: 0, voiceMinutes: 0, joins: 0, leaves: 0 };
    let messages = 0;
    let voiceMinutes = 0;
    let joins = 0;
    let leaves = 0;

    for (const h of this.hourlyBuffer.values()) {
      if (h.guildId === guildId) {
        messages += h.messageCount;
        voiceMinutes += h.voiceMinutes;
      }
    }
    for (const f of this.memberFlowBuffer.values()) {
      if (f.guildId === guildId) {
        joins += f.joinsCount;
        leaves += f.leavesCount;
      }
    }

    return { messages, voiceMinutes, joins, leaves };
  }

  /**
   * Flush all in-memory aggregation buffers to PostgreSQL database
   */
  async flush(readyClient = null, logger = null) {
    if (
      this.hourlyBuffer.size === 0 &&
      this.channelBuffer.size === 0 &&
      this.memberFlowBuffer.size === 0 &&
      this.staffBuffer.size === 0
    ) {
      return { flushedCount: 0 };
    }

    // Atomic swap: take snapshots and reset active maps
    const hourlySnapshot = Array.from(this.hourlyBuffer.values());
    const channelSnapshot = Array.from(this.channelBuffer.values());
    const memberFlowSnapshot = Array.from(this.memberFlowBuffer.values());
    const staffSnapshot = Array.from(this.staffBuffer.values());

    this.hourlyBuffer = new Map();
    this.channelBuffer = new Map();
    this.memberFlowBuffer = new Map();
    this.staffBuffer = new Map();

    let flushedCount = 0;

    try {
      // 1. Flush Hourly Activity
      for (const h of hourlySnapshot) {
        await query(
          `INSERT INTO analytics_hourly_activity (
             guild_id, bucket_hour, message_count, unique_chatters_count, voice_minutes, active_voice_count, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (guild_id, bucket_hour)
           DO UPDATE SET
             message_count = analytics_hourly_activity.message_count + EXCLUDED.message_count,
             unique_chatters_count = GREATEST(analytics_hourly_activity.unique_chatters_count, EXCLUDED.unique_chatters_count),
             voice_minutes = analytics_hourly_activity.voice_minutes + EXCLUDED.voice_minutes,
             active_voice_count = GREATEST(analytics_hourly_activity.active_voice_count, EXCLUDED.active_voice_count)`,
          [
            h.guildId,
            h.bucketHour,
            h.messageCount,
            h.uniqueChatters.size,
            h.voiceMinutes,
            h.activeVoice.size
          ]
        ).catch(() => {});

        // Legacy compatibility write
        await query(
          `INSERT INTO guild_hourly_activity (guild_id, hour_timestamp, messages_count, voice_minutes, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (guild_id, hour_timestamp)
           DO UPDATE SET
             messages_count = guild_hourly_activity.messages_count + EXCLUDED.messages_count,
             voice_minutes = guild_hourly_activity.voice_minutes + EXCLUDED.voice_minutes,
             updated_at = NOW()`,
          [h.guildId, h.bucketHour, h.messageCount, h.voiceMinutes]
        ).catch(() => {});

        flushedCount++;
      }

      // 2. Flush Channel Activity
      for (const ch of channelSnapshot) {
        await query(
          `INSERT INTO analytics_channel_activity (
             guild_id, channel_id, bucket_date, message_count, unique_authors_count, created_at
           )
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (guild_id, channel_id, bucket_date)
           DO UPDATE SET
             message_count = analytics_channel_activity.message_count + EXCLUDED.message_count,
             unique_authors_count = GREATEST(analytics_channel_activity.unique_authors_count, EXCLUDED.unique_authors_count)`,
          [
            ch.guildId,
            ch.channelId,
            ch.bucketDate,
            ch.messageCount,
            ch.uniqueAuthors.size
          ]
        ).catch(() => {});

        flushedCount++;
      }

      // 3. Flush Member Flow
      for (const flow of memberFlowSnapshot) {
        await query(
          `INSERT INTO analytics_member_flow (
             guild_id, bucket_date, joins_count, leaves_count, verified_count, created_at
           )
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (guild_id, bucket_date)
           DO UPDATE SET
             joins_count = analytics_member_flow.joins_count + EXCLUDED.joins_count,
             leaves_count = analytics_member_flow.leaves_count + EXCLUDED.leaves_count,
             verified_count = analytics_member_flow.verified_count + EXCLUDED.verified_count`,
          [
            flow.guildId,
            flow.bucketDate,
            flow.joinsCount,
            flow.leavesCount,
            flow.verifiedCount
          ]
        ).catch(() => {});

        // Legacy daily table sync
        await query(
          `INSERT INTO guild_daily_analytics (guild_id, record_date, joins_count, leaves_count, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (guild_id, record_date)
           DO UPDATE SET
             joins_count = guild_daily_analytics.joins_count + EXCLUDED.joins_count,
             leaves_count = guild_daily_analytics.leaves_count + EXCLUDED.leaves_count,
             updated_at = NOW()`,
          [flow.guildId, flow.bucketDate, flow.joinsCount, flow.leavesCount]
        ).catch(() => {});

        flushedCount++;
      }

      // 4. Flush Staff Activity
      for (const st of staffSnapshot) {
        await query(
          `INSERT INTO analytics_staff_activity (
             guild_id, staff_user_id, bucket_date, warns_count, timeouts_count,
             kicks_count, bans_count, tickets_claimed_count, tickets_closed_count, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (guild_id, staff_user_id, bucket_date)
           DO UPDATE SET
             warns_count = analytics_staff_activity.warns_count + EXCLUDED.warns_count,
             timeouts_count = analytics_staff_activity.timeouts_count + EXCLUDED.timeouts_count,
             kicks_count = analytics_staff_activity.kicks_count + EXCLUDED.kicks_count,
             bans_count = analytics_staff_activity.bans_count + EXCLUDED.bans_count,
             tickets_claimed_count = analytics_staff_activity.tickets_claimed_count + EXCLUDED.tickets_claimed_count,
             tickets_closed_count = analytics_staff_activity.tickets_closed_count + EXCLUDED.tickets_closed_count`,
          [
            st.guildId,
            st.staffUserId,
            st.bucketDate,
            st.warnsCount,
            st.timeoutsCount,
            st.kicksCount,
            st.bansCount,
            st.ticketsClaimedCount,
            st.ticketsClosedCount
          ]
        ).catch(() => {});

        flushedCount++;
      }

      this.lastFlushedAt = new Date();
      return { flushedCount };
    } catch (err) {
      if (logger && typeof logger.error === 'function') {
        logger.error(`AnalyticsBuffer flush failed: ${err.message}`, { error: err });
      } else {
        console.error(`AnalyticsBuffer flush failed:`, err);
      }
      return { flushedCount, error: err };
    }
  }
}

const analyticsBuffer = new AnalyticsBuffer();

module.exports = {
  AnalyticsBuffer,
  analyticsBuffer,
  getHourBucketDate,
  getDateString
};
