const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

function safeArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try { return safeArray(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function totalXpForLevel(level) {
  const safeLevel = Math.max(0, Number(level) || 0);
  return Math.floor(25 * safeLevel * safeLevel + 100 * safeLevel);
}

function levelFromXp(xp) {
  const value = Math.max(0, Number(xp) || 0);
  let level = Math.floor((-100 + Math.sqrt(10000 + 100 * value)) / 50);
  while (totalXpForLevel(level + 1) <= value) level += 1;
  while (level > 0 && totalXpForLevel(level) > value) level -= 1;
  return Math.max(0, level);
}

function progressForProfile(profile) {
  const level = Number(profile?.level || levelFromXp(profile?.xp || 0));
  const xp = Number(profile?.xp || 0);
  const currentStart = totalXpForLevel(level);
  const nextStart = totalXpForLevel(level + 1);
  return {
    level,
    xp,
    currentXp: xp - currentStart,
    neededXp: Math.max(1, nextStart - currentStart),
    nextLevelXp: nextStart
  };
}

function progressBar(current, total, length = 12) {
  const ratio = Math.max(0, Math.min(1, current / Math.max(1, total)));
  const filled = Math.round(ratio * length);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, length - filled))}`;
}

function normalizeAnnouncementMode(value) {
  return String(value || 'ALL_LEVELS').toUpperCase() === 'ROLE_REWARDS_ONLY'
    ? 'ROLE_REWARDS_ONLY'
    : 'ALL_LEVELS';
}

function formatMultiplier(value) {
  const number = Number(value || 1);
  return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

class LevelingService {
  constructor() {
    this.configCache = new Map();
    this.multiplierCache = new Map();
    this.cooldownCache = new Map();
  }

  invalidateConfig(guildId) {
    if (guildId) this.configCache.delete(guildId);
    else this.configCache.clear();
  }

  invalidateMultipliers(guildId) {
    if (guildId) this.multiplierCache.delete(guildId);
    else this.multiplierCache.clear();
  }

  invalidateGuild(guildId) {
    if (!guildId) {
      this.clearAllCaches();
      return;
    }
    this.configCache.delete(guildId);
    this.multiplierCache.delete(guildId);
    for (const key of this.cooldownCache.keys()) {
      if (key.startsWith(`${guildId}:`)) this.cooldownCache.delete(key);
    }
  }

  clearAllCaches() {
    this.configCache.clear();
    this.multiplierCache.clear();
    this.cooldownCache.clear();
  }

  async getConfig(guildId) {
    if (!guildId) return null;
    const cached = this.configCache.get(guildId);
    if (cached) return cached;

    const result = await query(`SELECT * FROM leveling_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) {
      this.configCache.set(guildId, result.rows[0]);
      return result.rows[0];
    }
    return null;
  }

  async upsertConfig(guildId, values = {}) {
    return this.saveConfig(guildId, values);
  }

  async saveConfig(guildId, values = {}) {
    const current = await this.getConfig(guildId);
    const config = {
      enabled: values.enabled ?? current?.enabled ?? true,
      xpMin: Math.max(1, Math.min(1000, Number(values.xpMin ?? current?.xp_min ?? 15))),
      xpMax: Math.max(1, Math.min(1000, Number(values.xpMax ?? current?.xp_max ?? 25))),
      cooldownSeconds: Math.max(5, Math.min(86400, Number(values.cooldownSeconds ?? current?.cooldown_seconds ?? 60))),
      minimumMessageLength: Math.max(1, Math.min(500, Number(values.minimumMessageLength ?? current?.minimum_message_length ?? 3))),
      levelUpChannelId: values.levelUpChannelId === undefined ? current?.level_up_channel_id ?? null : values.levelUpChannelId,
      levelUpMessage: values.levelUpMessage ?? current?.level_up_message ?? 'Congratulations {user}! You reached level **{level}**.',
      levelUpAnnounceMode: normalizeAnnouncementMode(values.levelUpAnnounceMode ?? current?.level_up_announce_mode),
      ignoredChannels: values.ignoredChannels ?? safeArray(current?.ignored_channel_ids),
      ignoredRoles: values.ignoredRoles ?? safeArray(current?.ignored_role_ids),
      voiceXpEnabled: values.voiceXpEnabled ?? current?.voice_xp_enabled ?? true,
      voiceXpMin: Math.max(1, Math.min(1000, Number(values.voiceXpMin ?? current?.voice_xp_min ?? 10))),
      voiceXpMax: Math.max(1, Math.min(1000, Number(values.voiceXpMax ?? current?.voice_xp_max ?? 20))),
      voiceXpIntervalSeconds: Math.max(10, Math.min(3600, Number(values.voiceXpIntervalSeconds ?? current?.voice_xp_interval_seconds ?? 60))),
      voiceXpRequireUnmuted: values.voiceXpRequireUnmuted ?? current?.voice_xp_require_unmuted ?? true,
      voiceXpMinChannelMembers: Math.max(1, Math.min(20, Number(values.voiceXpMinChannelMembers ?? current?.voice_xp_min_channel_members ?? 2))),
      voiceIgnoredChannels: values.voiceIgnoredChannels ?? safeArray(current?.voice_ignored_channel_ids)
    };
    if (config.xpMax < config.xpMin) [config.xpMin, config.xpMax] = [config.xpMax, config.xpMin];
    if (config.voiceXpMax < config.voiceXpMin) [config.voiceXpMin, config.voiceXpMax] = [config.voiceXpMax, config.voiceXpMin];

    const result = await query(
      `INSERT INTO leveling_configs
       (guild_id, enabled, xp_min, xp_max, cooldown_seconds, minimum_message_length, level_up_channel_id, level_up_message, level_up_announce_mode, ignored_channel_ids, ignored_role_ids,
        voice_xp_enabled, voice_xp_min, voice_xp_max, voice_xp_interval_seconds, voice_xp_require_unmuted, voice_xp_min_channel_members, voice_ignored_channel_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17,$18::jsonb)
       ON CONFLICT (guild_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     xp_min = EXCLUDED.xp_min,
                     xp_max = EXCLUDED.xp_max,
                     cooldown_seconds = EXCLUDED.cooldown_seconds,
                     minimum_message_length = EXCLUDED.minimum_message_length,
                     level_up_channel_id = EXCLUDED.level_up_channel_id,
                     level_up_message = EXCLUDED.level_up_message,
                     level_up_announce_mode = EXCLUDED.level_up_announce_mode,
                     ignored_channel_ids = EXCLUDED.ignored_channel_ids,
                     ignored_role_ids = EXCLUDED.ignored_role_ids,
                     voice_xp_enabled = EXCLUDED.voice_xp_enabled,
                     voice_xp_min = EXCLUDED.voice_xp_min,
                     voice_xp_max = EXCLUDED.voice_xp_max,
                     voice_xp_interval_seconds = EXCLUDED.voice_xp_interval_seconds,
                     voice_xp_require_unmuted = EXCLUDED.voice_xp_require_unmuted,
                     voice_xp_min_channel_members = EXCLUDED.voice_xp_min_channel_members,
                     voice_ignored_channel_ids = EXCLUDED.voice_ignored_channel_ids,
                     updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        config.enabled,
        config.xpMin,
        config.xpMax,
        config.cooldownSeconds,
        config.minimumMessageLength,
        config.levelUpChannelId,
        config.levelUpMessage,
        config.levelUpAnnounceMode,
        JSON.stringify(config.ignoredChannels),
        JSON.stringify(config.ignoredRoles),
        config.voiceXpEnabled,
        config.voiceXpMin,
        config.voiceXpMax,
        config.voiceXpIntervalSeconds,
        config.voiceXpRequireUnmuted,
        config.voiceXpMinChannelMembers,
        JSON.stringify(config.voiceIgnoredChannels)
      ]
    );
    const saved = result.rows[0] || {
      guild_id: guildId,
      enabled: config.enabled,
      xp_min: config.xpMin,
      xp_max: config.xpMax,
      cooldown_seconds: config.cooldownSeconds,
      minimum_message_length: config.minimumMessageLength,
      level_up_channel_id: config.levelUpChannelId,
      level_up_message: config.levelUpMessage,
      level_up_announce_mode: config.levelUpAnnounceMode,
      ignored_channel_ids: config.ignoredChannels,
      ignored_role_ids: config.ignoredRoles,
      voice_xp_enabled: config.voiceXpEnabled,
      voice_xp_min: config.voiceXpMin,
      voice_xp_max: config.voiceXpMax,
      voice_xp_interval_seconds: config.voiceXpIntervalSeconds,
      voice_xp_require_unmuted: config.voiceXpRequireUnmuted,
      voice_xp_min_channel_members: config.voiceXpMinChannelMembers,
      voice_ignored_channel_ids: config.voiceIgnoredChannels
    };
    this.configCache.set(guildId, saved);
    return saved;
  }

  async getProfile(guildId, userId) {
    const result = await query(`SELECT * FROM leveling_profiles WHERE guild_id = $1 AND user_id = $2 LIMIT 1`, [guildId, userId]);
    return result.rows[0] || null;
  }

  async getRank(guildId, userId) {
    const profile = await this.getProfile(guildId, userId);
    if (!profile) return null;
    const rankResult = await query(`SELECT COUNT(*)::int + 1 AS rank FROM leveling_profiles WHERE guild_id = $1 AND xp > $2`, [guildId, profile.xp]);
    return {
      profile,
      rank: Number(rankResult.rows[0]?.rank || 1),
      progress: progressForProfile(profile),
      voiceMinutes: Number(profile?.voice_minutes || 0)
    };
  }

  async leaderboard(guildId, limit = 10) {
    const result = await query(`SELECT * FROM leveling_profiles WHERE guild_id = $1 ORDER BY xp DESC, updated_at ASC LIMIT $2`, [guildId, limit]);
    return result.rows;
  }

  async addIgnoredChannel(guildId, channelId) {
    const config = await this.saveConfig(guildId, {});
    const ids = [...new Set([...safeArray(config.ignored_channel_ids), String(channelId)])];
    return this.saveConfig(guildId, { ignoredChannels: ids });
  }

  async removeIgnoredChannel(guildId, channelId) {
    const config = await this.saveConfig(guildId, {});
    return this.saveConfig(guildId, { ignoredChannels: safeArray(config.ignored_channel_ids).filter((id) => id !== String(channelId)) });
  }

  async addVoiceIgnoredChannel(guildId, channelId) {
    const config = await this.saveConfig(guildId, {});
    const ids = [...new Set([...safeArray(config.voice_ignored_channel_ids), String(channelId)])];
    return this.saveConfig(guildId, { voiceIgnoredChannels: ids });
  }

  async removeVoiceIgnoredChannel(guildId, channelId) {
    const config = await this.saveConfig(guildId, {});
    return this.saveConfig(guildId, { voiceIgnoredChannels: safeArray(config.voice_ignored_channel_ids).filter((id) => id !== String(channelId)) });
  }

  async listVoiceIgnoredChannels(guildId) {
    const config = await this.getConfig(guildId);
    return safeArray(config?.voice_ignored_channel_ids);
  }

  async addIgnoredRole(guildId, roleId) {
    const config = await this.saveConfig(guildId, {});
    const ids = [...new Set([...safeArray(config.ignored_role_ids), String(roleId)])];
    return this.saveConfig(guildId, { ignoredRoles: ids });
  }

  async removeIgnoredRole(guildId, roleId) {
    const config = await this.saveConfig(guildId, {});
    return this.saveConfig(guildId, { ignoredRoles: safeArray(config.ignored_role_ids).filter((id) => id !== String(roleId)) });
  }

  async addRoleReward(guildId, level, roleId) {
    const result = await query(
      `INSERT INTO leveling_role_rewards (guild_id, level, role_id, active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (guild_id, level, role_id)
       DO UPDATE SET active = true, updated_at = NOW()
       RETURNING *`,
      [guildId, level, roleId]
    );
    return result.rows[0];
  }

  async removeRoleReward(guildId, level, roleId = null) {
    const result = roleId
      ? await query(`UPDATE leveling_role_rewards SET active = false, updated_at = NOW() WHERE guild_id = $1 AND level = $2 AND role_id = $3 RETURNING *`, [guildId, level, roleId])
      : await query(`UPDATE leveling_role_rewards SET active = false, updated_at = NOW() WHERE guild_id = $1 AND level = $2 RETURNING *`, [guildId, level]);
    return result.rows;
  }

  async listRoleRewards(guildId) {
    const result = await query(`SELECT * FROM leveling_role_rewards WHERE guild_id = $1 AND active = true ORDER BY level ASC, created_at ASC`, [guildId]);
    return result.rows;
  }

  async addMultiplierRole(guildId, roleId, multiplier) {
    const safeMultiplier = Math.max(0.1, Math.min(100, Number(multiplier) || 1));
    const result = await query(
      `INSERT INTO leveling_multiplier_roles (guild_id, role_id, multiplier, active)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (guild_id, role_id)
       DO UPDATE SET multiplier = EXCLUDED.multiplier, active = true, updated_at = NOW()
       RETURNING *`,
      [guildId, roleId, safeMultiplier]
    );
    this.invalidateMultipliers(guildId);
    return result.rows[0];
  }

  async removeMultiplierRole(guildId, roleId) {
    const result = await query(
      `UPDATE leveling_multiplier_roles SET active = false, updated_at = NOW()
       WHERE guild_id = $1 AND role_id = $2 RETURNING *`,
      [guildId, roleId]
    );
    this.invalidateMultipliers(guildId);
    return result.rows[0] || null;
  }

  async listMultiplierRoles(guildId) {
    let cached = this.multiplierCache.get(guildId);
    if (!cached) {
      const result = await query(
        `SELECT * FROM leveling_multiplier_roles
         WHERE guild_id = $1 AND active = true
         ORDER BY multiplier DESC, created_at ASC`,
        [guildId]
      );
      cached = result.rows;
      this.multiplierCache.set(guildId, cached);
    }
    return cached;
  }

  async getApplicableMultiplier(guildId, memberRoleIds) {
    const roleIds = [...new Set((memberRoleIds || []).map(String))];
    if (!roleIds.length) return { multiplier: 1, roleId: null };

    const multiplierRoles = await this.listMultiplierRoles(guildId);
    const matching = multiplierRoles.find((mr) => roleIds.includes(String(mr.role_id)));
    if (!matching) return { multiplier: 1, roleId: null };
    return { multiplier: Math.max(0.1, Number(matching.multiplier) || 1), roleId: matching.role_id };
  }

  async setXp(guildId, user, xp) {
    const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
    const level = levelFromXp(safeXp);
    const result = await query(
      `INSERT INTO leveling_profiles (guild_id, user_id, user_tag, xp, level, message_count)
       VALUES ($1,$2,$3,$4,$5,0)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag, xp = EXCLUDED.xp, level = EXCLUDED.level, updated_at = NOW()
       RETURNING *`,
      [guildId, user.id, user.tag || null, safeXp, level]
    );
    return result.rows[0];
  }

  async resetProfile(guildId, userId) {
    const result = await query(`DELETE FROM leveling_profiles WHERE guild_id = $1 AND user_id = $2 RETURNING *`, [guildId, userId]);
    this.cooldownCache.delete(`${guildId}:${userId}`);
    return result.rows[0] || null;
  }

  async processMessage(message, logger) {
    if (!message.guild || message.author?.bot) return { awarded: false };
    const config = await this.getConfig(message.guild.id);
    if (!config || config.enabled === false) return { awarded: false };
    if ((message.content || '').trim().length < Number(config.minimum_message_length || 3)) return { awarded: false };
    if (safeArray(config.ignored_channel_ids).includes(message.channelId)) return { awarded: false };
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    const memberRoleIds = member?.roles?.cache ? [...member.roles.cache.keys()] : [];
    if (safeArray(config.ignored_role_ids).some((id) => memberRoleIds.includes(id))) return { awarded: false };

    const cooldownMs = Number(config.cooldown_seconds || 60) * 1000;
    const cooldownKey = `${message.guild.id}:${message.author.id}`;
    const memoryLastXp = this.cooldownCache.get(cooldownKey);
    const now = Date.now();
    if (memoryLastXp && (now - memoryLastXp < cooldownMs)) {
      return { awarded: false };
    }

    const existing = await this.getProfile(message.guild.id, message.author.id);
    if (existing?.last_xp_at && now - new Date(existing.last_xp_at).getTime() < cooldownMs) {
      this.cooldownCache.set(cooldownKey, new Date(existing.last_xp_at).getTime());
      return { awarded: false };
    }

    const minXp = Number(config.xp_min || 15);
    const maxXp = Number(config.xp_max || 25);
    const baseGained = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
    const multiplierData = await this.getApplicableMultiplier(message.guild.id, memberRoleIds);
    const gained = Math.max(1, Math.round(baseGained * multiplierData.multiplier));
    const oldLevel = Number(existing?.level || 0);
    const newXp = Number(existing?.xp || 0) + gained;
    const newLevel = levelFromXp(newXp);

    const result = await query(
      `INSERT INTO leveling_profiles (guild_id, user_id, user_tag, xp, level, message_count, last_xp_at)
       VALUES ($1,$2,$3,$4,$5,1,NOW())
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag,
                     xp = EXCLUDED.xp,
                     level = EXCLUDED.level,
                     message_count = leveling_profiles.message_count + 1,
                     last_xp_at = NOW(),
                     updated_at = NOW()
       RETURNING *`,
      [message.guild.id, message.author.id, message.author.tag || null, newXp, newLevel]
    );
    const profile = result.rows[0];
    this.cooldownCache.set(cooldownKey, now);

    if (this.cooldownCache.size > 10000) {
      const purgeThreshold = now - 86400000;
      for (const [k, v] of this.cooldownCache) {
        if (v < purgeThreshold) this.cooldownCache.delete(k);
      }
    }

    if (newLevel > oldLevel) await this.handleLevelUp(message, member, profile, oldLevel, config, logger);
    return { awarded: true, baseGained, multiplier: multiplierData.multiplier, multiplierRoleId: multiplierData.roleId, gained, profile, leveledUp: newLevel > oldLevel };
  }

  async awardBonusXp(message, amount, logger, reason = 'Bonus XP') {
    if (!message?.guild || message.author?.bot) return { awarded: false };
    const config = await this.getConfig(message.guild.id);
    if (!config || config.enabled === false) return { awarded: false };

    const gained = Math.max(1, Math.floor(Number(amount) || 0));
    const existing = await this.getProfile(message.guild.id, message.author.id);
    const oldLevel = Number(existing?.level || 0);
    const newXp = Number(existing?.xp || 0) + gained;
    const newLevel = levelFromXp(newXp);
    const result = await query(
      `INSERT INTO leveling_profiles (guild_id, user_id, user_tag, xp, level, message_count)
       VALUES ($1,$2,$3,$4,$5,0)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag,
                     xp = EXCLUDED.xp,
                     level = EXCLUDED.level,
                     updated_at = NOW()
       RETURNING *`,
      [message.guild.id, message.author.id, message.author.tag || null, newXp, newLevel]
    );
    const profile = result.rows[0];
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (newLevel > oldLevel) await this.handleLevelUp(message, member, profile, oldLevel, config, logger);
    await logger?.log?.({
      guildId: message.guild.id,
      eventKey: 'leveling-adjustment',
      title: 'Bonus XP Awarded',
      body: `User: <@${message.author.id}>\nXP: **${gained}**\nReason: **${reason}**`,
      actorUserId: message.author.id,
      metadata: { userId: message.author.id, xp: gained, reason }
    }).catch(() => {});
    return { awarded: true, gained, profile, leveledUp: newLevel > oldLevel };
  }

  async awardBonusXpToUser({ guild, channel = null, userId, amount, logger, reason = 'Bonus XP' }) {
    if (!guild || !userId) return { awarded: false };
    const config = await this.getConfig(guild.id);
    if (!config || config.enabled === false) return { awarded: false };

    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await guild.client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) return { awarded: false };

    const gained = Math.max(1, Math.floor(Number(amount) || 0));
    const existing = await this.getProfile(guild.id, userId);
    const oldLevel = Number(existing?.level || 0);
    const newXp = Number(existing?.xp || 0) + gained;
    const newLevel = levelFromXp(newXp);
    const result = await query(
      `INSERT INTO leveling_profiles (guild_id, user_id, user_tag, xp, level, message_count)
       VALUES ($1,$2,$3,$4,$5,0)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag,
                     xp = EXCLUDED.xp,
                     level = EXCLUDED.level,
                     updated_at = NOW()
       RETURNING *`,
      [guild.id, userId, user.tag || null, newXp, newLevel]
    );
    const profile = result.rows[0];
    const syntheticMessage = {
      guild,
      channel,
      channelId: channel?.id || null,
      author: user,
      member
    };
    if (newLevel > oldLevel) await this.handleLevelUp(syntheticMessage, member, profile, oldLevel, config, logger);
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'leveling-adjustment',
      title: 'Bonus XP Awarded',
      body: `User: <@${userId}>\nXP: **${gained}**\nReason: **${reason}**`,
      actorUserId: userId,
      metadata: { userId, xp: gained, reason }
    }).catch(() => {});
    return { awarded: true, gained, profile, leveledUp: newLevel > oldLevel };
  }

  async awardVoiceXp({ guild, member, channel, amount, minutes = 1, config = null, logger = null }) {
    if (!guild || !member || member.user?.bot) return { awarded: false };
    const effectiveConfig = config || await this.getConfig(guild.id);
    if (!effectiveConfig || effectiveConfig.enabled === false || effectiveConfig.voice_xp_enabled === false) {
      return { awarded: false };
    }

    const gained = Math.max(1, Math.floor(Number(amount) || 0));
    const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 1));
    const existing = await this.getProfile(guild.id, member.id);
    const oldLevel = Number(existing?.level || 0);
    const newXp = Number(existing?.xp || 0) + gained;
    const newLevel = levelFromXp(newXp);

    const result = await query(
      `INSERT INTO leveling_profiles (guild_id, user_id, user_tag, xp, level, message_count, voice_minutes, last_xp_at)
       VALUES ($1, $2, $3, $4, $5, 0, $6, NOW())
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag,
                     xp = EXCLUDED.xp,
                     level = EXCLUDED.level,
                     voice_minutes = leveling_profiles.voice_minutes + EXCLUDED.voice_minutes,
                     last_xp_at = NOW(),
                     updated_at = NOW()
       RETURNING *`,
      [guild.id, member.id, member.user?.tag || null, newXp, newLevel, safeMinutes]
    );
    const profile = result.rows[0];

    const syntheticMessage = {
      guild,
      channel,
      channelId: channel?.id || null,
      author: member.user,
      member
    };

    if (newLevel > oldLevel) {
      await this.handleLevelUp(syntheticMessage, member, profile, oldLevel, effectiveConfig, logger);
    }

    return { awarded: true, gained, minutes: safeMinutes, profile, leveledUp: newLevel > oldLevel };
  }

  async processVoiceXpSweep(client, logger) {
    if (!client?.guilds?.cache) return;

    for (const guild of client.guilds.cache.values()) {
      try {
        const config = await this.getConfig(guild.id);
        if (!config || config.enabled === false || config.voice_xp_enabled === false) continue;

        const ignoredText = safeArray(config.ignored_channel_ids);
        const ignoredVoice = safeArray(config.voice_ignored_channel_ids);
        const ignoredRoles = safeArray(config.ignored_role_ids);
        const afkChannelId = guild.afkChannelId;
        const minMembers = Number(config.voice_xp_min_channel_members ?? 2);
        const requireUnmuted = config.voice_xp_require_unmuted !== false;

        const rawChannels = guild.channels?.cache?.values ? Array.from(guild.channels.cache.values()) : (Array.isArray(guild.channels?.cache) ? guild.channels.cache : []);
        const voiceChannels = rawChannels.filter((c) => (typeof c.isVoiceBased === 'function' ? c.isVoiceBased() : c.type === 2 || c.type === 13));

        for (const channel of voiceChannels) {
          // Exclude server AFK channel and configured ignored channels
          if (afkChannelId && channel.id === afkChannelId) continue;
          if (ignoredVoice.includes(channel.id) || ignoredText.includes(channel.id)) continue;

          const rawMembers = channel.members?.values ? Array.from(channel.members.values()) : (Array.isArray(channel.members) ? channel.members : []);
          if (!rawMembers.length) continue;

          // Anti-farming check: Count non-bot members
          const humanMembers = rawMembers.filter((m) => !m.user?.bot);
          if (humanMembers.length < minMembers) continue;

          const minXp = Number(config.voice_xp_min || 10);
          const maxXp = Number(config.voice_xp_max || 20);

          for (const member of humanMembers) {
            const voice = member.voice;
            if (!voice) continue;

            // Disqualify muted / deafened members if required
            const isMuted = Boolean(voice.selfMute || voice.serverMute);
            const isDeaf = Boolean(voice.selfDeaf || voice.serverDeaf);
            if (requireUnmuted && (isMuted || isDeaf)) continue;
            if (isDeaf) continue;

            // Check ignored roles
            const memberRoleIds = member.roles?.cache ? [...member.roles.cache.keys()] : [];
            if (ignoredRoles.some((id) => memberRoleIds.includes(id))) continue;

            // Calculate XP with role multiplier
            const baseGained = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
            const multiplierData = await this.getApplicableMultiplier(guild.id, memberRoleIds);
            const gained = Math.max(1, Math.round(baseGained * multiplierData.multiplier));

            await this.awardVoiceXp({
              guild,
              member,
              channel,
              amount: gained,
              minutes: 1,
              config,
              logger
            }).catch((err) => console.error(`[Leveling] Failed to award voice XP to ${member.id}:`, err));
          }
        }
      } catch (guildError) {
        console.error(`[Leveling] Voice XP sweep error in guild ${guild.id}:`, guildError);
      }
    }
  }

  async handleLevelUp(message, member, profile, oldLevel, config, logger) {
    const rewards = await query(
      `SELECT * FROM leveling_role_rewards WHERE guild_id = $1 AND active = true AND level > $2 AND level <= $3 ORDER BY level ASC`,
      [message.guild.id, oldLevel, profile.level]
    );
    const assignedRoles = [];
    for (const reward of rewards.rows) {
      if (member?.roles?.cache && !member.roles.cache.has(reward.role_id)) {
        const added = await member.roles.add(reward.role_id, `SlickBot level ${profile.level} reward`).then(() => true).catch(() => false);
        if (added) assignedRoles.push(reward.role_id);
      }
    }

    const announceMode = normalizeAnnouncementMode(config.level_up_announce_mode);
    const shouldAnnounce = announceMode === 'ALL_LEVELS' || rewards.rows.length > 0;
    if (shouldAnnounce && config.level_up_channel_id) {
      const channel = await message.guild.channels.fetch(config.level_up_channel_id).catch(() => null);
      if (channel && typeof channel.send === 'function') {
        const content = String(config.level_up_message || 'Congratulations {user}! You reached level **{level}**.')
          .replaceAll('{user}', `<@${message.author.id}>`)
          .replaceAll('{username}', message.author.username)
          .replaceAll('{level}', String(profile.level))
          .replaceAll('{server}', message.guild.name)
          .replaceAll('{roles}', assignedRoles.length ? assignedRoles.map((id) => `<@&${id}>`).join(', ') : 'No new role reward');
        await channel.send({ content }).catch(() => {});
      }
    }

    await logger?.log({
      guildId: message.guild.id,
      eventKey: 'leveling-level-up',
      title: 'Member Leveled Up',
      body: [`User: <@${message.author.id}>`, `New Level: **${profile.level}**`, assignedRoles.length ? `Roles Added: ${assignedRoles.map((id) => `<@&${id}>`).join(', ')}` : null, `Announcement: **${shouldAnnounce ? 'Eligible' : 'Reward levels only'}**`].filter(Boolean).join('\n'),
      actorUserId: message.author.id,
      metadata: { userId: message.author.id, level: profile.level, assignedRoles, announceMode, announced: shouldAnnounce }
    }).catch(() => {});
  }

  buildXpAnalysis(config, maxLevel = 100, multiplier = 1) {
    const safeMaxLevel = Math.max(1, Math.min(1000, Number(maxLevel) || 100));
    const safeMultiplier = Math.max(0.1, Math.min(100, Number(multiplier) || 1));
    const averageBaseXp = (Number(config?.xp_min || 15) + Number(config?.xp_max || 25)) / 2;
    const averageAward = Math.max(0.1, averageBaseXp * safeMultiplier);
    const rows = [];
    for (let level = 1; level <= safeMaxLevel; level += 1) {
      const totalXp = totalXpForLevel(level);
      const previousXp = totalXpForLevel(level - 1);
      const incrementalXp = totalXp - previousXp;
      rows.push({
        level,
        incrementalXp,
        totalXp,
        estimatedMessagesForLevel: Math.ceil(incrementalXp / averageAward),
        estimatedMessagesTotal: Math.ceil(totalXp / averageAward)
      });
    }
    return {
      maxLevel: safeMaxLevel,
      multiplier: safeMultiplier,
      averageAward,
      levels: rows
    };
  }

  async buildManagerPanel(guildId) {
    const config = (await this.saveConfig(guildId, {})) || {};
    const rewards = (await this.listRoleRewards(guildId)) || [];
    const multiplierRoles = (await this.listMultiplierRoles(guildId)) || [];
    const enabled = config?.enabled ?? true;
    const voiceEnabled = config?.voice_xp_enabled ?? true;
    const announceMode = normalizeAnnouncementMode(config?.level_up_announce_mode);

    const ignoredText = safeArray(config?.ignored_channel_ids);
    const ignoredVoice = safeArray(config?.voice_ignored_channel_ids);
    const ignoredRoles = safeArray(config?.ignored_role_ids);

    const embed = createBaseEmbed({
      title: '⚡ Leveling & XP Management Panel',
      description: [
        `Leveling System: **${enabled ? '🟢 Enabled' : '⏸️ Disabled'}**`,
        `Announcement Mode: **${announceMode === 'ROLE_REWARDS_ONLY' ? 'Role Rewards Only' : 'All Levels'}**`,
        `Level-up Channel: ${config?.level_up_channel_id ? `<#${config.level_up_channel_id}>` : '*Current channel / none*'}`,
        '',
        '**💬 Text Chat XP Rates**',
        `• XP Per Message: **${config?.xp_min || 15}–${config?.xp_max || 25} XP**`,
        `• Message Cooldown: **${config?.cooldown_seconds || 60}s**`,
        `• Minimum Message Length: **${config?.minimum_message_length || 3} chars**`,
        '',
        '**🎙️ Voice Activity XP Rates**',
        `• Voice XP Status: **${voiceEnabled ? '🟢 Enabled' : '⏸️ Disabled'}**`,
        `• Voice XP Per Minute: **${config.voice_xp_min || 10}–${config.voice_xp_max || 20} XP**`,
        `• Anti-Farming Threshold: **≥ ${config.voice_xp_min_channel_members || 2} members in VC**`,
        `• Unmuted Required: **${config.voice_xp_require_unmuted !== false ? 'Yes (Mute/Deaf ignored)' : 'No'}**`,
        `• Ignored Voice Channels: **${ignoredVoice.length ? ignoredVoice.map((id) => `<#${id}>`).join(', ') : 'None'}**`,
        '',
        '**Role Rewards & Multipliers**',
        `• Role Rewards: **${rewards.length} configured**`,
        `• Multiplier Roles: **${multiplierRoles.length} configured**`,
        `• Ignored Channels: **${ignoredText.length} text** · **${ignoredVoice.length} voice**`,
        `• Ignored Roles: **${ignoredRoles.length} roles**`
      ].join('\n'),
      color: enabled ? SlickBotColors.SUCCESS : SlickBotColors.WARNING
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.LevelingToggle)
        .setLabel(enabled ? 'Disable XP' : 'Enable XP')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(enabled ? '⏸️' : '▶️'),
      new ButtonBuilder()
        .setCustomId(CustomIds.LevelingConfigModal)
        .setLabel('Edit XP Rates & Cooldown')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚡'),
      new ButtonBuilder()
        .setCustomId(CustomIds.LevelingToggleMode)
        .setLabel(`Mode: ${announceMode === 'ROLE_REWARDS_ONLY' ? 'Rewards Only' : 'All Levels'}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📢')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingModulePrefix}LEVELING`)
        .setLabel('Quick Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(CustomIds.LevelingRefresh)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupCategoryCommunity)
        .setLabel('Community')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✨'),
      new ButtonBuilder()
        .setCustomId(CustomIds.SetupRefresh)
        .setLabel('Setup Center')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row1, row2] };
  }

  buildRankEmbed(user, rankData) {
    if (!rankData) return createBaseEmbed({ title: `Rank • ${user.tag}`, description: 'This user has not earned XP yet.', color: SlickBotColors.WARNING });
    const p = rankData.progress;
    const voiceMinutes = Number(rankData.voiceMinutes || rankData.profile?.voice_minutes || 0);
    const voiceHours = Math.floor(voiceMinutes / 60);
    const remainingMins = voiceMinutes % 60;
    const voiceStr = voiceHours > 0 ? `${voiceHours}h ${remainingMins}m` : `${remainingMins}m`;

    return createBaseEmbed({
      title: `Rank • ${user.tag}`,
      description: [
        `Server Rank: **#${rankData.rank}**`,
        `Level: **${p.level}**`,
        `Total XP: **${p.xp.toLocaleString()}**`,
        `Messages: **${Number(rankData.profile?.message_count || 0).toLocaleString()}**`,
        `Voice Activity: **${voiceStr}**`,
        `Progress: **${p.currentXp.toLocaleString()} / ${p.neededXp.toLocaleString()} XP**`,
        `\`${progressBar(p.currentXp, p.neededXp)}\``
      ].join('\n'),
      color: SlickBotColors.INFO
    });
  }

  buildLeaderboardEmbed(rows) {
    return createBaseEmbed({
      title: 'SlickBot XP Leaderboard',
      description: rows.length
        ? rows.map((row, index) => `**${index + 1}.** <@${row.user_id}> — Level **${row.level}** · **${Number(row.xp).toLocaleString()} XP**`).join('\n')
        : 'No users have earned XP yet.',
      color: SlickBotColors.PRIMARY
    });
  }
}

