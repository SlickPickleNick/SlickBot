const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { truncate } = require('../../utils/format');

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

  async log(input) {
    const settingResult = await query(
      `SELECT * FROM log_settings WHERE guild_id = $1 AND event_key = $2 LIMIT 1`,
      [input.guildId, input.eventKey]
    );

    const setting = settingResult.rows[0];
    const deliveryMode = setting && setting.enabled === false
      ? LogDeliveryMode.DISABLED
      : setting?.delivery_mode || LogDeliveryMode.BATCHED;

    if (deliveryMode === LogDeliveryMode.DISABLED) return;

    if (deliveryMode === LogDeliveryMode.IMMEDIATE) {
      await this.sendImmediate(input, setting?.channel_id || null);
      return;
    }

    await query(
      `INSERT INTO log_queue_items (guild_id, event_key, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.guildId, input.eventKey, input.title, input.body, input.metadata ? JSON.stringify(input.metadata) : null]
    );
  }

  async sendImmediate(input, preferredChannelId = null) {
    const channelId = await this.resolveLogChannelId(input.guildId, input.eventKey, preferredChannelId);
    if (!channelId) return;

    const channel = await this.fetchSendableChannel(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(input.title)
      .setDescription(truncate(input.body, 4000))
      .setFooter({ text: input.eventKey })
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
  }

  async flushDueBatches() {
    const settings = await query(
      `SELECT * FROM log_settings WHERE enabled = true AND delivery_mode = 'BATCHED'`
    );

    for (const setting of settings.rows) {
      await this.flushBatch(setting.guild_id, setting.event_key, setting.max_batch_items || 25);
    }
  }

  async flushGuildBatches(guildId) {
    const eventKeys = await query(
      `SELECT DISTINCT event_key FROM log_queue_items WHERE guild_id = $1 AND flushed_at IS NULL`,
      [guildId]
    );

    let flushed = 0;
    for (const row of eventKeys.rows) {
      flushed += await this.flushBatch(guildId, row.event_key, 25);
    }
    return flushed;
  }

  async flushBatch(guildId, eventKey, take = 25) {
    const queued = await query(
      `SELECT * FROM log_queue_items
       WHERE guild_id = $1 AND event_key = $2 AND flushed_at IS NULL
       ORDER BY created_at ASC
       LIMIT $3`,
      [guildId, eventKey, take]
    );

    if (queued.rowCount === 0) return 0;

    const channelId = await this.resolveLogChannelId(guildId, eventKey);
    if (!channelId) return 0;

    const channel = await this.fetchSendableChannel(channelId);
    if (!channel) return 0;

    const lines = queued.rows.map((item) => {
      const timestamp = new Date(item.created_at).toISOString();
      return `[${timestamp}] ${item.title}\n${item.body}`;
    });

    const body = lines.join('\n\n');
    const summary = lines.slice(0, 10).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`${eventKey} Log Batch`)
      .setDescription(truncate(summary, 3900))
      .setFooter({ text: `${queued.rowCount} log item${queued.rowCount === 1 ? '' : 's'}` })
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

  async resolveLogChannelId(guildId, eventKey, preferredChannelId = null) {
    if (preferredChannelId) return preferredChannelId;

    const setting = await query(
      `SELECT channel_id FROM log_settings WHERE guild_id = $1 AND event_key = $2 LIMIT 1`,
      [guildId, eventKey]
    );
    if (setting.rows[0]?.channel_id) return setting.rows[0].channel_id;

    const guildConfig = await query(
      `SELECT default_log_channel_id FROM guild_configs WHERE guild_id = $1 LIMIT 1`,
      [guildId]
    );
    return guildConfig.rows[0]?.default_log_channel_id || null;
  }

  async fetchSendableChannel(channelId) {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
    if (typeof channel.send !== 'function') return null;
    return channel;
  }
}

module.exports = { LoggingService, LogDeliveryMode };
