const { EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { truncate } = require('../../utils/format');
const { getLogEvent, getLogModule } = require('./logEventCatalog');

const LogDeliveryMode = Object.freeze({
  IMMEDIATE: 'IMMEDIATE',
  BATCHED: 'BATCHED',
  DISABLED: 'DISABLED'
});

function resolveLogColor(eventKey, explicitColor) {
  if (explicitColor !== undefined && explicitColor !== null) return explicitColor;
  const key = String(eventKey || '').toLowerCase();
  if (key.includes('delete') || key.includes('leave') || key.includes('remove') || key.includes('ban') || key.includes('error') || key.includes('fail') || key.includes('expired') || key.includes('ended') || key.includes('timeout')) {
    return 0xed4245;
  }
  if (key.includes('join') || key.includes('create') || key.includes('add') || key.includes('unlock') || key.includes('complete') || key.includes('started') || key.includes('save') || key.includes('active') || key.includes('unban')) {
    return 0x57f287;
  }
  if (key.includes('edit') || key.includes('update') || key.includes('nickname') || key.includes('role') || key.includes('reset') || key.includes('warning') || key.includes('config')) {
    return 0xfee75c;
  }
  return 0x5865f2;
}

let defaultDiscordClient = null;

class LoggingService {
  constructor(client) {
    if (client) {
      this.client = client;
      defaultDiscordClient = client;
    } else if (defaultDiscordClient) {
      this.client = defaultDiscordClient;
    } else {
      this.client = null;
    }
    this.routingCache = new Map();
  }

  setClient(client) {
    if (client) {
      this.client = client;
      defaultDiscordClient = client;
    }
  }

  static setDefaultClient(client) {
    if (client) defaultDiscordClient = client;
  }

  async resetGuildLogging(guildId) {
    await query(`DELETE FROM log_module_settings WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM log_settings WHERE guild_id = $1`, [guildId]);
    await query(`UPDATE guild_configs SET default_log_channel_id = NULL, updated_at = NOW() WHERE guild_id = $1`, [guildId]).catch(() => {});
    this.invalidateRouting(guildId);
    return { success: true };
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
    const cleanEventKey = String(eventKey).trim().toLowerCase();
    const cacheKey = `${guildId}:${cleanEventKey}`;
    const cached = this.routingCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const event = getLogEvent(cleanEventKey) || {
      key: cleanEventKey,
      moduleKey: cleanEventKey,
      label: cleanEventKey,
      defaultDelivery: LogDeliveryMode.IMMEDIATE
    };
    const cleanModuleKey = String(event.moduleKey || cleanEventKey).trim().toLowerCase();
    const moduleInfo = getLogModule(cleanModuleKey);

    const [moduleResult, eventResult] = await Promise.all([
      query(
        `SELECT * FROM log_module_settings WHERE guild_id = $1 AND LOWER(module_key) = $2 LIMIT 1`,
        [guildId, cleanModuleKey]
      ).catch(() => ({ rows: [] })),
      query(
        `SELECT * FROM log_settings WHERE guild_id = $1 AND LOWER(event_key) = $2 LIMIT 1`,
        [guildId, cleanEventKey]
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
      eventKey: cleanEventKey,
      moduleKey: cleanModuleKey,
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
    return { sent: true, deliveryMode: LogDeliveryMode.IMMEDIATE, moduleKey: routing.moduleKey, channelId: routing.channelId };
  }

  async sendImmediate(input, routing) {
    if (!routing?.channelId) return;

    const channel = await this.fetchSendableChannel(routing.channelId);
    if (!channel) return;

    const me = channel.guild?.members?.me;
    if (me && typeof channel.permissionsFor === 'function') {
      const perms = channel.permissionsFor(me);
      if (perms && !perms.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        console.warn(`[LoggingService] Missing permissions to send embed in #${channel.name} (${channel.id})`);
        return;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(resolveLogColor(input.eventKey, input.color))
      .setTitle(input.title ? truncate(input.title, 256) : 'SlickBot Log')
      .setDescription(input.body ? truncate(input.body, 4000) : '')
      .setTimestamp(input.timestamp ? new Date(input.timestamp) : new Date());

    if (input.footer) {
      if (typeof input.footer === 'string') {
        embed.setFooter({ text: truncate(input.footer, 2048) });
      } else if (input.footer.text) {
        embed.setFooter({ text: truncate(input.footer.text, 2048), iconURL: input.footer.iconURL });
      }
    } else {
      embed.setFooter({ text: `${routing.module?.label || routing.moduleKey} • ${routing.event?.label || input.eventKey}` });
    }

    if (input.fields && Array.isArray(input.fields)) {
      embed.addFields(input.fields.slice(0, 25));
    }
    if (input.thumbnailUrl) {
      embed.setThumbnail(input.thumbnailUrl);
    }
    if (input.imageUrl) {
      embed.setImage(input.imageUrl);
    }
    if (input.author) {
      if (typeof input.author === 'string') {
        embed.setAuthor({ name: truncate(input.author, 256) });
      } else if (input.author.name) {
        embed.setAuthor({
          name: truncate(input.author.name, 256),
          iconURL: input.author.iconURL,
          url: input.author.url
        });
      }
    }

    await channel.send({ embeds: [embed] }).catch((err) => {
      console.error(`[LoggingService] Failed to send log to channel ${routing.channelId}:`, err);
    });
  }

  async fetchSendableChannel(channelId) {
    const client = this.client || defaultDiscordClient;
    if (!client?.channels?.fetch) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
    if (typeof channel.send !== 'function') return null;
    return channel;
  }

  async setEventChannel(guildId, eventKey, channelId, deliveryMode = LogDeliveryMode.IMMEDIATE) {
    const cleanKey = String(eventKey).trim().toLowerCase();
    const event = getLogEvent(cleanKey);
    await query(
      `INSERT INTO log_settings (guild_id, event_key, delivery_mode, channel_id, enabled)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (guild_id, event_key)
       DO UPDATE SET
         channel_id = EXCLUDED.channel_id,
         enabled = true,
         delivery_mode = COALESCE(log_settings.delivery_mode, EXCLUDED.delivery_mode),
         updated_at = NOW()`,
      [guildId, cleanKey, deliveryMode || event?.defaultDelivery || LogDeliveryMode.IMMEDIATE, channelId]
    );
    this.invalidateRouting(guildId);
  }

  buildChannelGuideEmbed({ group = null, modules = [] }) {
    let title = '📋 Logging Channel Configured';
    let headerDesc = 'This channel has been designated to receive SlickBot server logs.';

    if (group) {
      title = `${group.emoji} ${group.label} • Channel Setup`;
      headerDesc = group.description;
    } else if (modules.length === 1) {
      title = `📋 ${modules[0].label} Logs • Channel Setup`;
      headerDesc = modules[0].description;
    }

    const moduleEntries = modules.map((mod) => {
      const { getEventsForModule } = require('./logEventCatalog');
      const events = getEventsForModule(mod.key);
      const eventSample = events.slice(0, 5).map((e) => `\`${e.key}\``).join(', ');
      const more = events.length > 5 ? ` +${events.length - 5} more` : '';
      return `• **${mod.label}** (\`${mod.key}\`)\n  ${mod.description}\n  *Events:* ${eventSample}${more}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(title)
      .setDescription([
        `**Overview**\n${headerDesc}`,
        '',
        `**📦 Active Log Modules (${modules.length})**`,
        moduleEntries.join('\n\n') || '• No specific modules mapped.',
        '',
        '**⚙️ Quick Management**',
        '• Use `/logging setup` to re-assign or auto-create log hubs.',
        '• Use `/logging set-channel` or `/logging module-mode` to configure specific modules.',
        '• Use `/logging test event:all` to test log delivery in all configured channels.'
      ].join('\n'))
      .setFooter({ text: '📌 Pinned for easy reference • SlickBot Logging System' })
      .setTimestamp(new Date());

    return embed;
  }

  async postChannelSetupGuide(guildId, channelId, { groupKey = null, moduleKeys = null } = {}) {
    if (!channelId) return null;
    const channel = await this.fetchSendableChannel(channelId);
    if (!channel || typeof channel.send !== 'function') return null;

    const { getLogGroup, getLogModule, LOG_GROUPS } = require('./logEventCatalog');

    let group = groupKey ? getLogGroup(groupKey) : null;
    let targetModuleKeys = [];

    if (group) {
      targetModuleKeys = group.moduleKeys;
    } else if (moduleKeys && Array.isArray(moduleKeys) && moduleKeys.length > 0) {
      targetModuleKeys = moduleKeys;
    } else {
      const res = await query(
        `SELECT module_key FROM log_module_settings WHERE guild_id = $1 AND channel_id = $2 AND enabled = true`,
        [guildId, channelId]
      ).catch(() => ({ rows: [] }));
      targetModuleKeys = res.rows.map((r) => String(r.module_key).toLowerCase());
      group = LOG_GROUPS.find((g) => g.moduleKeys.every((k) => targetModuleKeys.includes(k))) || null;
    }

    const resolvedModules = targetModuleKeys.map((k) => getLogModule(k)).filter(Boolean);
    if (!resolvedModules.length) return null;

    const embed = this.buildChannelGuideEmbed({ group, modules: resolvedModules });

    try {
      const msg = await channel.send({ embeds: [embed] });
      if (msg && typeof msg.pin === 'function') {
        await msg.pin().catch(() => {});
      }
      return msg;
    } catch (err) {
      console.error(`[LoggingService] Failed to post/pin setup guide in #${channel.name || channelId}:`, err);
      return null;
    }
  }

  async setModuleChannel(guildId, moduleKey, channelId, deliveryMode = LogDeliveryMode.IMMEDIATE, options = { sendGuide: true }) {
    const logModule = getLogModule(moduleKey);
    const key = String(logModule?.key || moduleKey).trim().toLowerCase();
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

    if (options?.sendGuide && channelId) {
      await this.postChannelSetupGuide(guildId, channelId, { moduleKeys: [key] }).catch(() => {});
    }
  }

  async setupStarterChannels(guildId, { defaultChannelId, moderationChannelId = null }) {
    if (defaultChannelId) {
      await query(
        `UPDATE guild_configs SET default_log_channel_id = $1, updated_at = NOW() WHERE guild_id = $2`,
        [defaultChannelId, guildId]
      );
    }

    const { StarterLogModuleKeys } = require('./logEventCatalog');
    const modLogKeys = new Set(['moderation', 'lockdown', 'temp-roles']);
    for (const moduleKey of StarterLogModuleKeys) {
      const logModule = getLogModule(moduleKey);
      const cleanKey = String(moduleKey).trim().toLowerCase();
      const targetChannelId = (moderationChannelId && modLogKeys.has(cleanKey)) ? moderationChannelId : defaultChannelId;
      if (targetChannelId) {
        await this.setModuleChannel(guildId, cleanKey, targetChannelId, logModule?.defaultDelivery || LogDeliveryMode.IMMEDIATE, { sendGuide: false });
      }
    }
    this.invalidateRouting(guildId);

    if (defaultChannelId) {
      await this.postChannelSetupGuide(guildId, defaultChannelId, { groupKey: 'CORE_SYSTEM' }).catch(() => {});
    }
    if (moderationChannelId) {
      await this.postChannelSetupGuide(guildId, moderationChannelId, { groupKey: 'MODERATION_SAFETY' }).catch(() => {});
    }
  }

  async setupLogGroup(guildId, groupKey, channelId, options = { sendGuide: true }) {
    const { getLogGroup } = require('./logEventCatalog');
    const group = getLogGroup(groupKey);
    if (!group) throw new Error(`Unknown log group: ${groupKey}`);

    for (const moduleKey of group.moduleKeys) {
      await this.setModuleChannel(guildId, moduleKey, channelId, LogDeliveryMode.IMMEDIATE, { sendGuide: false });
    }
    this.invalidateRouting(guildId);

    if (options?.sendGuide && channelId) {
      await this.postChannelSetupGuide(guildId, channelId, { groupKey }).catch(() => {});
    }
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

  async testAllHubs(guild, user) {
    const { LOG_GROUPS } = require('./logEventCatalog');
    const groupChannels = await this.getLogGroupChannels(guild.id);
    const results = [];

    for (const group of LOG_GROUPS) {
      const info = groupChannels.get(group.key);
      const primaryKey = group.moduleKeys[0];
      const res = await this.log({
        guildId: guild.id,
        eventKey: primaryKey,
        title: `${group.emoji} ${group.label} Test Log`,
        body: [
          `This is a test notification from the **${group.label}** logging hub.`,
          '',
          `• Target Log Channel: ${info?.channelId ? `<#${info.channelId}>` : '*Not configured*'}`,
          `• Primary Module: \`${primaryKey}\``,
          `• Underlying Modules: ${group.moduleKeys.map((k) => `\`${k}\``).join(', ')}`,
          `• Triggered by: <@${user.id}>`
        ].join('\n'),
        actorUserId: user.id
      });
      results.push({ group, ok: Boolean(res.sent), channelId: info?.channelId || null });
    }

    return results;
  }
}

module.exports = { LoggingService, LogDeliveryMode, resolveLogColor };