function buildLevelingConfigModal(config) {
  return new ModalBuilder()
    .setCustomId(CustomIds.LevelingConfigModalSubmit)
    .setTitle('Configure XP Rates & Cooldown')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('xp_min')
          .setLabel('Minimum XP Per Message')
          .setPlaceholder('15')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setRequired(true)
          .setValue(String(config?.xp_min || 15))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('xp_max')
          .setLabel('Maximum XP Per Message')
          .setPlaceholder('25')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setRequired(true)
          .setValue(String(config?.xp_max || 25))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('cooldown')
          .setLabel('Cooldown Between XP Awards (Seconds)')
          .setPlaceholder('60')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setRequired(true)
          .setValue(String(config?.cooldown_seconds || 60))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('min_length')
          .setLabel('Minimum Message Length (Characters)')
          .setPlaceholder('1')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(4)
          .setRequired(true)
          .setValue(String(config?.minimum_message_length || 1))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('voice_xp_rate')
          .setLabel('Voice XP Range (Min-Max per min)')
          .setPlaceholder('10-20')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setRequired(false)
          .setValue(`${config?.voice_xp_min || 10}-${config?.voice_xp_max || 20}`)
      )
    );
}

module.exports = {
  LevelingService,
  totalXpForLevel,
  levelFromXp,
  progressForProfile,
  normalizeAnnouncementMode,
  formatMultiplier,
  buildLevelingConfigModal
};
