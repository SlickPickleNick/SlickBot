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
      ignoredRoles: values.ignoredRoles ?? safeArray(current?.ignored_role_ids)
    };
    if (config.xpMax < config.xpMin) [config.xpMin, config.xpMax] = [config.xpMax, config.xpMin];

    const result = await query(
      `INSERT INTO leveling_configs
       (guild_id, enabled, xp_min, xp_max, cooldown_seconds, minimum_message_length, level_up_channel_id, level_up_message, level_up_announce_mode, ignored_channel_ids, ignored_role_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
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
                     updated_at = NOW()
       RETURNING *`,
      [guildId, config.enabled, config.xpMin, config.xpMax, config.cooldownSeconds, config.minimumMessageLength, config.levelUpChannelId, config.levelUpMessage, config.levelUpAnnounceMode, JSON.stringify(config.ignoredChannels), JSON.stringify(config.ignoredRoles)]
    );
    const saved = result.rows[0];
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
    return { profile, rank: Number(rankResult.rows[0]?.rank || 1), progress: progressForProfile(profile) };
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
    return { rows, averageBaseXp, averageAward, multiplier: safeMultiplier, maxLevel: safeMaxLevel };
  }

  buildXpAnalysisCsv(analysis) {
    const lines = ['Level,XP From Previous Level,Total XP Required,Estimated Messages For Level,Estimated Messages Total'];
    for (const row of analysis.rows) {
      lines.push([row.level, row.incrementalXp, row.totalXp, row.estimatedMessagesForLevel, row.estimatedMessagesTotal].join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  buildXpAnalysisEmbed(analysis) {
    const milestoneLevels = [1, 5, 10, 25, 50, 100, analysis.maxLevel]
      .filter((value, index, values) => value <= analysis.maxLevel && values.indexOf(value) === index)
      .sort((a, b) => a - b);
    const milestones = milestoneLevels.map((level) => {
      const row = analysis.rows[level - 1];
      return `Level **${level}** — **${row.totalXp.toLocaleString()} XP** · ~**${row.estimatedMessagesTotal.toLocaleString()}** eligible messages`;
    });
    return createBaseEmbed({
      title: 'SlickBot XP Curve Analysis',
      description: [
        `Levels analyzed: **1–${analysis.maxLevel}**`,
        `Average base award: **${analysis.averageBaseXp.toFixed(1)} XP**`,
        `Analysis multiplier: **${formatMultiplier(analysis.multiplier)}**`,
        `Average adjusted award: **${analysis.averageAward.toFixed(1)} XP**`,
        '',
        ...milestones,
        '',
        'The attached CSV includes every analyzed level. Estimates assume every eligible message earns XP and do not account for cooldown downtime.'
      ].join('\n'),
      color: SlickBotColors.INFO
    });
  }

  async buildInfoEmbed(guild) {
    const config = await this.getConfig(guild.id);
    const [rewards, multipliers] = await Promise.all([
      this.listRoleRewards(guild.id),
      this.listMultiplierRoles(guild.id)
    ]);
    if (!config) {
      return createBaseEmbed({
        title: 'How SlickBot Levels Work',
        description: 'The Leveling module has not been configured yet.',
        color: SlickBotColors.WARNING
      });
    }

    const sortedMultipliers = [...multipliers].sort((a, b) => Number(a.multiplier) - Number(b.multiplier) || new Date(a.created_at || 0) - new Date(b.created_at || 0));
    const multiplierLines = sortedMultipliers.length
      ? sortedMultipliers.map((item) => `<@&${item.role_id}> — **${formatMultiplier(item.multiplier)} XP**`).join('\n')
      : 'No multiplier roles are configured.';
    const rewardLines = rewards.length
      ? rewards.slice(0, 15).map((item) => `Level **${item.level}** — <@&${item.role_id}>`).join('\n')
      : 'No level-role rewards are configured.';

    return createBaseEmbed({
      title: 'How SlickBot Levels Work',
      description: [
        '**Earning XP**',
        `Send eligible messages to earn a random **${config.xp_min}–${config.xp_max} XP**.`,
        `XP can be earned once every **${config.cooldown_seconds} seconds** per user.`,
        `Messages must contain at least **${config.minimum_message_length} characters**. Bot messages, ignored channels, and ignored roles do not earn XP.`,
        '',
        '**Multiplier Roles**',
        multiplierLines,
        multipliers.length > 1 ? '\nIf you have multiple multiplier roles, SlickBot uses the **highest multiplier** rather than stacking them.' : '',
        '',
        '**Level Rewards**',
        rewardLines,
        '',
        `Level-up announcements: **${normalizeAnnouncementMode(config.level_up_announce_mode) === 'ROLE_REWARDS_ONLY' ? 'Only levels with role rewards' : 'Every level'}**`,
        config.level_up_channel_id ? `Announcement channel: <#${config.level_up_channel_id}>` : 'Announcement channel: Not configured',
        '',
        '**Commands**',
        '`/level rank` — View your XP and level progress',
        '`/level leaderboard` — View the top XP users',
        '`/level info` — Show this information panel'
      ].filter(Boolean).join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: `SlickBot Leveling · ${guild.name}`
    });
  }

  async buildManagerPanel(guildId) {
    const config = await this.getConfig(guildId);
    const [profiles, rewards, multipliers] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM leveling_profiles WHERE guild_id = $1`, [guildId]),
      this.listRoleRewards(guildId),
      this.listMultiplierRoles(guildId)
    ]);

    const enabled = config?.enabled ?? false;
    const announceMode = normalizeAnnouncementMode(config?.level_up_announce_mode);
    const announceModeLabel = announceMode === 'ROLE_REWARDS_ONLY' ? 'Reward levels only' : 'All levels';

    const embed = createBaseEmbed({
      title: 'SlickBot Leveling Center',
      description: [
        `Status: **${enabled ? '🟢 Active & Tracking XP' : '⏸️ Disabled'}**`,
        `XP Range: **${config?.xp_min || 15}–${config?.xp_max || 25} XP** per eligible message`,
        `Cooldown: **${config?.cooldown_seconds || 60}s**`,
        `Minimum Message Length: **${config?.minimum_message_length || 1} chars**`,
        `Level-Up Channel: ${config?.level_up_channel_id ? `<#${config.level_up_channel_id}>` : '*Same channel as message*'}`,
        `Announcement Mode: **${announceModeLabel}**`,
        `Member Profiles: **${profiles.rows[0]?.count || 0}**`,
        `Role Rewards: **${rewards.length} role(s)**`,
        `Multiplier Roles: **${multipliers.length} role(s)**`,
        '',
        'Click the buttons below to toggle XP tracking, edit rates/cooldowns, or change announcement mode.'
      ].join('\n'),
      color: enabled ? SlickBotColors.SUCCESS : SlickBotColors.PRIMARY
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.LevelingToggle)
        .setLabel(enabled ? 'Disable XP' : 'Enable XP')
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(enabled ? '⏸️' : '▶️'),
      new ButtonBuilder()
        .setCustomId(CustomIds.LevelingConfigModal)
        .setLabel('Edit XP Rate & Cooldown')
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
    return createBaseEmbed({
      title: `Rank • ${user.tag}`,
      description: [
        `Server Rank: **#${rankData.rank}**`,
        `Level: **${p.level}**`,
        `Total XP: **${p.xp.toLocaleString()}**`,
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
