const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { truncate } = require('../../utils/format');
const { getLogEvent, getLogModule } = require('./logEventCatalog');

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

  /**
   * Resolves where a log should be delivered.
   *
   * Logging is organized by module first, such as member, message, voice,
   * moderation, or core. Event-level settings can override the module channel
   * or delivery mode, but no Discord message is sent unless either the event or
   * the parent log module has a configured channel.
   */
  async getLogRouting(guildId, eventKey) {
    const event = getLogEvent(eventKey) || {
      key: eventKey,
      moduleKey: eventKey,
      label: eventKey,
      defaultDelivery: LogDeliveryMode.IMMEDIATE
    };
    const moduleInfo = getLogModule(event.moduleKey);

    const moduleResult = await query(
      `SELECT * FROM log_module_settings WHERE guild_id = $1 AND module_key = $2 LIMIT 1`,
      [guildId, event.moduleKey]
    );
    const eventResult = await query(
      `SELECT * FROM log_settings WHERE guild_id = $1 AND event_key = $2 LIMIT 1`,
      [guildId, eventKey]
    );

    const moduleSetting = moduleResult.rows[0] || null;
    const eventSetting = eventResult.rows[0] || null;

    if (eventSetting && (eventSetting.enabled === false || eventSetting.delivery_mode === LogDeliveryMode.DISABLED)) {
      return null;
    }

    if (moduleSetting && (moduleSetting.enabled === false || moduleSetting.delivery_mode === LogDeliveryMode.DISABLED)) {
      if (!eventSetting || !eventSetting.channel_id) return null;
    }

    const channelId = eventSetting?.channel_id || moduleSetting?.channel_id || null;
    if (!channelId) return null;

    const deliveryMode = eventSetting?.delivery_mode || moduleSetting?.delivery_mode || event.defaultDelivery || LogDeliveryMode.IMMEDIATE;
    if (deliveryMode === LogDeliveryMode.DISABLED) return null;

    return {
      guildId,
      eventKey,
      moduleKey: event.moduleKey,
      channelId,
      deliveryMode,
      batchIntervalSeconds: eventSetting?.batch_interval_seconds || moduleSetting?.batch_interval_seconds || 300,
      maxBatchItems: eventSetting?.max_batch_items || moduleSetting?.max_batch_items || 25,
      event,
      module: moduleInfo
    };
  }

  async log(input) {
    const routing = await this.getLogRouting(input.guildId, input.eventKey);
    if (!routing) return { sent: false, reason: 'NO_LOG_MODULE_CHANNEL' };

    if (routing.deliveryMode === LogDeliveryMode.IMMEDIATE) {
      await this.sendImmediate(input, routing);
      return { sent: true, deliveryMode: LogDeliveryMode.IMMEDIATE, moduleKey: routing.moduleKey };
    }

    await query(
      `INSERT INTO log_queue_items (guild_id, event_key, module_key, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.guildId,
        input.eventKey,
        routing.moduleKey,
        input.title,
        input.body,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );

    return { sent: true, deliveryMode: LogDeliveryMode.BATCHED, moduleKey: routing.moduleKey };
  }

  async sendImmediate(input, routing) {
    if (!routing?.channelId) return;

    const channel = await this.fetchSendableChannel(routing.channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x7869ff)
      .setTitle(input.title)
      .setDescription(truncate(input.body, 4000))
      .setFooter({ text: `${routing.module?.label || routing.moduleKey} • ${routing.event?.label || input.eventKey}` })
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
  }

  async flushDueBatches() {
    const pending = await query(
      `SELECT DISTINCT guild_id, event_key
       FROM log_queue_items
       WHERE flushed_at IS NULL
       ORDER BY guild_id ASC, event_key ASC`
    );

    let flushed = 0;
    for (const row of pending.rows) {
      flushed += await this.flushBatch(row.guild_id, row.event_key);
    }
    return flushed;
  }

  async flushGuildBatches(guildId) {
    const eventKeys = await query(
      `SELECT DISTINCT event_key
       FROM log_queue_items
       WHERE guild_id = $1 AND flushed_at IS NULL
       ORDER BY event_key ASC`,
      [guildId]
    );

    let flushed = 0;
    for (const row of eventKeys.rows) {
      flushed += await this.flushBatch(guildId, row.event_key);
    }
    return flushed;
  }

  async flushBatch(guildId, eventKey, takeOverride = null) {
    const routing = await this.getLogRouting(guildId, eventKey);
    if (!routing || routing.deliveryMode !== LogDeliveryMode.BATCHED) return 0;

    const take = takeOverride || routing.maxBatchItems || 25;
    const queued = await query(
      `SELECT * FROM log_queue_items
       WHERE guild_id = $1 AND event_key = $2 AND flushed_at IS NULL
       ORDER BY created_at ASC
       LIMIT $3`,
      [guildId, eventKey, take]
    );

    if (queued.rowCount === 0) return 0;

    const channel = await this.fetchSendableChannel(routing.channelId);
    if (!channel) return 0;

    const lines = queued.rows.map((item) => {
      const timestamp = new Date(item.created_at).toISOString();
      return `[${timestamp}] ${item.title}\n${item.body}`;
    });

    const body = lines.join('\n\n');
    const summary = lines.slice(0, 10).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(0x5aa7ff)
      .setTitle(`${routing.module?.label || routing.moduleKey} Batch`)
      .setDescription(truncate(summary, 3900))
      .setFooter({ text: `${queued.rowCount} log item${queued.rowCount === 1 ? '' : 's'} • ${routing.event?.label || eventKey}` })
      .setTimestamp(new Date());

    if (body.length > 3900) {
      const file = new AttachmentBuilder(Buffer.from(body, 'utf8'), {
        name: `${routing.moduleKey}-${eventKey}-${Date.now()}.txt`
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
