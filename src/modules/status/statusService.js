const { ActivityType } = require('discord.js');
const { query } = require('../../services/db');
const { env } = require('../../config/env');

const PresenceStatus = Object.freeze({
  ONLINE: 'online',
  IDLE: 'idle',
  DND: 'dnd',
  INVISIBLE: 'invisible'
});

const ActivityTypeNames = Object.freeze({
  PLAYING: 'PLAYING',
  WATCHING: 'WATCHING',
  LISTENING: 'LISTENING',
  COMPETING: 'COMPETING',
  STREAMING: 'STREAMING',
  NONE: 'NONE'
});

const ActivityTypeMap = Object.freeze({
  [ActivityTypeNames.PLAYING]: ActivityType.Playing,
  [ActivityTypeNames.WATCHING]: ActivityType.Watching,
  [ActivityTypeNames.LISTENING]: ActivityType.Listening,
  [ActivityTypeNames.COMPETING]: ActivityType.Competing,
  [ActivityTypeNames.STREAMING]: ActivityType.Streaming
});

/**
 * SlickBot Presence / Activity Service
 *
 * This module controls the visible Discord status for the bot user.
 *
 * Supported presence statuses:
 * - online
 * - idle
 * - dnd
 * - invisible
 *
 * Supported activity types:
 * - PLAYING
 * - WATCHING
 * - LISTENING
 * - COMPETING
 * - STREAMING
 * - NONE
 *
 * Runtime behavior:
 * - applyPresence() immediately changes the current bot status.
 * - savePresence() stores the preferred status/activity in PostgreSQL.
 * - applySavedPresence() runs when the bot starts so the saved status returns after redeploys.
 *
 * Discord command examples:
 * /status set status:online activity_type:WATCHING text:"the server"
 * /status set status:idle activity_type:PLAYING text:"with commands"
 * /status stream-url url:https://twitch.tv/yourchannel
 * /status clear
 *
 * Environment fallback examples:
 * DEFAULT_BOT_STATUS=online
 * DEFAULT_BOT_ACTIVITY_TYPE=WATCHING
 * DEFAULT_BOT_ACTIVITY_TEXT=the server
 */
class StatusService {
  constructor(client) {
    this.client = client;
  }

  normalizeStatus(status) {
    const normalized = String(status || PresenceStatus.ONLINE).toLowerCase();
    if (Object.values(PresenceStatus).includes(normalized)) return normalized;
    return PresenceStatus.ONLINE;
  }

  normalizeActivityType(activityType) {
    const normalized = String(activityType || ActivityTypeNames.NONE).toUpperCase();
    if (Object.values(ActivityTypeNames).includes(normalized)) return normalized;
    return ActivityTypeNames.NONE;
  }

  buildPresenceOptions(input = {}) {
    const status = this.normalizeStatus(input.status);
    const activityType = this.normalizeActivityType(input.activityType);
    const activityText = input.activityText ? String(input.activityText).trim() : '';
    const activityUrl = input.activityUrl ? String(input.activityUrl).trim() : null;

    const presence = { status, activities: [] };

    if (activityType !== ActivityTypeNames.NONE && activityText) {
      const activity = {
        name: activityText,
        type: ActivityTypeMap[activityType]
      };

      if (activityType === ActivityTypeNames.STREAMING && activityUrl) {
        activity.url = activityUrl;
      }

      presence.activities = [activity];
    }

    return presence;
  }

  async applyPresence(input = {}) {
    if (!this.client.user) return null;
    const presence = this.buildPresenceOptions(input);
    this.client.user.setPresence(presence);
    return presence;
  }

  async savePresence(guildId, input = {}) {
    const existing = guildId ? await this.getSavedPresence(guildId) : null;
    const status = this.normalizeStatus(input.status);
    const activityType = this.normalizeActivityType(input.activityType);
    const activityText = input.activityText ? String(input.activityText).trim() : null;
    const activityUrl = input.activityUrl ? String(input.activityUrl).trim() : null;
    const streamUrl = input.streamUrl !== undefined
      ? (input.streamUrl ? String(input.streamUrl).trim() : null)
      : (existing?.streamUrl || activityUrl || null);

    await query(
      `INSERT INTO bot_presence_settings (guild_id, status, activity_type, activity_text, activity_url, stream_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         activity_type = EXCLUDED.activity_type,
         activity_text = EXCLUDED.activity_text,
         activity_url = EXCLUDED.activity_url,
         stream_url = EXCLUDED.stream_url,
         updated_at = NOW()`,
      [guildId, status, activityType, activityText, activityUrl, streamUrl]
    );

    return { status, activityType, activityText, activityUrl, streamUrl };
  }

  async clearPresence(guildId, save = true) {
    const input = {
      status: PresenceStatus.ONLINE,
      activityType: ActivityTypeNames.NONE,
      activityText: null,
      activityUrl: null,
      streamUrl: undefined
    };

    await this.applyPresence(input);

    if (save && guildId) {
      await this.savePresence(guildId, input);
    }

    return input;
  }


  async saveStreamUrl(guildId, streamUrl) {
    const normalizedUrl = streamUrl ? String(streamUrl).trim() : null;
    if (!normalizedUrl) throw new Error('Stream URL is required.');

    const existing = await this.getSavedPresence(guildId);
    const status = existing?.status || PresenceStatus.ONLINE;
    const activityType = existing?.activityType || ActivityTypeNames.NONE;
    const activityText = existing?.activityText || null;
    const activityUrl = activityType === ActivityTypeNames.STREAMING ? normalizedUrl : (existing?.activityUrl || null);

    await query(
      `INSERT INTO bot_presence_settings (guild_id, status, activity_type, activity_text, activity_url, stream_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id)
       DO UPDATE SET
         stream_url = EXCLUDED.stream_url,
         activity_url = CASE
           WHEN bot_presence_settings.activity_type = 'STREAMING' THEN EXCLUDED.stream_url
           ELSE bot_presence_settings.activity_url
         END,
         updated_at = NOW()`,
      [guildId, status, activityType, activityText, activityUrl, normalizedUrl]
    );

    return this.getSavedPresence(guildId);
  }

  async getSavedPresence(guildId) {
    const result = await query(
      `SELECT * FROM bot_presence_settings WHERE guild_id = $1 LIMIT 1`,
      [guildId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      status: row.status,
      activityType: row.activity_type,
      activityText: row.activity_text,
      activityUrl: row.activity_url,
      streamUrl: row.stream_url || row.activity_url,
      updatedAt: row.updated_at
    };
  }

  async applySavedPresence(guildId) {
    const saved = guildId ? await this.getSavedPresence(guildId) : null;
    const fallback = saved || {
      status: env.DEFAULT_BOT_STATUS,
      activityType: env.DEFAULT_BOT_ACTIVITY_TYPE,
      activityText: env.DEFAULT_BOT_ACTIVITY_TEXT,
      activityUrl: env.DEFAULT_BOT_ACTIVITY_URL,
      streamUrl: env.DEFAULT_BOT_ACTIVITY_URL
    };

    return this.applyPresence(fallback);
  }

  async describeCurrentPresence(guildId) {
    const saved = guildId ? await this.getSavedPresence(guildId) : null;
    const current = this.client.user?.presence || null;
    const currentActivity = current?.activities?.[0] || null;

    return {
      saved,
      currentStatus: current?.status || null,
      currentActivityName: currentActivity?.name || null,
      currentActivityType: typeof currentActivity?.type === 'number' ? currentActivity.type : null
    };
  }
}

module.exports = {
  StatusService,
  PresenceStatus,
  ActivityTypeNames
};
