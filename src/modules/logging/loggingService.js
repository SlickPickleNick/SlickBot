const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { truncate } = require('../../utils/format');
const { getLogEvent } = require('./logEventCatalog');

const LogDeliveryMode = Object.freeze({
  IMMEDIATE: 'IMMEDIATE',
  BATCHED: 'BATCHED',
  DISABLED: 'DISABLED'
});

class LoggingService {
  constructor(client) {
    this.client = client;
  }

  async writeAudit(input) {
    await query(
      `INSERT INTO audit_logs
       (guild_id, actor_user_id, action_key, target_type, target_id, severity, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.guildId,
        input.actorUserId || null,
        input.actionKey,
        input.targetType || null,
        input.targetId || null,
        input.severity || 'INFO',
        input.summary,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
  }

  async getLogSetting(guildId, eventKey) {
    const result = await query(
      `SELECT * FROM log_settings WHERE guild_id = $1 AND event_key = $2 LIMIT 1`,
      [guildId, eventKey]
    );

    const setting = result.rows[0] || null;
    if (!setting || setting.enabled === false || !setting.channel_id) return null;
    if (setting.delivery_mode === LogDeliveryMode.DISABLED) return null;
    return setting;
  }

  async log(input) {
    const setting = await this.getLogSetting(input.guildId, input.eventKey);
    if (!setting) return { sent: false, reason: 'NO_EVENT_CHANNEL' };

    if (setting.delivery_mode === LogDeliveryMode.IMMEDIATE) {
      await this.sendImmediate(input, setting.channel_id);
      return { sent: true, deliveryMode: LogDeliveryMode.IMMEDIATE };
    }

    await query(
      `INSERT INTO log_queue_items (guild_id, event_key, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.guildId, input.eventKey, input.title, input.body, input.metadata ? JSON.stringify(input.metadata) : null]
    );

    return { sent: true, deliveryMode: LogDeliveryMode.BATCHED };
  }

  async sendImmediate(input, channelId) {
    if (!channelId) return;

    const channel = await this.fetchSendableChannel(channelId);
    if (!channel) return;

    const event = getLogEvent(input.eventKey);
    const embed = new EmbedBuilder()
      .setColor(0x7869ff)
      .setTitle(input.title)
      .setDescription(truncate(input.body, 4000))
      .setFooter({ text: event ? `${event.label} • ${input.eventKey}` : input.eventKey })
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
  }

  async flushDueBatches() {
    const settings = await query(
      `SELECT * FROM log_settings
       WHERE enabled = true
         AND delivery_mode = 'BATCHED'
         AND channel_id IS NOT NULL`
    );

    for (const setting of settings.rows) {
      await this.flushBatch(setting.guild_id, setting.event_key, setting.max_batch_items || 25);
    }
  }

  async flushGuildBatches(guildId) {
    const eventKeys = await query(
      `SELECT DISTINCT lqi.event_key
       FROM log_queue_items lqi
       INNER JOIN log_settings ls
         ON ls.guild_id = lqi.guild_id
        AND ls.event_key = lqi.event_key
       WHERE lqi.guild_id = $1
         AND lqi.flushed_at IS NULL
         AND ls.enabled = true
         AND ls.delivery_mode = 'BATCHED'
         AND ls.channel_id IS NOT NULL`,
      [guildId]
    );

    let flushed = 0;
    for (const row of eventKeys.rows) {
      flushed += await this.flushBatch(guildId, row.event_key, 25);
    }
    return flushed;
  }

  async flushBatch(guildId, eventKey, take = 25) {
    const setting = await this.getLogSetting(guildId, eventKey);
    if (!setting || setting.delivery_mode !== LogDeliveryMode.BATCHED) return 0;

    const queued = await query(
      `SELECT * FROM log_queue_items
       WHERE guild_id = $1 AND event_key = $2 AND flushed_at IS NULL
       ORDER BY created_at ASC
       LIMIT $3`,
      [guildId, eventKey, take]
    );

    if (queued.rowCount === 0) return 0;

    const channel = await this.fetchSendableChannel(setting.channel_id);
    if (!channel) return 0;

    const lines = queued.rows.map((item) => {
      const timestamp = new Date(item.created_at).toISOString();
      return `[${timestamp}] ${item.title}\n${item.body}`;
    });

    const body = lines.join('\n\n');
    const summary = lines.slice(0, 10).join('\n\n');
    const event = getLogEvent(eventKey);

    const embed = new EmbedBuilder()
      .setColor(0x5aa7ff)
      .setTitle(`${event ? event.label : eventKey} Log Batch`)
      .setDescription(truncate(summary, 3900))
      .setFooter({ text: `${queued.rowCount} log item${queued.rowCount === 1 ? '' : 's'} • ${eventKey}` })
      .setTimestamp(new Date());

    if (body.length > 3900) {
      const file = new AttachmentBuilder(Buffer.from(body, 'utf8'), {
        name: `${eventKey}-${Date.now()}.txt`
      });
      await channel.send({ embeds: [embed], files: [file] });
    } else {
      await channel.send({ embeds: [embed] });
    }

    await query(
      `UPDATE log_queue_items SET flushed_at = NOW() WHERE id = ANY($1)`,
      [queued.rows.map((item) => item.id)]
    );

    return queued.rowCount;
  }

  async fetchSendableChannel(channelId) {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
    if (typeof channel.send !== 'function') return null;
    return channel;
  }
}

module.exports = { LoggingService, LogDeliveryMode };
