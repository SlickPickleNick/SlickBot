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
    this.routingCache = new Map();
  }

  invalidateRouting(guildId) {
    if (guildId) {
      for (const key of this.routingCache.keys()) {
        if (key.startsWith(`${guildId}:`)) this.routingCache.delete(key);
      }
    } else {
      this.routingCache.clear();
    }
  }

  clearAllCaches() {
    this.routingCache.clear();
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
    if (!guildId || !eventKey) return null;
    const cacheKey = `${guildId}:${eventKey}`;
    const cached = this.routingCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const event = getLogEvent(eventKey) || {
      key: eventKey,
      moduleKey: eventKey,
      label: eventKey,
      defaultDelivery: LogDeliveryMode.IMMEDIATE
    };
    const moduleInfo = getLogModule(event.moduleKey);

    const [moduleResult, eventResult] = await Promise.all([
      query(
        `SELECT * FROM log_module_settings WHERE guild_id = $1 AND module_key = $2 LIMIT 1`,
        [guildId, event.moduleKey]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT * FROM log_settings WHERE guild_id = $1 AND event_key = $2 LIMIT 1`,
        [guildId, eventKey]
      ).catch(() => ({ rows: [] }))
    ]);

    const moduleSetting = moduleResult.rows[0] || null;
    const eventSetting = eventResult.rows[0] || null;

    if (eventSetting && (eventSetting.enabled === false || eventSetting.delivery_mode === LogDeliveryMode.DISABLED)) {
      this.routingCache.set(cacheKey, null);
      return null;
    }

    if (moduleSetting && (moduleSetting.enabled === false || moduleSetting.delivery_mode === LogDeliveryMode.DISABLED)) {
      if (!eventSetting || !eventSetting.channel_id) {
        this.routingCache.set(cacheKey, null);
        return null;
      }
    }

    const channelId = eventSetting?.channel_id || moduleSetting?.channel_id || null;
    if (!channelId) {
      this.routingCache.set(cacheKey, null);
      return null;
    }

    const configuredDeliveryMode = eventSetting?.delivery_mode || moduleSetting?.delivery_mode || event.defaultDelivery || LogDeliveryMode.IMMEDIATE;
    if (configuredDeliveryMode === LogDeliveryMode.DISABLED) {
      this.routingCache.set(cacheKey, null);
      return null;
    }

    const routing = {
      guildId,
      eventKey,
      moduleKey: event.moduleKey,
      channelId,
      deliveryMode: LogDeliveryMode.IMMEDIATE,
      event,
      module: moduleInfo
    };

    this.routingCache.set(cacheKey, routing);
    return routing;
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
    if (!this.client?.channels?.fetch) return null;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
    if (typeof channel.send !== 'function') return null;
    return channel;
  }

  async setModuleChannel(guildId, moduleKey, channelId, deliveryMode = LogDeliveryMode.IMMEDIATE) {
    const logModule = getLogModule(moduleKey);
    const key = (logModule?.key || moduleKey).toUpperCase();
    await query(
      `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, channel_id, enabled)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (guild_id, module_key)
       DO UPDATE SET
         channel_id = EXCLUDED.channel_id,
         enabled = true,
         delivery_mode = EXCLUDED.delivery_mode,
         updated_at = NOW()`,
      [guildId, key, deliveryMode || LogDeliveryMode.IMMEDIATE, channelId]
    );
    this.invalidateRouting(guildId);
  }

  async setupStarterChannels(guildId, { defaultChannelId, moderationChannelId = null }) {
    if (defaultChannelId) {
      await query(
        `UPDATE guild_configs SET default_log_channel_id = $1, updated_at = NOW() WHERE guild_id = $2`,
        [defaultChannelId, guildId]
      );
    }

    const { StarterLogModuleKeys } = require('./logEventCatalog');
    const modLogKeys = new Set(['MODERATION', 'SAFETY', 'CASES']);
    for (const moduleKey of StarterLogModuleKeys) {
      const logModule = getLogModule(moduleKey);
      const targetChannelId = (moderationChannelId && modLogKeys.has(moduleKey)) ? moderationChannelId : defaultChannelId;
      if (targetChannelId) {
        await query(
          `INSERT INTO log_module_settings (guild_id, module_key, delivery_mode, channel_id, enabled)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (guild_id, module_key)
           DO UPDATE SET
             channel_id = EXCLUDED.channel_id,
             enabled = true,
             delivery_mode = EXCLUDED.delivery_mode,
             updated_at = NOW()`,
          [guildId, moduleKey, logModule?.defaultDelivery || LogDeliveryMode.IMMEDIATE, targetChannelId]
        );
      }
    }
    this.invalidateRouting(guildId);
  }

  async setupLogGroup(guildId, groupKey, channelId) {
    const { getLogGroup } = require('./logEventCatalog');
    const group = getLogGroup(groupKey);
    if (!group) throw new Error(`Unknown log group: ${groupKey}`);

    for (const moduleKey of group.moduleKeys) {
      await this.setModuleChannel(guildId, moduleKey, channelId);
    }
    this.invalidateRouting(guildId);
  }

  async getLogGroupChannels(guildId) {
    const { LOG_GROUPS } = require('./logEventCatalog');
    const res = await query(
      `SELECT module_key, channel_id FROM log_module_settings WHERE guild_id = $1 AND enabled = true`,
      [guildId]
    ).catch(() => ({ rows: [] }));

    const settingsMap = new Map(res.rows.map((r) => [String(r.module_key).toLowerCase(), r.channel_id]));
    const groupMap = new Map();

    for (const group of LOG_GROUPS) {
      const primaryKey = group.moduleKeys[0];
      const channelId = settingsMap.get(primaryKey) || null;
      groupMap.set(group.key, {
        group,
        channelId,
        configuredCount: group.moduleKeys.filter((k) => settingsMap.has(k)).length,
        totalModules: group.moduleKeys.length
      });
    }

    return groupMap;
  }

  async autoCreateAllLogChannels(guild) {
    const { ChannelType } = require('discord.js');
    const { autoCreateChannel } = require('../onboarding/onboardingService');
    const { LOG_GROUPS } = require('./logEventCatalog');

    const category = await autoCreateChannel(guild, {
      name: '📋 Server Logs',
      type: ChannelType.GuildCategory,
      isPrivate: true,
      reason: 'SlickBot Server Logs Category'
    });

    const createdChannels = {};
    for (const group of LOG_GROUPS) {
      const chan = await autoCreateChannel(guild, {
        name: group.defaultChannelName,
        type: ChannelType.GuildText,
        parentId: category.id,
        isPrivate: true,
        topic: group.description,
        reason: `SlickBot ${group.label}`
      });
      await this.setupLogGroup(guild.id, group.key, chan.id);
      createdChannels[group.key] = chan;
    }

    this.invalidateRouting(guild.id);
    return { category, createdChannels };
  }
}

module.exports = { LoggingService, LogDeliveryMode };

