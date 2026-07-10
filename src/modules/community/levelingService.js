const { query } = require('../../services/db');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');

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

class LevelingService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM leveling_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
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
      ignoredChannels: values.ignoredChannels ?? safeArray(current?.ignored_channel_ids),
      ignoredRoles: values.ignoredRoles ?? safeArray(current?.ignored_role_ids)
    };
    if (config.xpMax < config.xpMin) [config.xpMin, config.xpMax] = [config.xpMax, config.xpMin];

    const result = await query(
      `INSERT INTO leveling_configs
       (guild_id, enabled, xp_min, xp_max, cooldown_seconds, minimum_message_length, level_up_channel_id, level_up_message, ignored_channel_ids, ignored_role_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
       ON CONFLICT (guild_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     xp_min = EXCLUDED.xp_min,
                     xp_max = EXCLUDED.xp_max,
                     cooldown_seconds = EXCLUDED.cooldown_seconds,
                     minimum_message_length = EXCLUDED.minimum_message_length,
                     level_up_channel_id = EXCLUDED.level_up_channel_id,
                     level_up_message = EXCLUDED.level_up_message,
                     ignored_channel_ids = EXCLUDED.ignored_channel_ids,
                     ignored_role_ids = EXCLUDED.ignored_role_ids,
                     updated_at = NOW()
       RETURNING *`,
      [guildId, config.enabled, config.xpMin, config.xpMax, config.cooldownSeconds, config.minimumMessageLength, config.levelUpChannelId, config.levelUpMessage, JSON.stringify(config.ignoredChannels), JSON.stringify(config.ignoredRoles)]
    );
    return result.rows[0];
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

    const existing = await this.getProfile(message.guild.id, message.author.id);
    const cooldownMs = Number(config.cooldown_seconds || 60) * 1000;
    if (existing?.last_xp_at && Date.now() - new Date(existing.last_xp_at).getTime() < cooldownMs) return { awarded: false };

    const minXp = Number(config.xp_min || 15);
    const maxXp = Number(config.xp_max || 25);
    const gained = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
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

    if (newLevel > oldLevel) await this.handleLevelUp(message, member, profile, oldLevel, config, logger);
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

    if (config.level_up_channel_id) {
      const channel = await message.guild.channels.fetch(config.level_up_channel_id).catch(() => null);
      if (channel && typeof channel.send === 'function') {
        const content = String(config.level_up_message || 'Congratulations {user}! You reached level **{level}**.')
          .replaceAll('{user}', `<@${message.author.id}>`)
          .replaceAll('{username}', message.author.username)
          .replaceAll('{level}', String(profile.level))
          .replaceAll('{server}', message.guild.name);
        await channel.send({ content }).catch(() => {});
      }
    }

    await logger?.log({
      guildId: message.guild.id,
      eventKey: 'leveling-level-up',
      title: 'Member Leveled Up',
      body: [`User: <@${message.author.id}>`, `New Level: **${profile.level}**`, assignedRoles.length ? `Roles Added: ${assignedRoles.map((id) => `<@&${id}>`).join(', ')}` : null].filter(Boolean).join('\n'),
      actorUserId: message.author.id,
      metadata: { userId: message.author.id, level: profile.level, assignedRoles }
    }).catch(() => {});
  }

  async buildManagerPanel(guildId) {
    const config = await this.getConfig(guildId);
    const [profiles, rewards] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM leveling_profiles WHERE guild_id = $1`, [guildId]),
      this.listRoleRewards(guildId)
    ]);
    return {
      embeds: [createBaseEmbed({
        title: 'SlickBot Leveling Center',
        description: config
          ? [
              `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
              `XP Range: **${config.xp_min}–${config.xp_max}** per eligible message`,
              `Cooldown: **${config.cooldown_seconds}s**`,
              `Minimum Message Length: **${config.minimum_message_length}**`,
              `Level-Up Channel: ${config.level_up_channel_id ? `<#${config.level_up_channel_id}>` : 'Not configured'}`,
              `Profiles: **${profiles.rows[0]?.count || 0}**`,
              `Role Rewards: **${rewards.length}**`,
              '',
              'Use `/level setup`, `/level role-add`, and the ignore-list commands to configure this module.'
            ].join('\n')
          : 'Leveling has not been configured. Run `/level setup` to create the default configuration.',
        color: config ? SlickBotColors.PRIMARY : SlickBotColors.WARNING
      })]
    };
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

module.exports = { LevelingService, totalXpForLevel, levelFromXp, progressForProfile };
