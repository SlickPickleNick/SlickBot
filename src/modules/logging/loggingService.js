const { EmbedBuilder } = require('discord.js');
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

    const configuredDeliveryMode = eventSetting?.delivery_mode || moduleSetting?.delivery_mode || event.defaultDelivery || LogDeliveryMode.IMMEDIATE;
    if (configuredDeliveryMode === LogDeliveryMode.DISABLED) return null;

    return {
      guildId,
      eventKey,
      moduleKey: event.moduleKey,
      channelId,
      deliveryMode: LogDeliveryMode.IMMEDIATE,
      event,
      module: moduleInfo
    };
  }

  async log(input) {
    const routing = await this.getLogRouting(input.guildId, input.eventKey);
    if (!routing) return { sent: false, reason: 'NO_LOG_MODULE_CHANNEL' };

    await this.sendImmediate(input, routing);
    return { sent: true, deliveryMode: LogDeliveryMode.IMMEDIATE, moduleKey: routing.moduleKey };
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

  async fetchSendableChannel(channelId) {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
    if (typeof channel.send !== 'function') return null;
    return channel;
  }
}

module.exports = { LoggingService, LogDeliveryMode };
