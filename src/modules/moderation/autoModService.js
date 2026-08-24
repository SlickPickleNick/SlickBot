const {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');
const { query } = require('../../services/db');
const {
  createBaseEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createErrorEmbed,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { truncate } = require('../../utils/format');

const DEFAULT_AUTOMOD_CONFIG = Object.freeze({
  enabled: true,
  anti_invites_enabled: true,
  anti_invites_action: 'DELETE',
  anti_invites_timeout_seconds: 60,
  anti_links_enabled: false,
  anti_links_action: 'DELETE',
  anti_links_timeout_seconds: 60,
  anti_spam_enabled: true,
  anti_spam_action: 'DELETE',
  anti_spam_max_messages: 5,
  anti_spam_seconds: 4,
  anti_spam_timeout_seconds: 60,
  anti_duplicates_enabled: true,
  anti_duplicates_action: 'DELETE',
  anti_duplicates_max_count: 3,
  anti_duplicates_seconds: 10,
  anti_duplicates_timeout_seconds: 60,
  anti_mentions_enabled: true,
  anti_mentions_action: 'DELETE',
  anti_mentions_max_count: 5,
  anti_mentions_timeout_seconds: 60,
  anti_caps_enabled: false,
  anti_caps_action: 'DELETE',
  anti_caps_min_chars: 12,
  anti_caps_percent: 70,
  anti_caps_timeout_seconds: 60,
  anti_emojis_enabled: false,
  anti_emojis_action: 'DELETE',
  anti_emojis_max_count: 8,
  anti_emojis_timeout_seconds: 60,
  anti_zalgo_enabled: true,
  anti_zalgo_action: 'DELETE',
  anti_zalgo_timeout_seconds: 60,
  default_blacklist_enabled: true,
  word_blacklist_action: 'DELETE',
  word_blacklist_timeout_seconds: 300,
  exempt_roles: [],
  exempt_channels: [],
  exempt_users: [],
  whitelisted_domains: ['youtube.com', 'youtu.be', 'twitch.tv', 'twitter.com', 'x.com', 'github.com', 'tenor.com', 'giphy.com', 'discord.com', 'discord.gg'],
  whitelisted_invites: [],
  dm_notification_enabled: true,
  alert_channel_id: null,
  raid_shield_enabled: true,
  raid_join_threshold: 8,
  raid_join_seconds: 10,
  raid_min_account_age_hours: 24,
  raid_alert_channel_id: null,
  timeout_role_id: null,
  timeout_role_mode: 'HIDE',
  timeout_role_lock_new_channels: true,
  timeout_role_exempt_channel_ids: []
});

// Standard curated built-in blacklist of known phishing/scam terms & malicious patterns
const DEFAULT_BLACKLIST_PATTERNS = Object.freeze([
  'discordnitro.gift',
  'discord-nitro.gift',
  'dlscord.gift',
  'dlscord.gg',
  'discord-app.net',
  'steamcommunity-trade',
  'grabify.link',
  'iplogger.org',
  'iplogger.com',
  'free nitro',
  'steam gift card',
  '@everyone free nitro'
]);

const ZALGO_REGEX = /[\u0300-\u036f\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;
const DISCORD_INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li|com\/invite)|dsc\.gg)\/([a-zA-Z0-9_-]+)/gi;
const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;
const EMOJI_REGEX = /(?:<a?:[a-zA-Z0-9_]+:\d+>|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu;

const configCache = new Map(); // guildId -> config
const blacklistCache = new Map(); // guildId -> rows
const messageHistory = new Map(); // guildId:userId -> array of { text, timestamp }
const joinHistory = new Map(); // guildId -> array of { userId, userTag, joinedAt, createdAt }
const activeRaidAlerts = new Map(); // guildId -> { alertTimestamp, recentJoins }

class AutoModService {
  constructor() {
    this.configCache = configCache;
    this.blacklistCache = blacklistCache;
    this.messageHistory = messageHistory;
    this.joinHistory = joinHistory;
    this.activeRaidAlerts = activeRaidAlerts;
  }

  clearAllCaches() {
    configCache.clear();
    blacklistCache.clear();
    messageHistory.clear();
    joinHistory.clear();
    activeRaidAlerts.clear();
  }

  invalidateGuild(guildId) {
    if (!guildId) {
      this.clearAllCaches();
      return;
    }
    configCache.delete(guildId);
    blacklistCache.delete(guildId);
    joinHistory.delete(guildId);
    activeRaidAlerts.delete(guildId);
    for (const key of messageHistory.keys()) {
      if (key.startsWith(`${guildId}:`)) messageHistory.delete(key);
    }
  }

  invalidateConfigCache(guildId) {
    if (guildId) configCache.delete(guildId);
    else configCache.clear();
  }

  // --- Configuration & Cache Management ---

  async getConfig(guildId) {
    if (this.configCache.has(guildId)) {
      return this.configCache.get(guildId);
    }
    const res = await query(`SELECT * FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    if (res.rows[0]) {
      const config = { ...DEFAULT_AUTOMOD_CONFIG, ...res.rows[0] };
      this.configCache.set(guildId, config);
      return config;
    }
    return { ...DEFAULT_AUTOMOD_CONFIG, guild_id: guildId };
  }

  async upsertConfig(guildId, updates = {}) {
    const current = await this.getConfig(guildId);
    const merged = { ...current, ...updates, guild_id: guildId };

    const res = await query(
      `INSERT INTO automod_configs (
        guild_id, enabled,
        anti_invites_enabled, anti_invites_action, anti_invites_timeout_seconds,
        anti_links_enabled, anti_links_action, anti_links_timeout_seconds,
        anti_spam_enabled, anti_spam_action, anti_spam_max_messages, anti_spam_seconds, anti_spam_timeout_seconds,
        anti_duplicates_enabled, anti_duplicates_action, anti_duplicates_max_count, anti_duplicates_seconds, anti_duplicates_timeout_seconds,
        anti_mentions_enabled, anti_mentions_action, anti_mentions_max_count, anti_mentions_timeout_seconds,
        anti_caps_enabled, anti_caps_action, anti_caps_min_chars, anti_caps_percent, anti_caps_timeout_seconds,
        anti_emojis_enabled, anti_emojis_action, anti_emojis_max_count, anti_emojis_timeout_seconds,
        anti_zalgo_enabled, anti_zalgo_action, anti_zalgo_timeout_seconds,
        default_blacklist_enabled, word_blacklist_action, word_blacklist_timeout_seconds,
        exempt_roles, exempt_channels, exempt_users, whitelisted_domains, whitelisted_invites,
        dm_notification_enabled, alert_channel_id,
        raid_shield_enabled, raid_join_threshold, raid_join_seconds, raid_min_account_age_hours, raid_alert_channel_id,
        timeout_role_id, timeout_role_mode, timeout_role_lock_new_channels, timeout_role_exempt_channel_ids,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
        $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, NOW()
      ) ON CONFLICT (guild_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        anti_invites_enabled = EXCLUDED.anti_invites_enabled,
        anti_invites_action = EXCLUDED.anti_invites_action,
        anti_invites_timeout_seconds = EXCLUDED.anti_invites_timeout_seconds,
        anti_links_enabled = EXCLUDED.anti_links_enabled,
        anti_links_action = EXCLUDED.anti_links_action,
        anti_links_timeout_seconds = EXCLUDED.anti_links_timeout_seconds,
        anti_spam_enabled = EXCLUDED.anti_spam_enabled,
        anti_spam_action = EXCLUDED.anti_spam_action,
        anti_spam_max_messages = EXCLUDED.anti_spam_max_messages,
        anti_spam_seconds = EXCLUDED.anti_spam_seconds,
        anti_spam_timeout_seconds = EXCLUDED.anti_spam_timeout_seconds,
        anti_duplicates_enabled = EXCLUDED.anti_duplicates_enabled,
        anti_duplicates_action = EXCLUDED.anti_duplicates_action,
        anti_duplicates_max_count = EXCLUDED.anti_duplicates_max_count,
        anti_duplicates_seconds = EXCLUDED.anti_duplicates_seconds,
        anti_duplicates_timeout_seconds = EXCLUDED.anti_duplicates_timeout_seconds,
        anti_mentions_enabled = EXCLUDED.anti_mentions_enabled,
        anti_mentions_action = EXCLUDED.anti_mentions_action,
        anti_mentions_max_count = EXCLUDED.anti_mentions_max_count,
        anti_mentions_timeout_seconds = EXCLUDED.anti_mentions_timeout_seconds,
        anti_caps_enabled = EXCLUDED.anti_caps_enabled,
        anti_caps_action = EXCLUDED.anti_caps_action,
        anti_caps_min_chars = EXCLUDED.anti_caps_min_chars,
        anti_caps_percent = EXCLUDED.anti_caps_percent,
        anti_caps_timeout_seconds = EXCLUDED.anti_caps_timeout_seconds,
        anti_emojis_enabled = EXCLUDED.anti_emojis_enabled,
        anti_emojis_action = EXCLUDED.anti_emojis_action,
        anti_emojis_max_count = EXCLUDED.anti_emojis_max_count,
        anti_emojis_timeout_seconds = EXCLUDED.anti_emojis_timeout_seconds,
        anti_zalgo_enabled = EXCLUDED.anti_zalgo_enabled,
        anti_zalgo_action = EXCLUDED.anti_zalgo_action,
        anti_zalgo_timeout_seconds = EXCLUDED.anti_zalgo_timeout_seconds,
        default_blacklist_enabled = EXCLUDED.default_blacklist_enabled,
        word_blacklist_action = EXCLUDED.word_blacklist_action,
        word_blacklist_timeout_seconds = EXCLUDED.word_blacklist_timeout_seconds,
        exempt_roles = EXCLUDED.exempt_roles,
        exempt_channels = EXCLUDED.exempt_channels,
        exempt_users = EXCLUDED.exempt_users,
        whitelisted_domains = EXCLUDED.whitelisted_domains,
        whitelisted_invites = EXCLUDED.whitelisted_invites,
        dm_notification_enabled = EXCLUDED.dm_notification_enabled,
        alert_channel_id = EXCLUDED.alert_channel_id,
        raid_shield_enabled = EXCLUDED.raid_shield_enabled,
        raid_join_threshold = EXCLUDED.raid_join_threshold,
        raid_join_seconds = EXCLUDED.raid_join_seconds,
        raid_min_account_age_hours = EXCLUDED.raid_min_account_age_hours,
        raid_alert_channel_id = EXCLUDED.raid_alert_channel_id,
        timeout_role_id = EXCLUDED.timeout_role_id,
        timeout_role_mode = EXCLUDED.timeout_role_mode,
        timeout_role_lock_new_channels = EXCLUDED.timeout_role_lock_new_channels,
        timeout_role_exempt_channel_ids = EXCLUDED.timeout_role_exempt_channel_ids,
        updated_at = NOW()
      RETURNING *`,
      [
        guildId, merged.enabled,
        merged.anti_invites_enabled, merged.anti_invites_action, merged.anti_invites_timeout_seconds,
        merged.anti_links_enabled, merged.anti_links_action, merged.anti_links_timeout_seconds,
        merged.anti_spam_enabled, merged.anti_spam_action, merged.anti_spam_max_messages, merged.anti_spam_seconds, merged.anti_spam_timeout_seconds,
        merged.anti_duplicates_enabled, merged.anti_duplicates_action, merged.anti_duplicates_max_count, merged.anti_duplicates_seconds, merged.anti_duplicates_timeout_seconds,
        merged.anti_mentions_enabled, merged.anti_mentions_action, merged.anti_mentions_max_count, merged.anti_mentions_timeout_seconds,
        merged.anti_caps_enabled, merged.anti_caps_action, merged.anti_caps_min_chars, merged.anti_caps_percent, merged.anti_caps_timeout_seconds,
        merged.anti_emojis_enabled, merged.anti_emojis_action, merged.anti_emojis_max_count, merged.anti_emojis_timeout_seconds,
        merged.anti_zalgo_enabled, merged.anti_zalgo_action, merged.anti_zalgo_timeout_seconds,
        merged.default_blacklist_enabled, merged.word_blacklist_action, merged.word_blacklist_timeout_seconds,
        merged.exempt_roles, merged.exempt_channels, merged.exempt_users, merged.whitelisted_domains, merged.whitelisted_invites,
        merged.dm_notification_enabled, merged.alert_channel_id,
        merged.raid_shield_enabled, merged.raid_join_threshold, merged.raid_join_seconds, merged.raid_min_account_age_hours, merged.raid_alert_channel_id,
        merged.timeout_role_id || null, merged.timeout_role_mode || 'HIDE', Boolean(merged.timeout_role_lock_new_channels), merged.timeout_role_exempt_channel_ids || []
      ]
    );

    const saved = res.rows[0] ? { ...DEFAULT_AUTOMOD_CONFIG, ...res.rows[0] } : merged;
    this.configCache.set(guildId, saved);
    return saved;
  }

  // --- Timeout Role Management & Synchronization ---

  async createTimeoutRole(guild) {
    if (!guild || typeof guild.roles?.create !== 'function') {
      return { ok: false, reason: 'Guild role manager not available.' };
    }

    let role = null;
    if (guild.roles?.cache) {
      if (typeof guild.roles.cache.find === 'function') {
        role = guild.roles.cache.find((r) => r.name?.toLowerCase() === 'timeout' || r.name?.toLowerCase() === 'muted');
      } else {
        role = Array.from(guild.roles.cache.values()).find((r) => r.name?.toLowerCase() === 'timeout' || r.name?.toLowerCase() === 'muted');
      }
    }
    if (!role) {
      role = await guild.roles.create({
        name: 'Timeout',
        permissions: [],
        reason: 'SlickBot AutoMod/Moderation Timeout Role'
      });
    }

    await this.upsertConfig(guild.id, {
      timeout_role_id: role.id
    });

    const syncResult = await this.syncTimeoutRolePermissions(guild, { timeoutRoleId: role.id });
    return { ok: true, role, syncResult };
  }

  async syncTimeoutRolePermissions(guild, options = {}) {
    if (!guild || !guild.channels) {
      return { ok: false, reason: 'Guild channel manager not available.' };
    }

    const config = await this.getConfig(guild.id);
    const roleId = options.timeoutRoleId || config.timeout_role_id;
    if (!roleId) {
      return { ok: false, reason: 'No timeout role configured.' };
    }

    // Resolve Appeals review channel ID
    const appealRes = await query(`SELECT review_channel_id FROM appeal_configs WHERE guild_id = $1 LIMIT 1`, [guild.id]).catch(() => ({ rows: [] }));
    const appealsChannelId = appealRes.rows[0]?.review_channel_id || null;

    const exemptIds = new Set([
      ...(config.timeout_role_exempt_channel_ids || [])
    ]);
    if (appealsChannelId) exemptIds.add(appealsChannelId);

    const mode = options.mode || config.timeout_role_mode || 'HIDE';
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    const channelList = channels instanceof Map || (channels && typeof channels.values === 'function') ? Array.from(channels.values()) : Array.isArray(channels) ? channels : [];
    let syncedChannelsCount = 0;
    let exemptCount = 0;

    const BATCH_SIZE = 5;
    for (let i = 0; i < channelList.length; i += BATCH_SIZE) {
      const batch = channelList.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (channel) => {
        if (!channel) return;

        // Skip tickets (which have opener-specific permissions)
        const isTicket = channel.name?.toLowerCase().startsWith('ticket-') || channel.topic?.includes('SlickBot ticket #');
        if (isTicket) return;

        const isAppeals = channel.id === appealsChannelId;
        const isExempt = exemptIds.has(channel.id);

        if (isAppeals || isExempt) {
          exemptCount++;
          // Appeals and exempt channels: View & Read only (deny send/react)
          await channel.permissionOverwrites?.edit(roleId, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            AddReactions: false
          }, { reason: 'SlickBot Timeout Role Appeals/Exempt Access' }).catch(() => {});
          syncedChannelsCount++;
        } else {
          // Standard channels
          if (mode === 'MUTE_ONLY') {
            if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
              await channel.permissionOverwrites?.edit(roleId, {
                ViewChannel: true,
                Connect: false,
                Speak: false,
                Stream: false,
                RequestToSpeak: false
              }, { reason: 'SlickBot Timeout Role Mute Permissions' }).catch(() => {});
            } else if (channel.type === ChannelType.GuildCategory) {
              await channel.permissionOverwrites?.edit(roleId, {
                ViewChannel: true,
                SendMessages: false,
                Connect: false
              }, { reason: 'SlickBot Timeout Role Mute Permissions' }).catch(() => {});
            } else {
              await channel.permissionOverwrites?.edit(roleId, {
                ViewChannel: true,
                ReadMessageHistory: true,
                SendMessages: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                AddReactions: false
              }, { reason: 'SlickBot Timeout Role Mute Permissions' }).catch(() => {});
            }
          } else {
            // 'HIDE' mode (Default)
            if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
              await channel.permissionOverwrites?.edit(roleId, {
                ViewChannel: false,
                Connect: false,
                Speak: false,
                Stream: false,
                RequestToSpeak: false
              }, { reason: 'SlickBot Timeout Role Hide Permissions' }).catch(() => {});
            } else if (channel.type === ChannelType.GuildCategory) {
              await channel.permissionOverwrites?.edit(roleId, {
                ViewChannel: false,
                SendMessages: false,
                Connect: false
              }, { reason: 'SlickBot Timeout Role Hide Permissions' }).catch(() => {});
            } else {
              await channel.permissionOverwrites?.edit(roleId, {
                ViewChannel: false,
                SendMessages: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                AddReactions: false
              }, { reason: 'SlickBot Timeout Role Hide Permissions' }).catch(() => {});
            }
          }
          syncedChannelsCount++;
        }
      }));
    }

    return { ok: true, syncedChannelsCount, exemptCount, mode };
  }

  async handleChannelCreate(channel) {
    if (!channel || !channel.guild) return;
    const isTicket = channel.name?.toLowerCase().startsWith('ticket-') || channel.topic?.includes('SlickBot ticket #');
    if (isTicket) return;

    const config = await this.getConfig(channel.guild.id);
    if (!config.timeout_role_id || config.timeout_role_lock_new_channels === false) return;

    // Check if appeals channel
    const appealRes = await query(`SELECT review_channel_id FROM appeal_configs WHERE guild_id = $1 LIMIT 1`, [channel.guild.id]).catch(() => ({ rows: [] }));
    const appealsChannelId = appealRes.rows[0]?.review_channel_id || null;
    if (channel.id === appealsChannelId || (config.timeout_role_exempt_channel_ids || []).includes(channel.id)) {
      await channel.permissionOverwrites?.edit(config.timeout_role_id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false
      }, { reason: 'SlickBot Timeout Role Auto-Lock Exempt Channel' }).catch(() => {});
      return;
    }

    const mode = config.timeout_role_mode || 'HIDE';
    if (mode === 'MUTE_ONLY') {
      await channel.permissionOverwrites?.edit(config.timeout_role_id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
        Connect: false,
        Speak: false
      }, { reason: 'SlickBot Timeout Role Auto-Lock Channel' }).catch(() => {});
    } else {
      await channel.permissionOverwrites?.edit(config.timeout_role_id, {
        ViewChannel: false,
        SendMessages: false,
        SendMessagesInThreads: false,
        AddReactions: false,
        Connect: false,
        Speak: false
      }, { reason: 'SlickBot Timeout Role Auto-Lock Channel' }).catch(() => {});
    }
  }

  async applyTimeout(member, durationSeconds, reason, actorUser, options = {}) {
    if (!member || !member.guild) return { ok: false, reason: 'Invalid guild member.' };
    const guild = member.guild;
    const config = await this.getConfig(guild.id);
    const secs = Math.max(1, Number(durationSeconds) || 60);
    const timeoutMs = secs * 1000;
    const results = {
      ok: true,
      nativeTimeout: false,
      roleApplied: false,
      timeoutRoleId: config.timeout_role_id || null,
      roleName: null,
      roleError: null
    };

    // 1. Native Discord Timeout (up to 28 days max in Discord API)
    if (member.moderatable && timeoutMs > 0 && timeoutMs <= 28 * 24 * 60 * 60 * 1000) {
      await member.timeout(timeoutMs, reason || 'Applied by SlickBot').then(() => { results.nativeTimeout = true; }).catch((err) => {
        results.nativeError = err.message;
      });
    }

    // 2. Timeout Role Application (tracked via TemporaryRoleService with direct fallback)
    if (config.timeout_role_id) {
      let role = null;
      if (guild.roles) {
        role = guild.roles.cache?.get(config.timeout_role_id) || await guild.roles.fetch(config.timeout_role_id).catch(() => null);
      }
      if (role) {
        results.roleName = role.name;
        let assigned = false;
        try {
          const { TemporaryRoleService } = require('./tempRoleService');
          const tempRoles = new TemporaryRoleService();
          const tempRes = await tempRoles.addTemporaryRole({
            guild,
            user: member.user || { id: member.id, tag: member.user?.tag || member.id },
            role,
            durationText: `${secs}s`,
            actorUser: actorUser || { id: guild.client?.user?.id || 'AUTOMOD', tag: 'SlickBot AutoMod' },
            reason: reason || 'SlickBot Timeout'
          });
          assigned = Boolean(tempRes && tempRes.ok);
        } catch {}

        if (!assigned) {
          const directAdded = await member.roles?.add(role.id, reason || 'SlickBot Timeout').then(() => true).catch((err) => {
            results.roleError = err.message;
            return false;
          });
          if (directAdded) {
            assigned = true;
            results.roleError = null;
          }
        }

        results.roleApplied = assigned;
      } else {
        results.roleError = 'Configured timeout role was not found in server.';
      }
    } else {
      results.roleError = 'No timeout role configured in Auto-Mod / Moderation settings.';
    }

    return results;
  }

  async removeTimeout(member, reason, actorUser) {
    if (!member || !member.guild) return { ok: false, reason: 'Invalid guild member.' };
    const guild = member.guild;
    const config = await this.getConfig(guild.id);
    const results = {
      ok: true,
      nativeUntimeout: false,
      roleRemoved: false,
      timeoutRoleId: config.timeout_role_id || null,
      roleName: null,
      roleError: null
    };

    // 1. Native Untimeout
    if (member.isCommunicationDisabled && member.isCommunicationDisabled()) {
      await member.timeout(null, reason || 'Untimeout by staff').then(() => { results.nativeUntimeout = true; }).catch(() => {});
    }

    // 2. Remove Timeout Role
    if (config.timeout_role_id) {
      let role = null;
      if (guild.roles) {
        role = guild.roles.cache?.get(config.timeout_role_id) || await guild.roles.fetch(config.timeout_role_id).catch(() => null);
      }
      if (role) {
        results.roleName = role.name;
        let removed = false;
        try {
          const { TemporaryRoleService } = require('./tempRoleService');
          const tempRoles = new TemporaryRoleService();
          const tempRes = await tempRoles.removeTemporaryRole({
            guild,
            user: member.user || { id: member.id, tag: member.user?.tag || member.id },
            role,
            actorUser,
            reason
          });
          removed = Boolean(tempRes && tempRes.ok);
        } catch {}

        if (!removed) {
          const directRemoved = await member.roles?.remove(role.id, reason || 'Untimeout by staff').then(() => true).catch(() => false);
          if (directRemoved) removed = true;
        }
        results.roleRemoved = removed;
      }
    }

    return results;
  }

  // --- Blacklist Management ---

  async getBlacklist(guildId) {
    if (this.blacklistCache.has(guildId)) {
      return this.blacklistCache.get(guildId);
    }
    const res = await query(
      `SELECT * FROM automod_blacklists WHERE guild_id = $1 ORDER BY created_at DESC`,
      [guildId]
    ).catch(() => ({ rows: [] }));
    const rows = res.rows || [];
    this.blacklistCache.set(guildId, rows);
    return rows;
  }

  async addBlacklistEntry(guildId, pattern, matchType = 'WORD', severity = 'DELETE', userId = null) {
    const cleanPattern = String(pattern || '').trim();
    if (!cleanPattern) return { ok: false, reason: 'Pattern cannot be empty.' };

    const res = await query(
      `INSERT INTO automod_blacklists (guild_id, pattern, match_type, severity, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [guildId, cleanPattern, matchType.toUpperCase(), severity.toUpperCase(), userId]
    );

    this.blacklistCache.delete(guildId);
    return { ok: true, entry: res.rows[0] };
  }

  async removeBlacklistEntry(guildId, entryIdOrPattern) {
    const target = String(entryIdOrPattern || '').trim();
    const res = await query(
      `DELETE FROM automod_blacklists
       WHERE guild_id = $1 AND (id = $2 OR LOWER(pattern) = LOWER($2))
       RETURNING *`,
      [guildId, target]
    );

    this.blacklistCache.delete(guildId);
    return { ok: res.rowCount > 0, count: res.rowCount };
  }

  async clearBlacklist(guildId) {
    const res = await query(`DELETE FROM automod_blacklists WHERE guild_id = $1`, [guildId]);
    this.blacklistCache.delete(guildId);
    return { ok: true, count: res.rowCount };
  }

  // --- Whitelist Management ---

  async addWhitelistItem(guildId, type, value) {
    const config = await this.getConfig(guildId);
    const val = String(value || '').trim();
    if (!val) return { ok: false, reason: 'Value cannot be empty.' };

    const updates = {};
    if (type === 'ROLE') {
      const roles = new Set(config.exempt_roles || []);
      roles.add(val);
      updates.exempt_roles = Array.from(roles);
    } else if (type === 'CHANNEL') {
      const channels = new Set(config.exempt_channels || []);
      channels.add(val);
      updates.exempt_channels = Array.from(channels);
    } else if (type === 'USER') {
      const users = new Set(config.exempt_users || []);
      users.add(val);
      updates.exempt_users = Array.from(users);
    } else if (type === 'DOMAIN') {
      const domains = new Set(config.whitelisted_domains || []);
      domains.add(val.toLowerCase());
      updates.whitelisted_domains = Array.from(domains);
    } else if (type === 'INVITE') {
      const invites = new Set(config.whitelisted_invites || []);
      invites.add(val);
      updates.whitelisted_invites = Array.from(invites);
    } else {
      return { ok: false, reason: 'Invalid whitelist category.' };
    }

    const saved = await this.upsertConfig(guildId, updates);
    return { ok: true, config: saved };
  }

  async removeWhitelistItem(guildId, type, value) {
    const config = await this.getConfig(guildId);
    const val = String(value || '').trim().toLowerCase();

    const updates = {};
    if (type === 'ROLE') {
      updates.exempt_roles = (config.exempt_roles || []).filter((r) => r !== val && r !== value);
    } else if (type === 'CHANNEL') {
      updates.exempt_channels = (config.exempt_channels || []).filter((c) => c !== val && c !== value);
    } else if (type === 'USER') {
      updates.exempt_users = (config.exempt_users || []).filter((u) => u !== val && u !== value);
    } else if (type === 'DOMAIN') {
      updates.whitelisted_domains = (config.whitelisted_domains || []).filter((d) => d.toLowerCase() !== val);
    } else if (type === 'INVITE') {
      updates.whitelisted_invites = (config.whitelisted_invites || []).filter((i) => i.toLowerCase() !== val);
    } else {
      return { ok: false, reason: 'Invalid whitelist category.' };
    }

    const saved = await this.upsertConfig(guildId, updates);
    return { ok: true, config: saved };
  }

  // --- Exemption Evaluation ---

  isExempt(member, channel, config) {
    if (!member) return true;
    if (member.id === member.guild?.ownerId) return true;
    if (member.permissions?.has(PermissionFlagsBits.Administrator) || member.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return true;
    }
    if ((config.exempt_users || []).includes(member.id)) return true;
    if (channel && (config.exempt_channels || []).includes(channel.id)) return true;
    if (member.roles?.cache) {
      for (const roleId of (config.exempt_roles || [])) {
        if (member.roles.cache.has(roleId)) return true;
      }
    }
    return false;
  }

  // --- Rule Evaluators ---

  checkAntiInvites(text, config) {
    if (!config.anti_invites_enabled) return null;
    const matches = Array.from(text.matchAll(DISCORD_INVITE_REGEX));
    if (!matches.length) return null;

    const whitelisted = (config.whitelisted_invites || []).map((i) => i.toLowerCase());
    for (const match of matches) {
      const code = match[1]?.toLowerCase();
      if (!whitelisted.includes(code)) {
        return {
          rule: 'ANTI_INVITES',
          label: 'Discord Server Invite Link',
          action: config.anti_invites_action || 'DELETE',
          timeoutSeconds: config.anti_invites_timeout_seconds || 60,
          matched: match[0]
        };
      }
    }
    return null;
  }

  checkAntiLinks(text, config) {
    if (!config.anti_links_enabled) return null;
    const matches = Array.from(text.matchAll(URL_REGEX));
    if (!matches.length) return null;

    const whitelisted = (config.whitelisted_domains || []).map((d) => d.toLowerCase());
    for (const match of matches) {
      const urlString = match[0].toLowerCase();
      const isAllowed = whitelisted.some((domain) => urlString.includes(domain));
      if (!isAllowed) {
        return {
          rule: 'ANTI_LINKS',
          label: 'Unauthorized External Link',
          action: config.anti_links_action || 'DELETE',
          timeoutSeconds: config.anti_links_timeout_seconds || 60,
          matched: match[0]
        };
      }
    }
    return null;
  }

  checkAntiMentions(message, config) {
    if (!config.anti_mentions_enabled) return null;
    const maxCount = config.anti_mentions_max_count || 5;
    const userMentions = message.mentions?.users?.size || 0;
    const roleMentions = message.mentions?.roles?.size || 0;
    const total = userMentions + roleMentions;

    if (total >= maxCount) {
      return {
        rule: 'ANTI_MENTIONS',
        label: `Mass Mentions (${total}/${maxCount} pings)`,
        action: config.anti_mentions_action || 'DELETE',
        timeoutSeconds: config.anti_mentions_timeout_seconds || 60,
        matched: `${total} mentions`
      };
    }
    return null;
  }

  checkAntiCaps(text, config) {
    if (!config.anti_caps_enabled) return null;
    const minChars = config.anti_caps_min_chars || 12;
    const clean = text.replace(/[^a-zA-Z]/g, '');
    if (clean.length < minChars) return null;

    const uppercaseCount = clean.replace(/[^A-Z]/g, '').length;
    const percent = Math.round((uppercaseCount / clean.length) * 100);
    const threshold = config.anti_caps_percent || 70;

    if (percent >= threshold) {
      return {
        rule: 'ANTI_CAPS',
        label: `Excessive Capitalization (${percent}% caps)`,
        action: config.anti_caps_action || 'DELETE',
        timeoutSeconds: config.anti_caps_timeout_seconds || 60,
        matched: `${percent}% uppercase`
      };
    }
    return null;
  }

  checkAntiEmojis(text, config) {
    if (!config.anti_emojis_enabled) return null;
    const maxCount = config.anti_emojis_max_count || 8;
    const matches = text.match(EMOJI_REGEX) || [];
    if (matches.length >= maxCount) {
      return {
        rule: 'ANTI_EMOJIS',
        label: `Excessive Emoji Spam (${matches.length} emojis)`,
        action: config.anti_emojis_action || 'DELETE',
        timeoutSeconds: config.anti_emojis_timeout_seconds || 60,
        matched: `${matches.length} emojis`
      };
    }
    return null;
  }

  checkAntiZalgo(text, config) {
    if (!config.anti_zalgo_enabled) return null;
    const matches = text.match(ZALGO_REGEX);
    if (matches && matches.length >= 4) {
      return {
        rule: 'ANTI_ZALGO',
        label: 'Glitch / Zalgo Text Formatting',
        action: config.anti_zalgo_action || 'DELETE',
        timeoutSeconds: config.anti_zalgo_timeout_seconds || 60,
        matched: 'Zalgo unicode combining characters'
      };
    }
    return null;
  }

  checkBlacklists(text, blacklists, config) {
    const lower = text.toLowerCase();

    // 1. Check Default Built-In Scam / Phishing Blacklist
    if (config.default_blacklist_enabled) {
      for (const pattern of DEFAULT_BLACKLIST_PATTERNS) {
        if (lower.includes(pattern.toLowerCase())) {
          return {
            rule: 'DEFAULT_BLACKLIST',
            label: 'Known Phishing / Scam Phrase',
            action: config.word_blacklist_action || 'DELETE',
            timeoutSeconds: config.word_blacklist_timeout_seconds || 300,
            matched: pattern
          };
        }
      }
    }

    // 2. Check Custom Server Blacklists
    for (const entry of (blacklists || [])) {
      const matchType = entry.match_type || 'WORD';
      const pat = entry.pattern;

      if (matchType === 'WORD') {
        const regex = new RegExp(`\\b${escapeRegex(pat)}\\b`, 'i');
        if (regex.test(text)) {
          return {
            rule: 'WORD_BLACKLIST',
            label: `Banned Keyword: "${pat}"`,
            action: entry.severity || config.word_blacklist_action || 'DELETE',
            timeoutSeconds: config.word_blacklist_timeout_seconds || 300,
            matched: pat
          };
        }
      } else if (matchType === 'WILDCARD') {
        if (lower.includes(pat.toLowerCase())) {
          return {
            rule: 'WORD_BLACKLIST',
            label: `Banned Term: "${pat}"`,
            action: entry.severity || config.word_blacklist_action || 'DELETE',
            timeoutSeconds: config.word_blacklist_timeout_seconds || 300,
            matched: pat
          };
        }
      } else if (matchType === 'REGEX') {
        try {
          const customReg = new RegExp(pat, 'i');
          if (customReg.test(text)) {
            return {
              rule: 'REGEX_BLACKLIST',
              label: `Banned Regex Pattern: /${pat}/i`,
              action: entry.severity || config.word_blacklist_action || 'DELETE',
              timeoutSeconds: config.word_blacklist_timeout_seconds || 300,
              matched: pat
            };
          }
        } catch {}
      }
    }
    return null;
  }

  checkSpamAndDuplicates(guildId, userId, content, config) {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    let history = this.messageHistory.get(key) || [];

    // Filter out messages older than 20 seconds
    history = history.filter((m) => now - m.timestamp < 20000);

    // 1. Anti-Spam Check
    if (config.anti_spam_enabled) {
      const spamWindowMs = (config.anti_spam_seconds || 4) * 1000;
      const recentInWindow = history.filter((m) => now - m.timestamp <= spamWindowMs);
      if (recentInWindow.length >= (config.anti_spam_max_messages || 5) - 1) {
        history.push({ text: content, timestamp: now });
        this.messageHistory.set(key, history);
        return {
          rule: 'ANTI_SPAM',
          label: `Message Flooding (${recentInWindow.length + 1} msgs in ${config.anti_spam_seconds || 4}s)`,
          action: config.anti_spam_action || 'DELETE',
          timeoutSeconds: config.anti_spam_timeout_seconds || 60,
          matched: `${recentInWindow.length + 1} messages`
        };
      }
    }

    // 2. Anti-Duplicates Check
    if (config.anti_duplicates_enabled) {
      const dupWindowMs = (config.anti_duplicates_seconds || 10) * 1000;
      const cleanContent = content.trim().toLowerCase();
      if (cleanContent.length >= 3) {
        const sameMessages = history.filter(
          (m) => now - m.timestamp <= dupWindowMs && m.text.trim().toLowerCase() === cleanContent
        );
        if (sameMessages.length >= (config.anti_duplicates_max_count || 3) - 1) {
          history.push({ text: content, timestamp: now });
          this.messageHistory.set(key, history);
          return {
            rule: 'ANTI_DUPLICATES',
            label: `Repeated Duplicate Message (${sameMessages.length + 1} times)`,
            action: config.anti_duplicates_action || 'DELETE',
            timeoutSeconds: config.anti_duplicates_timeout_seconds || 60,
            matched: truncate(cleanContent, 40)
          };
        }
      }
    }

    history.push({ text: content, timestamp: now });
    this.messageHistory.set(key, history);
    return null;
  }

  // --- Main Message Hook ---

  async handleMessage(message, logger, moderationService) {
    if (!message || !message.guild || message.author?.bot) return { handled: false };
    const guildId = message.guild.id;
    const config = await this.getConfig(guildId);
    if (!config.enabled) return { handled: false };

    // Check member exemptions
    if (this.isExempt(message.member, message.channel, config)) {
      return { handled: false };
    }

    const text = message.content || '';
    const blacklists = await this.getBlacklist(guildId);

    // Evaluate rules sequentially in order of severity
    const violation =
      this.checkBlacklists(text, blacklists, config) ||
      this.checkAntiInvites(text, config) ||
      this.checkAntiLinks(text, config) ||
      this.checkAntiMentions(message, config) ||
      this.checkSpamAndDuplicates(guildId, message.author.id, text, config) ||
      this.checkAntiZalgo(text, config) ||
      this.checkAntiCaps(text, config) ||
      this.checkAntiEmojis(text, config);

    if (!violation) return { handled: false };

    await this.processViolation({ message, violation, config, logger, moderationService });
    return { handled: true, violation };
  }

  // --- Violation Dispatcher ---

  async processViolation({ message, violation, config, logger, moderationService }) {
    const { guild, channel, author, member } = message;
    const action = violation.action || 'DELETE';
    const reason = `[Auto-Mod] ${violation.label} (trigger: ${violation.matched || 'violation'})`;

    // 1. Delete Offending Message (if action is DELETE, WARN, or TIMEOUT)
    if (action !== 'LOG_ONLY') {
      await message.delete().catch(() => {});
    }

    // 2. Apply Timeout (if action is TIMEOUT)
    let timedOut = false;
    if (action === 'TIMEOUT' && member) {
      const timeoutRes = await this.applyTimeout(
        member,
        violation.timeoutSeconds || 60,
        reason,
        { id: message.client?.user?.id || 'AUTOMOD', tag: 'SlickBot AutoMod' }
      );
      timedOut = timeoutRes.nativeTimeout || timeoutRes.roleApplied;
    }

    // 3. Create Moderation Case
    let modCase = null;
    if (moderationService && (action === 'WARN' || action === 'TIMEOUT')) {
      modCase = await moderationService.createCase({
        guildId: guild.id,
        targetUserId: author.id,
        targetUserTag: author.tag,
        actorUserId: message.client?.user?.id || 'AUTOMOD',
        actionType: action === 'TIMEOUT' ? 'MUTE' : 'WARN',
        reason,
        durationSeconds: action === 'TIMEOUT' ? violation.timeoutSeconds || 60 : null,
        evidence: truncate(message.content, 500),
        metadata: { autoModRule: violation.rule, matched: violation.matched }
      }).catch(() => null);
    }

    // 4. Send User DM Notification (if enabled)
    if (config.dm_notification_enabled) {
      const dmEmbed = createBaseEmbed({
        title: '🛡️ Auto-Mod Notice',
        description: `Your message in **${guild.name}** was flagged and removed by Auto-Mod.`,
        color: SlickBotColors.WARNING
      }).addFields(
        { name: 'Rule Triggered', value: `\`${violation.label}\``, inline: true },
        { name: 'Action Taken', value: action === 'TIMEOUT' ? `Timed out for ${violation.timeoutSeconds || 60}s` : action === 'WARN' ? 'Warning issued' : 'Message deleted', inline: true },
        { name: 'Channel', value: `<#${channel.id}>`, inline: true }
      );

      await author.send({ embeds: [dmEmbed] }).catch(() => {});
    }

    // 5. Send Ephemeral Alert or Log to Mod Channel
    if (logger) {
      await logger.log({
        guildId: guild.id,
        eventKey: 'automod-violation',
        title: `Auto-Mod: ${violation.label}`,
        body: `**User:** <@${author.id}> (\`${author.tag}\`)\n**Channel:** <#${channel.id}>\n**Action:** \`${action}\`${timedOut ? ` (${violation.timeoutSeconds}s timeout)` : ''}${modCase ? ` (Case #${modCase.case_number})` : ''}\n**Snippet:**\n\`\`\`\n${truncate(message.content || '[No Content]', 250)}\n\`\`\``,
        actorUserId: author.id,
        metadata: {
          rule: violation.rule,
          action,
          matched: violation.matched,
          caseNumber: modCase?.case_number || null
        }
      }).catch(() => {});
    }
  }

  // --- Anti-Raid & Join Burst Shield ---

  async handleGuildMemberAdd(member, logger, client) {
    if (!member || !member.guild) return;
    const guildId = member.guild.id;
    const config = await this.getConfig(guildId);
    if (!config.enabled || !config.raid_shield_enabled) return;

    const now = Date.now();
    let joins = this.joinHistory.get(guildId) || [];
    const windowMs = (config.raid_join_seconds || 10) * 1000;

    // Filter to joins in sliding window
    joins = joins.filter((j) => now - j.joinedAt <= windowMs);
    joins.push({
      userId: member.id,
      userTag: member.user?.tag || member.displayName,
      joinedAt: now,
      createdAt: member.user?.createdTimestamp || now
    });
    this.joinHistory.set(guildId, joins);

    const threshold = config.raid_join_threshold || 8;
    if (joins.length >= threshold) {
      // Join burst detected! Check alert cooldown (at most 1 alert every 90s)
      const lastAlert = this.activeRaidAlerts.get(guildId);
      if (lastAlert && now - lastAlert.alertTimestamp < 90000) {
        return;
      }

      this.activeRaidAlerts.set(guildId, { alertTimestamp: now, recentJoins: [...joins] });
      await this.dispatchStaffRaidAlert(member.guild, joins, config, logger, client);
    }
  }

  async dispatchStaffRaidAlert(guild, recentJoins, config, logger, client) {
    const alertChannelId = config.raid_alert_channel_id || config.alert_channel_id;
    let targetChannel = null;
    if (alertChannelId) {
      targetChannel = guild.channels.cache.get(alertChannelId) || await guild.channels.fetch(alertChannelId).catch(() => null);
    }
    if (!targetChannel) {
      targetChannel = guild.systemChannel || guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages));
    }
    if (!targetChannel || !targetChannel.isTextBased()) return;

    const alertPayload = this.buildRaidAlertPayload(guild, recentJoins, config);
    await targetChannel.send(alertPayload).catch(() => {});

    if (logger) {
      await logger.log({
        guildId: guild.id,
        eventKey: 'automod-raid-alert',
        title: '🚨 Anti-Raid Join Surge Detected',
        body: `Detected **${recentJoins.length}** member joins in **${config.raid_join_seconds || 10} seconds**.\nStaff prompt dispatched to <#${targetChannel.id}> with lockdown prompt buttons.`,
        actorUserId: client?.user?.id || 'AUTOMOD',
        metadata: { joinCount: recentJoins.length, threshold: config.raid_join_threshold }
      }).catch(() => {});
    }
  }

  buildRaidAlertPayload(guild, recentJoins, config) {
    const joinList = (recentJoins || []).slice(-8).map((j) => {
      const ageHours = Math.floor((Date.now() - j.createdAt) / 3600000);
      const isNew = ageHours < (config.raid_min_account_age_hours || 24);
      return `• <@${j.userId}> (\`${j.userTag}\`) — Created: **${ageHours}h ago** ${isNew ? '⚠️ `NEW ACCOUNT`' : '✅'}`;
    }).join('\n');

    const embed = createBaseEmbed({
      title: '🚨 Anti-Raid: Join Surge Alert',
      description: `**High-velocity join surge detected!**\n**${recentJoins.length} members** joined the server in the last **${config.raid_join_seconds || 10} seconds** (Threshold: **${config.raid_join_threshold}**).\n\n⚠️ **Per server policy, the bot does NOT start lockdowns automatically.**\nPlease review the recent accounts below and click to enact a lockdown if this is a raid.`,
      color: SlickBotColors.ERROR
    }).addFields(
      { name: 'Recent Suspicious Joins', value: joinList || 'None recorded', inline: false },
      { name: 'Moderator Action Required', value: 'Click **Enact Emergency Lockdown** below to choose a lockdown preset and lock down channels immediately.', inline: false }
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModRaidLockdownPromptPrefix}${guild.id}`)
        .setLabel('Enact Emergency Lockdown')
        .setEmoji('🚨')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModRaidDismissPrefix}${guild.id}`)
        .setLabel('Dismiss Alert')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  // --- UI Manager Panel Builder ---

  async buildManagerPanel(guildId, tab = 'FILTERS') {
    const config = await this.getConfig(guildId);
    const blacklists = await this.getBlacklist(guildId);

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModTabPrefix}FILTERS`)
        .setLabel('Filter Rules')
        .setEmoji('🛡️')
        .setStyle(tab === 'FILTERS' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModTabPrefix}BLACKLIST`)
        .setLabel(`Blacklist (${blacklists.length})`)
        .setEmoji('🚫')
        .setStyle(tab === 'BLACKLIST' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModTabPrefix}WHITELIST`)
        .setLabel('Exemptions')
        .setEmoji('🌐')
        .setStyle(tab === 'WHITELIST' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModTabPrefix}RAID`)
        .setLabel('Anti-Raid Shield')
        .setEmoji('🚨')
        .setStyle(tab === 'RAID' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    if (tab === 'BLACKLIST') {
      const customList = blacklists.length
        ? blacklists.slice(0, 15).map((b, i) => `${i + 1}. \`${b.pattern}\` [${b.match_type}] ➔ \`${b.severity}\``).join('\n')
        : '_No custom blacklist entries configured._';

      const embed = createBaseEmbed({
        title: '🚫 Auto-Mod Blacklist Manager',
        description: `Manage prohibited words, wildcards, and custom regular expressions.\n\n**Default Scam & Phishing Filter:** ${config.default_blacklist_enabled ? '`🟢 Active`' : '`🔴 Disabled`'}\nIncludes known free nitro, steam phishing, and IP logger links.\n\n**Custom Blacklist Patterns (${blacklists.length}):**\n${customList}`,
        color: SlickBotColors.PRIMARY
      });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomIds.AutoModBlacklistAddModal)
          .setLabel('Add Blacklist Word')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${CustomIds.AutoModToggleRulePrefix}default_blacklist`)
          .setLabel(config.default_blacklist_enabled ? 'Disable Built-in Filter' : 'Enable Built-in Filter')
          .setEmoji('🛡️')
          .setStyle(config.default_blacklist_enabled ? ButtonStyle.Danger : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(CustomIds.AutoModRefresh)
          .setLabel('Refresh')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      );

      return { embeds: [embed], components: [navRow, actionRow] };
    }

    if (tab === 'WHITELIST') {
      const roles = (config.exempt_roles || []).map((r) => `<@&${r}>`).join(', ') || 'None';
      const channels = (config.exempt_channels || []).map((c) => `<#${c}>`).join(', ') || 'None';
      const domains = (config.whitelisted_domains || []).map((d) => `\`${d}\``).join(', ') || 'None';

      const embed = createBaseEmbed({
        title: '🌐 Auto-Mod Exemptions & Whitelists',
        description: 'Users with Admin/Manage Server permissions are always exempt.\nConfigure additional bypass roles, channels, or approved domains.',
        color: SlickBotColors.PRIMARY
      }).addFields(
        { name: 'Exempt Roles', value: roles, inline: false },
        { name: 'Exempt Channels', value: channels, inline: false },
        { name: 'Whitelisted External Domains', value: domains, inline: false }
      );

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomIds.AutoModRefresh)
          .setLabel('Refresh')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      );

      return { embeds: [embed], components: [navRow, actionRow] };
    }

    if (tab === 'RAID') {
      const embed = createBaseEmbed({
        title: '🚨 Anti-Raid & Join Burst Shield',
        description: 'Monitors member join velocity in real time and alerts staff with an emergency lockdown prompt if an organized raid is detected.',
        color: SlickBotColors.PRIMARY
      }).addFields(
        { name: 'Raid Shield Status', value: config.raid_shield_enabled ? '`🟢 Active`' : '`🔴 Disabled`', inline: true },
        { name: 'Surge Trigger', value: `**${config.raid_join_threshold || 8} joins** in **${config.raid_join_seconds || 10}s**`, inline: true },
        { name: 'New Account Age Gate', value: `**${config.raid_min_account_age_hours || 24} hours**`, inline: true },
        { name: 'Alert Channel', value: config.raid_alert_channel_id ? `<#${config.raid_alert_channel_id}>` : '_Default Mod Log Channel_', inline: true },
        { name: 'Staff Action Mechanism', value: 'Dispatches emergency alert with interactive **"Enact Emergency Lockdown"** button for moderator confirmation.', inline: false }
      );

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomIds.AutoModRaidShieldToggle)
          .setLabel(config.raid_shield_enabled ? 'Disable Raid Shield' : 'Enable Raid Shield')
          .setEmoji('🚨')
          .setStyle(config.raid_shield_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(CustomIds.AutoModRefresh)
          .setLabel('Refresh')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      );

      return { embeds: [embed], components: [navRow, actionRow] };
    }

    // Default: FILTERS Tab
    const embed = createBaseEmbed({
      title: '🛡️ Auto-Mod Protection Engine',
      description: `System Status: ${config.enabled ? '`🟢 Master Enabled`' : '`🔴 Master Disabled`'}\nDM Offender Notice: ${config.dm_notification_enabled ? '`Enabled`' : '`Disabled`'}`,
      color: SlickBotColors.PRIMARY
    }).addFields(
      {
        name: 'Active Filter Rules',
        value: [
          `• **Anti-Invites:** ${fmt(config.anti_invites_enabled)} [Action: \`${config.anti_invites_action}\`]` ,
          `• **Anti-Links:** ${fmt(config.anti_links_enabled)} [Action: \`${config.anti_links_action}\`]` ,
          `• **Anti-Spam:** ${fmt(config.anti_spam_enabled)} [${config.anti_spam_max_messages} msgs in ${config.anti_spam_seconds}s ➔ \`${config.anti_spam_action}\`]` ,
          `• **Anti-Duplicates:** ${fmt(config.anti_duplicates_enabled)} [${config.anti_duplicates_max_count} repeats ➔ \`${config.anti_duplicates_action}\`]` ,
          `• **Anti-Mentions:** ${fmt(config.anti_mentions_enabled)} [Max: ${config.anti_mentions_max_count} pings ➔ \`${config.anti_mentions_action}\`]` ,
          `• **Anti-Caps:** ${fmt(config.anti_caps_enabled)} [Min: ${config.anti_caps_min_chars} chars, >${config.anti_caps_percent}% ➔ \`${config.anti_caps_action}\`]` ,
          `• **Anti-Emojis:** ${fmt(config.anti_emojis_enabled)} [Max: ${config.anti_emojis_max_count} ➔ \`${config.anti_emojis_action}\`]` ,
          `• **Anti-Zalgo:** ${fmt(config.anti_zalgo_enabled)} [Action: \`${config.anti_zalgo_action}\`]` ,
          `• **Built-In Phishing Filter:** ${fmt(config.default_blacklist_enabled)} [Action: \`${config.word_blacklist_action}\`]`
        ].join('\n'),
        inline: false
      }
    );

    const toggleRow1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}anti_invites`)
        .setLabel('Anti-Invites')
        .setStyle(config.anti_invites_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}anti_links`)
        .setLabel('Anti-Links')
        .setStyle(config.anti_links_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}anti_spam`)
        .setLabel('Anti-Spam')
        .setStyle(config.anti_spam_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}anti_duplicates`)
        .setLabel('Anti-Duplicates')
        .setStyle(config.anti_duplicates_enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const toggleRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}anti_mentions`)
        .setLabel('Anti-Mentions')
        .setStyle(config.anti_mentions_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}anti_zalgo`)
        .setLabel('Anti-Zalgo')
        .setStyle(config.anti_zalgo_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AutoModToggleRulePrefix}master`)
        .setLabel(config.enabled ? 'Pause Auto-Mod' : 'Resume Auto-Mod')
        .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [navRow, toggleRow1, toggleRow2] };
  }

  async resetModule(guildId) {
    await query(`DELETE FROM automod_blacklists WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM automod_configs WHERE guild_id = $1`, [guildId]);
    this.configCache.delete(guildId);
    this.blacklistCache.delete(guildId);
    return { ok: true };
  }
}

function fmt(bool) {
  return bool ? '`✅ ON`' : '`❌ OFF`';
}

function escapeRegex(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBlacklistAddModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.AutoModBlacklistAddModal)
    .setTitle('Add Word / Regex to Blacklist')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('pattern')
          .setLabel('Banned Word or Pattern')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('e.g. badword, free nitro, discord-scam')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('match_type')
          .setLabel('Match Type (WORD, WILDCARD, or REGEX)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setValue('WORD')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('severity')
          .setLabel('Action (DELETE, WARN, or TIMEOUT)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setValue('DELETE')
      )
    );
}

const AUTOMOD_PRESETS = Object.freeze({
  BALANCED: {
    key: 'BALANCED',
    label: '🛡️ Balanced (Recommended)',
    description: 'Standard protections against invites, spam, duplicate flood, mass pings, zalgo, phishing scams, and join raids.',
    config: {
      enabled: true,
      anti_invites_enabled: true,
      anti_invites_action: 'DELETE',
      anti_invites_timeout_seconds: 0,
      anti_links_enabled: false,
      anti_links_action: 'DELETE',
      anti_spam_enabled: true,
      anti_spam_action: 'DELETE',
      anti_spam_max_messages: 5,
      anti_spam_seconds: 4,
      anti_spam_timeout_seconds: 60,
      anti_duplicates_enabled: true,
      anti_duplicates_action: 'DELETE',
      anti_duplicates_max_count: 3,
      anti_duplicates_seconds: 10,
      anti_mentions_enabled: true,
      anti_mentions_action: 'DELETE',
      anti_mentions_max_count: 5,
      anti_caps_enabled: false,
      anti_emojis_enabled: false,
      anti_zalgo_enabled: true,
      anti_zalgo_action: 'DELETE',
      default_blacklist_enabled: true,
      word_blacklist_action: 'DELETE',
      raid_shield_enabled: true,
      raid_join_threshold: 8,
      raid_join_seconds: 10,
      raid_min_account_age_hours: 24
    }
  },
  STRICT: {
    key: 'STRICT',
    label: '🔒 Strict Security',
    description: 'Maximum security: blocks all unapproved links, caps spam, emoji clutter, 5m timeouts, and strict 48h account age gates.',
    config: {
      enabled: true,
      anti_invites_enabled: true,
      anti_invites_action: 'TIMEOUT',
      anti_invites_timeout_seconds: 300,
      anti_links_enabled: true,
      anti_links_action: 'DELETE',
      anti_spam_enabled: true,
      anti_spam_action: 'TIMEOUT',
      anti_spam_max_messages: 4,
      anti_spam_seconds: 4,
      anti_spam_timeout_seconds: 300,
      anti_duplicates_enabled: true,
      anti_duplicates_action: 'TIMEOUT',
      anti_duplicates_max_count: 2,
      anti_duplicates_seconds: 15,
      anti_mentions_enabled: true,
      anti_mentions_action: 'TIMEOUT',
      anti_mentions_max_count: 3,
      anti_caps_enabled: true,
      anti_caps_action: 'DELETE',
      anti_caps_min_chars: 10,
      anti_caps_percent: 65,
      anti_emojis_enabled: true,
      anti_emojis_action: 'DELETE',
      anti_emojis_max_count: 6,
      anti_zalgo_enabled: true,
      anti_zalgo_action: 'DELETE',
      default_blacklist_enabled: true,
      word_blacklist_action: 'TIMEOUT',
      word_blacklist_timeout_seconds: 600,
      raid_shield_enabled: true,
      raid_join_threshold: 5,
      raid_join_seconds: 5,
      raid_min_account_age_hours: 48
    }
  },
  LIGHTWEIGHT: {
    key: 'LIGHTWEIGHT',
    label: '⚡ Anti-Spam & Phishing Only',
    description: 'Lightweight shield: blocks message flooding, repetitive duplicate spam, phishing domains, and join raids.',
    config: {
      enabled: true,
      anti_invites_enabled: false,
      anti_links_enabled: false,
      anti_spam_enabled: true,
      anti_spam_action: 'DELETE',
      anti_spam_max_messages: 6,
      anti_spam_seconds: 4,
      anti_spam_timeout_seconds: 60,
      anti_duplicates_enabled: true,
      anti_duplicates_action: 'DELETE',
      anti_duplicates_max_count: 4,
      anti_duplicates_seconds: 10,
      anti_mentions_enabled: false,
      anti_caps_enabled: false,
      anti_emojis_enabled: false,
      anti_zalgo_enabled: false,
      default_blacklist_enabled: true,
      word_blacklist_action: 'DELETE',
      raid_shield_enabled: true,
      raid_join_threshold: 12,
      raid_join_seconds: 10,
      raid_min_account_age_hours: 12
    }
  }
});

const RULE_KEYS = Object.freeze([
  { key: 'anti_invites', label: 'Anti-Invites', description: 'Blocks Discord server invite links' },
  { key: 'anti_links', label: 'Anti-Links', description: 'Blocks unapproved external website URLs' },
  { key: 'anti_spam', label: 'Anti-Spam', description: 'Blocks rapid message floods' },
  { key: 'anti_duplicates', label: 'Anti-Duplicates', description: 'Blocks repeated identical messages' },
  { key: 'anti_mentions', label: 'Anti-Mentions', description: 'Blocks excessive user/role pings' },
  { key: 'anti_caps', label: 'Anti-Caps', description: 'Blocks messages with high uppercase %' },
  { key: 'anti_emojis', label: 'Anti-Emojis', description: 'Blocks excessive emoji clutter' },
  { key: 'anti_zalgo', label: 'Anti-Zalgo', description: 'Blocks glitch/zalgo text formatting' },
  { key: 'default_blacklist', label: 'Phishing Filter', description: 'Blocks known Nitro scams & IP loggers' }
]);

AutoModService.prototype.applyPreset = async function(guildId, presetKey) {
  const key = String(presetKey || '').toUpperCase();
  const preset = AUTOMOD_PRESETS[key];
  if (!preset) return { ok: false, reason: 'Invalid preset key.' };

  const saved = await this.upsertConfig(guildId, preset.config);
  return { ok: true, preset: preset.label, config: saved };
};

module.exports = {
  AutoModService,
  DEFAULT_AUTOMOD_CONFIG,
  DEFAULT_BLACKLIST_PATTERNS,
  AUTOMOD_PRESETS,
  RULE_KEYS,
  buildBlacklistAddModal
};
