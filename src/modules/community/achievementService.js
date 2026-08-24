const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query } = require('../../services/db');
const { LevelingService } = require('./levelingService');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

const DEFAULT_UNLOCK_MESSAGE = '{user} unlocked **{achievement} — {tier}**!';
const HISTORY_PAGE_SIZE = 8;
const STANDARD_TIERS_VERSION = '0.9.4-standard-tiers';

const ACHIEVEMENT_TYPES = Object.freeze({
  TIERED: 'TIERED',
  ONE_TIME: 'ONE_TIME'
});

const STANDARD_TIERS = Object.freeze([
  { level: 1, name: 'Bronze' },
  { level: 2, name: 'Silver' },
  { level: 3, name: 'Gold' },
  { level: 4, name: 'Diamond' }
]);

const TIER_NAMES_BY_LEVEL = Object.freeze(Object.fromEntries(STANDARD_TIERS.map((tier) => [tier.level, tier.name])));
const MAX_STANDARD_TIER_LEVEL = 4;

const ACHIEVEMENT_KEYS = Object.freeze({
  MESSAGES_SENT: 'MESSAGES_SENT',
  VOICE_TIME: 'VOICE_TIME',
  REFERRALS: 'REFERRALS',
  SUGGESTIONS_SUBMITTED: 'SUGGESTIONS_SUBMITTED',
  GAMES_PLAYED: 'GAMES_PLAYED',
  GAMES_WON: 'GAMES_WON',
  SERVER_BOOSTING: 'SERVER_BOOSTING',
  HAPPY_BIRTHDAY: 'HAPPY_BIRTHDAY'
});

const TIERED_ACHIEVEMENT_KEYS = Object.freeze([
  ACHIEVEMENT_KEYS.MESSAGES_SENT,
  ACHIEVEMENT_KEYS.VOICE_TIME,
  ACHIEVEMENT_KEYS.REFERRALS,
  ACHIEVEMENT_KEYS.SUGGESTIONS_SUBMITTED,
  ACHIEVEMENT_KEYS.GAMES_PLAYED,
  ACHIEVEMENT_KEYS.GAMES_WON
]);

const ONE_TIME_ACHIEVEMENT_KEYS = Object.freeze([
  ACHIEVEMENT_KEYS.SERVER_BOOSTING,
  ACHIEVEMENT_KEYS.HAPPY_BIRTHDAY
]);

const STAT_COLUMNS = Object.freeze({
  [ACHIEVEMENT_KEYS.MESSAGES_SENT]: 'messages_sent',
  [ACHIEVEMENT_KEYS.VOICE_TIME]: 'voice_minutes',
  [ACHIEVEMENT_KEYS.REFERRALS]: 'referrals',
  [ACHIEVEMENT_KEYS.SUGGESTIONS_SUBMITTED]: 'suggestions_submitted',
  [ACHIEVEMENT_KEYS.GAMES_PLAYED]: 'games_played',
  [ACHIEVEMENT_KEYS.GAMES_WON]: 'games_won'
});

const ACHIEVEMENT_META = Object.freeze({
  [ACHIEVEMENT_KEYS.MESSAGES_SENT]: {
    type: ACHIEVEMENT_TYPES.TIERED,
    label: 'Message Maven',
    statLabel: 'messages sent',
    unit: 'messages',
    description: 'Send eligible messages in the server.'
  },
  [ACHIEVEMENT_KEYS.VOICE_TIME]: {
    type: ACHIEVEMENT_TYPES.TIERED,
    label: 'Voice Regular',
    statLabel: 'minutes in voice',
    unit: 'minutes',
    description: 'Spend time in voice or stage channels.'
  },
  [ACHIEVEMENT_KEYS.REFERRALS]: {
    type: ACHIEVEMENT_TYPES.TIERED,
    label: 'Community Recruiter',
    statLabel: 'successful referrals',
    unit: 'referrals',
    description: 'Have members list you as their referrer.'
  },
  [ACHIEVEMENT_KEYS.SUGGESTIONS_SUBMITTED]: {
    type: ACHIEVEMENT_TYPES.TIERED,
    label: 'Idea Builder',
    statLabel: 'suggestions submitted',
    unit: 'suggestions',
    description: 'Submit ideas through the Suggestions system.'
  },
  [ACHIEVEMENT_KEYS.GAMES_PLAYED]: {
    type: ACHIEVEMENT_TYPES.TIERED,
    label: 'Game Night Regular',
    statLabel: 'games played',
    unit: 'games',
    description: 'Complete SlickBot community games.'
  },
  [ACHIEVEMENT_KEYS.GAMES_WON]: {
    type: ACHIEVEMENT_TYPES.TIERED,
    label: 'Game Champion',
    statLabel: 'games won',
    unit: 'wins',
    description: 'Win SlickBot community games.'
  },
  [ACHIEVEMENT_KEYS.SERVER_BOOSTING]: {
    type: ACHIEVEMENT_TYPES.ONE_TIME,
    label: 'Server Booster',
    statLabel: 'server boost',
    unit: 'boost',
    description: 'Boost the server.',
    defaultXp: 250,
    removeWhenConditionEnds: false
  },
  [ACHIEVEMENT_KEYS.HAPPY_BIRTHDAY]: {
    type: ACHIEVEMENT_TYPES.ONE_TIME,
    label: 'Happy Birthday',
    statLabel: 'birthday setup',
    unit: 'birthday',
    description: 'Save your birthday with SlickBot.',
    defaultXp: 50,
    removeWhenConditionEnds: false
  }
});

const DEFAULT_TIERS = Object.freeze({
  [ACHIEVEMENT_KEYS.MESSAGES_SENT]: [
    { level: 1, threshold: 50, xp: 25 },
    { level: 2, threshold: 250, xp: 75 },
    { level: 3, threshold: 1000, xp: 150 },
    { level: 4, threshold: 5000, xp: 300 }
  ],
  [ACHIEVEMENT_KEYS.VOICE_TIME]: [
    { level: 1, threshold: 60, xp: 50 },
    { level: 2, threshold: 120, xp: 100 },
    { level: 3, threshold: 300, xp: 200 },
    { level: 4, threshold: 600, xp: 350 }
  ],
  [ACHIEVEMENT_KEYS.REFERRALS]: [
    { level: 1, threshold: 1, xp: 100 },
    { level: 2, threshold: 3, xp: 250 },
    { level: 3, threshold: 5, xp: 500 },
    { level: 4, threshold: 10, xp: 900 }
  ],
  [ACHIEVEMENT_KEYS.SUGGESTIONS_SUBMITTED]: [
    { level: 1, threshold: 1, xp: 50 },
    { level: 2, threshold: 5, xp: 125 },
    { level: 3, threshold: 10, xp: 250 },
    { level: 4, threshold: 25, xp: 500 }
  ],
  [ACHIEVEMENT_KEYS.GAMES_PLAYED]: [
    { level: 1, threshold: 1, xp: 50 },
    { level: 2, threshold: 10, xp: 125 },
    { level: 3, threshold: 25, xp: 250 },
    { level: 4, threshold: 75, xp: 500 }
  ],
  [ACHIEVEMENT_KEYS.GAMES_WON]: [
    { level: 1, threshold: 1, xp: 75 },
    { level: 2, threshold: 5, xp: 175 },
    { level: 3, threshold: 15, xp: 350 },
    { level: 4, threshold: 40, xp: 700 }
  ]
});

function achievementChoiceList(keys = Object.values(ACHIEVEMENT_KEYS)) {
  return keys.map((value) => ({ name: ACHIEVEMENT_META[value]?.label || value, value }));
}

function tieredAchievementChoiceList() {
  return achievementChoiceList(TIERED_ACHIEVEMENT_KEYS);
}

function oneTimeAchievementChoiceList() {
  return achievementChoiceList(ONE_TIME_ACHIEVEMENT_KEYS);
}

function normalizeAchievementKey(value) {
  const text = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (ACHIEVEMENT_KEYS[text]) return ACHIEVEMENT_KEYS[text];
  return Object.values(ACHIEVEMENT_KEYS).includes(text) ? text : null;
}

function normalizeTierLevel(value) {
  const input = String(value || '').trim().toLowerCase();
  const named = STANDARD_TIERS.find((tier) => tier.name.toLowerCase() === input);
  if (named) return named.level;
  const number = Math.floor(Number(value) || 0);
  return Math.max(1, Math.min(MAX_STANDARD_TIER_LEVEL, number));
}

function clampInteger(value, min = 0, max = 1000000000) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}

function formatDate(value) {
  const time = value ? new Date(value).getTime() : Date.now();
  return `<t:${Math.floor(time / 1000)}:D>`;
}

function formatStatValue(key, value) {
  const safe = Number(value || 0);
  if (key === ACHIEVEMENT_KEYS.VOICE_TIME) {
    const hours = Math.floor(safe / 60);
    const minutes = safe % 60;
    if (hours <= 0) return `${safe} min`;
    return `${hours}h ${minutes}m`;
  }
  return safe.toLocaleString();
}

function tierName(level) {
  return TIER_NAMES_BY_LEVEL[Number(level)] || `Level ${level}`;
}

function formatUnlockTitle(row, definitions = new Map()) {
  const name = row.name || definitions.get(row.achievement_key)?.name || ACHIEVEMENT_META[row.achievement_key]?.label || row.achievement_key;
  if (Number(row.tier_level || 0) <= 0) return `**${name}**`;
  const label = row.tier_name || tierName(row.tier_level);
  return `**${name} — ${label}**`;
}

function historyButton(userId, page = 0) {
  return new ButtonBuilder()
    .setCustomId(`${CustomIds.AchievementsHistoryPrefix}${userId}:${page}`)
    .setLabel('History')
    .setStyle(ButtonStyle.Secondary);
}

function refreshButton() {
  return new ButtonBuilder()
    .setCustomId(CustomIds.AchievementsRefresh)
    .setLabel('Refresh')
    .setStyle(ButtonStyle.Secondary);
}

class AchievementService {
  constructor() {
    this.leveling = new LevelingService();
    this.configCache = new Map();
    this.definitionsCache = new Map();
    this.ignoredChannelsCache = new Map();
    this.seededGuilds = new Set();
  }

  invalidateConfig(guildId) {
    if (guildId) this.configCache.delete(guildId);
    else this.configCache.clear();
  }

  invalidateDefinitions(guildId) {
    if (guildId) this.definitionsCache.delete(guildId);
    else this.definitionsCache.clear();
  }

  invalidateIgnoredChannels(guildId) {
    if (guildId) this.ignoredChannelsCache.delete(guildId);
    else this.ignoredChannelsCache.clear();
  }

  clearAllCaches() {
    this.configCache.clear();
    this.definitionsCache.clear();
    this.ignoredChannelsCache.clear();
    this.seededGuilds.clear();
  }

  async ensureConfig(guildId) {
    if (!guildId) return null;
    const result = await query(
      `INSERT INTO achievement_configs (guild_id, enabled, unlock_message)
       VALUES ($1,true,$2)
       ON CONFLICT (guild_id) DO UPDATE SET guild_id = EXCLUDED.guild_id
       RETURNING *`,
      [guildId, DEFAULT_UNLOCK_MESSAGE]
    );
    const config = result.rows[0];
    this.configCache.set(guildId, config);
    if (!this.seededGuilds.has(guildId)) {
      await this.ensureDefaultDefinitions(guildId);
    }
    return config;
  }

  async getConfig(guildId) {
    if (!guildId) return null;
    const cached = this.configCache.get(guildId);
    if (cached) return cached;

    const result = await query(`SELECT * FROM achievement_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) {
      this.configCache.set(guildId, result.rows[0]);
      return result.rows[0];
    }
    return this.ensureConfig(guildId);
  }

  async ensureDefaultTiers(guildId) {
    return this.ensureDefaultDefinitions(guildId);
  }

  async updateConfig(guildId, values = {}) {
    return this.setup(guildId, values);
  }

  async upsertConfig(guildId, values = {}) {
    return this.setup(guildId, values);
  }

  async setup(guildId, values = {}) {
    const current = await this.getConfig(guildId);
    const enabled = values.enabled ?? current.enabled ?? true;
    const announcementChannelId = values.announcementChannelId === undefined ? current.announcement_channel_id : values.announcementChannelId;
    const afkChannelId = values.clearAfkChannel ? null : (values.afkChannelId === undefined ? current.afk_channel_id : values.afkChannelId);
    const unlockMessage = values.unlockMessage ?? current.unlock_message ?? DEFAULT_UNLOCK_MESSAGE;
    const unlockImageUrl = values.clearImage ? null : (values.unlockImageUrl === undefined ? current.unlock_image_url : values.unlockImageUrl);
    const dmEnabled = values.dmEnabled ?? current.dm_enabled ?? false;
    const result = await query(
      `INSERT INTO achievement_configs (guild_id, enabled, announcement_channel_id, afk_channel_id, unlock_message, unlock_image_url, dm_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (guild_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     announcement_channel_id = EXCLUDED.announcement_channel_id,
                     afk_channel_id = EXCLUDED.afk_channel_id,
                     unlock_message = EXCLUDED.unlock_message,
                     unlock_image_url = EXCLUDED.unlock_image_url,
                     dm_enabled = EXCLUDED.dm_enabled,
                     updated_at = NOW()
       RETURNING *`,
      [guildId, enabled, announcementChannelId || null, afkChannelId || null, String(unlockMessage || DEFAULT_UNLOCK_MESSAGE).slice(0, 1500), unlockImageUrl || null, dmEnabled === true]
    );
    const config = result.rows[0];
    this.configCache.set(guildId, config);
    await this.ensureDefaultDefinitions(guildId);
    return config;
  }

  async ensureDefaultDefinitions(guildId) {
    if (!guildId) return;
    for (const [key, meta] of Object.entries(ACHIEVEMENT_META)) {
      await query(
        `INSERT INTO achievement_definitions
         (guild_id, achievement_key, name, description, stat_key, achievement_type, one_time_xp_reward, one_time_role_reward_id, remove_when_condition_ends, enabled)
         VALUES ($1,$2,$3,$4,$2,$5,$6,NULL,$7,true)
         ON CONFLICT (guild_id, achievement_key)
         DO UPDATE SET description = COALESCE(achievement_definitions.description, EXCLUDED.description),
                       stat_key = EXCLUDED.stat_key,
                       achievement_type = EXCLUDED.achievement_type,
                       one_time_xp_reward = COALESCE(achievement_definitions.one_time_xp_reward, EXCLUDED.one_time_xp_reward),
                       remove_when_condition_ends = COALESCE(achievement_definitions.remove_when_condition_ends, EXCLUDED.remove_when_condition_ends)`,
        [guildId, key, meta.label, meta.description, meta.type || ACHIEVEMENT_TYPES.TIERED, meta.defaultXp || 0, meta.removeWhenConditionEnds === true]
      );

      if ((meta.type || ACHIEVEMENT_TYPES.TIERED) !== ACHIEVEMENT_TYPES.TIERED) continue;
      for (const tier of DEFAULT_TIERS[key] || []) {
        await query(
          `INSERT INTO achievement_tiers (guild_id, achievement_key, tier_level, tier_name, threshold_value, xp_reward, role_reward_id, enabled)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,true)
           ON CONFLICT (guild_id, achievement_key, tier_level)
           DO UPDATE SET tier_name = EXCLUDED.tier_name,
                         threshold_value = CASE WHEN achievement_tiers.threshold_value IS NULL THEN EXCLUDED.threshold_value ELSE achievement_tiers.threshold_value END,
                         xp_reward = CASE WHEN achievement_tiers.xp_reward IS NULL THEN EXCLUDED.xp_reward ELSE achievement_tiers.xp_reward END,
                         enabled = true,
                         updated_at = NOW()`,
          [guildId, key, tier.level, tierName(tier.level), tier.threshold, tier.xp]
        );
      }
      await query(
        `UPDATE achievement_tiers
         SET enabled = false, updated_at = NOW()
         WHERE guild_id = $1 AND achievement_key = $2 AND tier_level > $3`,
        [guildId, key, MAX_STANDARD_TIER_LEVEL]
      );
    }
    await this.applyStandardTierDefaultsIfNeeded(guildId);
    this.seededGuilds.add(guildId);
    this.invalidateDefinitions(guildId);
  }

  async applyStandardTierDefaultsIfNeeded(guildId) {
    const version = await query(`SELECT standard_tiers_version FROM achievement_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    if (version.rows[0]?.standard_tiers_version === STANDARD_TIERS_VERSION) return;
    for (const [key, tiers] of Object.entries(DEFAULT_TIERS)) {
      for (const tier of tiers) {
        await query(
          `INSERT INTO achievement_tiers (guild_id, achievement_key, tier_level, tier_name, threshold_value, xp_reward, role_reward_id, enabled)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,true)
           ON CONFLICT (guild_id, achievement_key, tier_level)
           DO UPDATE SET tier_name = EXCLUDED.tier_name,
                         threshold_value = EXCLUDED.threshold_value,
                         xp_reward = EXCLUDED.xp_reward,
                         enabled = true,
                         updated_at = NOW()`,
          [guildId, key, tier.level, tierName(tier.level), tier.threshold, tier.xp]
        );
      }
      await query(
        `UPDATE achievement_tiers
         SET enabled = false, updated_at = NOW()
         WHERE guild_id = $1 AND achievement_key = $2 AND tier_level > $3`,
        [guildId, key, MAX_STANDARD_TIER_LEVEL]
      );
    }
    await query(`UPDATE achievement_configs SET standard_tiers_version = $2, updated_at = NOW() WHERE guild_id = $1`, [guildId, STANDARD_TIERS_VERSION]).catch(() => {});
  }

  async listDefinitions(guildId) {
    await this.ensureConfig(guildId);
    const result = await query(
      `SELECT * FROM achievement_definitions WHERE guild_id = $1 ORDER BY achievement_type ASC, name ASC`,
      [guildId]
    );
    return result.rows;
  }

  async getDefinitionsMap(guildId) {
    const cached = this.definitionsCache.get(guildId);
    if (cached) return cached;
    const definitions = await this.listDefinitions(guildId);
    const map = new Map(definitions.map((row) => [row.achievement_key, row]));
    this.definitionsCache.set(guildId, map);
    return map;
  }

  async listTiers(guildId, achievementKey = null) {
    await this.ensureConfig(guildId);
    const params = [guildId];
    let where = 'guild_id = $1';
    if (achievementKey) {
      params.push(achievementKey);
      where += ` AND achievement_key = $2`;
    }
    const result = await query(
      `SELECT * FROM achievement_tiers WHERE ${where} ORDER BY achievement_key ASC, tier_level ASC`,
      params
    );
    return result.rows;
  }

  async setTier({ guildId, achievementKey, level, threshold, xpReward, roleRewardId, enabled = true, imageUrl = undefined, clearImage = false }) {
    await this.ensureConfig(guildId);
    const safeKey = normalizeAchievementKey(achievementKey);
    if (!safeKey || !TIERED_ACHIEVEMENT_KEYS.includes(safeKey)) throw new Error('Invalid tiered achievement key.');
    const safeLevel = normalizeTierLevel(level);
    const safeThreshold = clampInteger(threshold, 1, 1000000000);
    const existing = await query(
      `SELECT xp_reward, role_reward_id, image_url, enabled FROM achievement_tiers WHERE guild_id = $1 AND achievement_key = $2 AND tier_level = $3`,
      [guildId, safeKey, safeLevel]
    );
    const existingXp = existing.rows[0]?.xp_reward;
    const existingRole = existing.rows[0]?.role_reward_id;
    const existingImage = existing.rows[0]?.image_url;
    const safeXp = clampInteger(xpReward ?? existingXp ?? 0, 0, 100000);
    const role = roleRewardId === undefined ? existingRole : roleRewardId;
    const image = clearImage ? null : (imageUrl === undefined ? existingImage || null : imageUrl || null);
    const result = await query(
      `INSERT INTO achievement_tiers (guild_id, achievement_key, tier_level, tier_name, threshold_value, xp_reward, role_reward_id, image_url, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (guild_id, achievement_key, tier_level)
       DO UPDATE SET tier_name = EXCLUDED.tier_name,
                     threshold_value = EXCLUDED.threshold_value,
                     xp_reward = EXCLUDED.xp_reward,
                     role_reward_id = EXCLUDED.role_reward_id,
                     image_url = EXCLUDED.image_url,
                     enabled = EXCLUDED.enabled,
                     updated_at = NOW()
       RETURNING *`,
      [guildId, safeKey, safeLevel, tierName(safeLevel), safeThreshold, safeXp, role || null, image ? String(image).slice(0, 1800) : null, enabled !== false]
    );
    return result.rows[0];
  }

  async removeTier({ guildId, achievementKey, level }) {
    const safeKey = normalizeAchievementKey(achievementKey);
    if (!safeKey || !TIERED_ACHIEVEMENT_KEYS.includes(safeKey)) throw new Error('Invalid tiered achievement key.');
    const result = await query(
      `UPDATE achievement_tiers SET enabled = false, updated_at = NOW()
       WHERE guild_id = $1 AND achievement_key = $2 AND tier_level = $3 RETURNING *`,
      [guildId, safeKey, normalizeTierLevel(level)]
    );
    return result.rowCount > 0;
  }

  async renameAchievement({ guildId, achievementKey, name, description = undefined }) {
    await this.ensureConfig(guildId);
    const safeKey = normalizeAchievementKey(achievementKey);
    if (!safeKey) throw new Error('Invalid achievement key.');
    const result = await query(
      `UPDATE achievement_definitions
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           updated_at = NOW()
       WHERE guild_id = $1 AND achievement_key = $2
       RETURNING *`,
      [guildId, safeKey, name ? String(name).slice(0, 100) : null, description === undefined ? null : String(description).slice(0, 500)]
    );
    this.invalidateDefinitions(guildId);
    return result.rows[0];
  }

  async configureOneTimeAchievement({ guildId, achievementKey, enabled = undefined, removeWhenLost = undefined, xpReward = undefined, roleRewardId = undefined, imageUrl = undefined, clearImage = false }) {
    await this.ensureConfig(guildId);
    const safeKey = normalizeAchievementKey(achievementKey);
    if (!safeKey || !ONE_TIME_ACHIEVEMENT_KEYS.includes(safeKey)) throw new Error('Invalid one-time achievement key.');
    const current = await query(
      `SELECT * FROM achievement_definitions WHERE guild_id = $1 AND achievement_key = $2 LIMIT 1`,
      [guildId, safeKey]
    );
    const existing = current.rows[0] || {};
    const image = clearImage ? null : (imageUrl === undefined ? existing.image_url || null : imageUrl || null);
    const result = await query(
      `UPDATE achievement_definitions
       SET enabled = COALESCE($3, enabled),
           remove_when_condition_ends = COALESCE($4, remove_when_condition_ends),
           one_time_xp_reward = COALESCE($5, one_time_xp_reward),
           one_time_role_reward_id = $6,
           image_url = $7,
           updated_at = NOW()
       WHERE guild_id = $1 AND achievement_key = $2
       RETURNING *`,
      [
        guildId,
        safeKey,
        enabled === undefined ? null : enabled !== false,
        removeWhenLost === undefined ? null : removeWhenLost === true,
        xpReward === undefined ? null : clampInteger(xpReward, 0, 100000),
        roleRewardId === undefined ? existing.one_time_role_reward_id || null : roleRewardId || null,
        image ? String(image).slice(0, 1800) : null
      ]
    );
    this.invalidateDefinitions(guildId);
    return result.rows[0];
  }

  async addIgnoredChannel(guildId, channelId) {
    await query(
      `INSERT INTO achievement_ignored_message_channels (guild_id, channel_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id, channel_id) DO UPDATE SET guild_id = EXCLUDED.guild_id`,
      [guildId, channelId]
    );
    this.invalidateIgnoredChannels(guildId);
  }

  async removeIgnoredChannel(guildId, channelId) {
    await query(`DELETE FROM achievement_ignored_message_channels WHERE guild_id = $1 AND channel_id = $2`, [guildId, channelId]);
    this.invalidateIgnoredChannels(guildId);
  }

  async listIgnoredChannels(guildId) {
    let ignored = this.ignoredChannelsCache.get(guildId);
    if (!ignored) {
      const result = await query(`SELECT channel_id FROM achievement_ignored_message_channels WHERE guild_id = $1 ORDER BY channel_id ASC`, [guildId]);
      ignored = new Set(result.rows.map((row) => row.channel_id));
      this.ignoredChannelsCache.set(guildId, ignored);
    }
    return Array.from(ignored);
  }

  async isMessageChannelIgnored(guildId, channelId) {
    if (!guildId || !channelId) return false;
    let ignored = this.ignoredChannelsCache.get(guildId);
    if (!ignored) {
      const result = await query(
        `SELECT channel_id FROM achievement_ignored_message_channels WHERE guild_id = $1`,
        [guildId]
      ).catch(() => ({ rows: [] }));
      ignored = new Set(result.rows.map((row) => row.channel_id));
      this.ignoredChannelsCache.set(guildId, ignored);
    }
    return ignored.has(channelId);
  }

  async recordMessage(message, logger) {
    if (!message?.guild || !message.author || message.author.bot) return [];
    const config = await this.getConfig(message.guild.id);
    if (!config || config.enabled === false) return [];
    if (await this.isMessageChannelIgnored(message.guild.id, message.channelId)) return [];
    return this.recordStat({
      guild: message.guild,
      channel: message.channel,
      userId: message.author.id,
      userTag: message.author.tag || message.author.username || null,
      statKey: ACHIEVEMENT_KEYS.MESSAGES_SENT,
      amount: 1,
      logger
    });
  }

  async recordStat({ guild, channel = null, userId, userTag = null, statKey, amount = 1, logger }) {
    if (!guild || !userId) return [];
    const key = normalizeAchievementKey(statKey);
    if (!key || !STAT_COLUMNS[key]) return [];
    const config = await this.getConfig(guild.id);
    if (!config || config.enabled === false) return [];

    const column = STAT_COLUMNS[key];
    const safeAmount = clampInteger(amount, 0, 1000000000);
    if (safeAmount <= 0) return [];

    const stats = await query(
      `INSERT INTO achievement_user_stats (guild_id, user_id, user_tag, ${column})
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag,
                     ${column} = achievement_user_stats.${column} + EXCLUDED.${column},
                     updated_at = NOW()
       RETURNING *`,
      [guild.id, userId, userTag, safeAmount]
    );

    return this.checkUnlocks({ guild, channel, userId, userTag, statKey: key, statValue: Number(stats.rows[0]?.[column] || 0), logger });
  }

  async checkUnlocks({ guild, channel = null, userId, userTag = null, statKey, statValue, logger }) {
    const key = normalizeAchievementKey(statKey);
    if (!key || !TIERED_ACHIEVEMENT_KEYS.includes(key)) return [];
    await this.ensureConfig(guild.id);
    const tiers = await query(
      `SELECT t.*, d.name
       FROM achievement_tiers t
       JOIN achievement_definitions d ON d.guild_id = t.guild_id AND d.achievement_key = t.achievement_key
       WHERE t.guild_id = $1
         AND t.achievement_key = $2
         AND t.enabled = true
         AND d.enabled = true
         AND d.achievement_type = 'TIERED'
         AND t.tier_level BETWEEN 1 AND $3
         AND t.threshold_value <= $4
         AND NOT EXISTS (
           SELECT 1 FROM achievement_unlocks u
           WHERE u.guild_id = t.guild_id
             AND u.user_id = $5
             AND u.achievement_key = t.achievement_key
             AND u.tier_level = t.tier_level
         )
       ORDER BY t.tier_level ASC`,
      [guild.id, key, MAX_STANDARD_TIER_LEVEL, Number(statValue || 0), userId]
    );

    const unlocked = [];
    for (const tier of tiers.rows) {
      const insert = await query(
        `INSERT INTO achievement_unlocks
         (guild_id, user_id, user_tag, achievement_key, tier_level, threshold_value, xp_rewarded, role_reward_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (guild_id, user_id, achievement_key, tier_level) DO NOTHING
         RETURNING *`,
        [guild.id, userId, userTag, key, tier.tier_level, tier.threshold_value, tier.xp_reward || 0, tier.role_reward_id || null]
      );
      if (!insert.rows[0]) continue;
      const unlock = await this.applyRewardsAndAnnounce({ guild, channel, userId, userTag, achievementKey: key, definition: { name: tier.name }, tier, unlock: insert.rows[0], logger });
      unlocked.push(unlock);
    }
    return unlocked;
  }

  async recordOneTimeAchievement({ guild, channel = null, user, userId, userTag = null, achievementKey, logger }) {
    if (!guild) return null;
    const targetId = user?.id || userId;
    if (!targetId || user?.bot) return null;
    const key = normalizeAchievementKey(achievementKey);
    if (!key || !ONE_TIME_ACHIEVEMENT_KEYS.includes(key)) return null;
    const config = await this.getConfig(guild.id);
    if (!config || config.enabled === false) return null;
    const definitionResult = await query(
      `SELECT * FROM achievement_definitions WHERE guild_id = $1 AND achievement_key = $2 AND achievement_type = 'ONE_TIME' LIMIT 1`,
      [guild.id, key]
    );
    const definition = definitionResult.rows[0];
    if (!definition || definition.enabled === false) return null;
    const xp = Number(definition.one_time_xp_reward || 0);
    const insert = await query(
      `INSERT INTO achievement_unlocks
       (guild_id, user_id, user_tag, achievement_key, tier_level, threshold_value, xp_rewarded, role_reward_id)
       VALUES ($1,$2,$3,$4,0,1,$5,$6)
       ON CONFLICT (guild_id, user_id, achievement_key, tier_level) DO NOTHING
       RETURNING *`,
      [guild.id, targetId, user?.tag || user?.username || userTag || null, key, xp, definition.one_time_role_reward_id || null]
    );
    if (!insert.rows[0]) return null;
    return this.applyRewardsAndAnnounce({ guild, channel, userId: targetId, userTag: user?.tag || user?.username || userTag || null, achievementKey: key, definition, tier: null, unlock: insert.rows[0], logger });
  }

  async revokeOneTimeAchievementIfConfigured({ guild, userId, achievementKey, logger }) {
    if (!guild || !userId) return { removed: false, configured: false };
    const key = normalizeAchievementKey(achievementKey);
    if (!key || !ONE_TIME_ACHIEVEMENT_KEYS.includes(key)) return { removed: false, configured: false };
    const definitionResult = await query(
      `SELECT * FROM achievement_definitions WHERE guild_id = $1 AND achievement_key = $2 AND achievement_type = 'ONE_TIME' LIMIT 1`,
      [guild.id, key]
    );
    const definition = definitionResult.rows[0];
    if (!definition?.remove_when_condition_ends) return { removed: false, configured: false };
    const removed = await query(
      `DELETE FROM achievement_unlocks
       WHERE guild_id = $1 AND user_id = $2 AND achievement_key = $3 AND tier_level = 0
       RETURNING *`,
      [guild.id, userId, key]
    );
    if (removed.rowCount > 0 && definition.one_time_role_reward_id) {
      const member = await guild.members.fetch(userId).catch(() => null);
      await member?.roles?.remove?.(definition.one_time_role_reward_id, `Achievement revoked: ${definition.name}`).catch(() => {});
    }
    if (removed.rowCount > 0) {
      await logger?.log?.({
        guildId: guild.id,
        eventKey: 'achievement-config',
        title: 'One-Time Achievement Removed',
        body: `User: <@${userId}>\nAchievement: **${definition.name || key}**`,
        actorUserId: userId,
        metadata: { userId, achievementKey: key }
      }).catch(() => {});
    }
    return { removed: removed.rowCount > 0, configured: true };
  }

  async applyRewardsAndAnnounce({ guild, channel = null, userId, userTag = null, achievementKey, definition, tier = null, unlock, logger }) {
    const xp = Number(tier?.xp_reward ?? definition?.one_time_xp_reward ?? 0);
    let xpAward = null;
    if (xp > 0) {
      xpAward = await this.leveling.awardBonusXpToUser({
        guild,
        channel,
        userId,
        amount: xp,
        logger,
        reason: tier ? `${definition?.name || achievementKey} achievement ${tierName(tier.tier_level)}` : `${definition?.name || achievementKey} achievement`
      }).catch(() => ({ awarded: false }));
    }

    const roleId = tier?.role_reward_id || definition?.one_time_role_reward_id || null;
    let roleAwarded = false;
    if (roleId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member?.roles?.add) {
        roleAwarded = await member.roles.add(roleId, `Achievement reward: ${definition?.name || achievementKey}`).then(() => true).catch(() => false);
      }
    }

    const result = { ...unlock, name: definition?.name, tier_name: tier?.tier_name || (tier ? tierName(tier.tier_level) : null), xpAwarded: xpAward?.awarded ? xpAward.gained : 0, roleAwarded };
    await this.sendUnlockAnnouncement({ guild, channel, userId, achievementKey, definition, tier, xpReward: xp }).catch(() => {});
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'achievement-unlock',
      title: 'Achievement Unlocked',
      body: [
        `User: <@${userId}>`,
        `Achievement: **${definition?.name || ACHIEVEMENT_META[achievementKey]?.label || achievementKey}**`,
        tier ? `Tier: **${tierName(tier.tier_level)}**` : 'Type: **One-Time**',
        tier ? `Threshold: **${tier.threshold_value}**` : null,
        `XP: **${xp}**`
      ].filter(Boolean).join('\n'),
      actorUserId: userId,
      metadata: { userId, achievementKey, tierLevel: tier?.tier_level || 0, threshold: tier?.threshold_value || 1 }
    }).catch(() => {});
    return result;
  }

  async sendUnlockAnnouncement({ guild, channel = null, userId, achievementKey, definition = null, tier = null, xpReward = 0 }) {
    const config = await this.getConfig(guild.id);
    const hasAnnouncementChannel = Boolean(config?.announcement_channel_id);
    const hasDm = Boolean(config?.dm_enabled);
    if (!hasAnnouncementChannel && !hasDm) return false;

    const meta = ACHIEVEMENT_META[achievementKey] || { label: definition?.name || achievementKey, unit: 'points' };
    const displayName = definition?.name || meta.label;
    const displayTier = tier ? (tier.tier_name || tierName(tier.tier_level)) : 'Unlocked';
    const threshold = tier ? `${Number(tier.threshold_value || 0).toLocaleString()} ${meta.unit}` : 'One-time achievement';
    const message = String(config.unlock_message || DEFAULT_UNLOCK_MESSAGE)
      .replaceAll('{user}', `<@${userId}>`)
      .replaceAll('{username}', `<@${userId}>`)
      .replaceAll('{achievement}', displayName)
      .replaceAll('{tier}', displayTier)
      .replaceAll('{level}', displayTier)
      .replaceAll('{threshold}', String(tier?.threshold_value || 1))
      .replaceAll('{reward_xp}', String(xpReward || 0))
      .replaceAll('{server}', guild.name || 'the server');

    const chosenImageUrl = tier?.image_url || definition?.image_url || config.unlock_image_url || null;

    const embed = createSuccessEmbed('Achievement Unlocked', message)
      .addFields(
        { name: 'Achievement', value: tier ? `${displayName} — ${displayTier}` : displayName, inline: true },
        { name: 'Requirement', value: threshold, inline: true },
        { name: 'Reward', value: Number(xpReward || 0) > 0 ? `+${xpReward} XP` : 'No XP reward', inline: true }
      )
      .setFooter({ text: 'SlickBot Achievements' });
    if (chosenImageUrl) embed.setImage(chosenImageUrl);

    let channelSent = false;
    let dmSent = false;

    if (hasAnnouncementChannel) {
      const target = await guild.channels.fetch(config.announcement_channel_id).catch(() => null);
      if (target?.send) {
        await target.send({ content: `<@${userId}>`, embeds: [embed] }).then(() => { channelSent = true; }).catch(() => null);
      }
    }

    if (hasDm) {
      const member = await guild.members.fetch(userId).catch(() => null);
      const user = member?.user || await guild.client?.users?.fetch(userId).catch(() => null);
      if (user?.send) {
        await user.send({ embeds: [embed] }).then(() => { dmSent = true; }).catch(() => null);
      }
    }

    return channelSent || dmSent;
  }

  async startVoiceSession(state) {
    const member = state?.member;
    if (!state?.guild || !member || member.user?.bot || !state.channelId) return;
    const config = await this.getConfig(state.guild.id);
    if (!config || config.enabled === false) return;
    if (config.afk_channel_id && state.channelId === config.afk_channel_id) return;
    await query(
      `INSERT INTO achievement_voice_sessions (guild_id, user_id, user_tag, channel_id, joined_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET user_tag = EXCLUDED.user_tag,
                     channel_id = EXCLUDED.channel_id,
                     joined_at = COALESCE(achievement_voice_sessions.joined_at, EXCLUDED.joined_at),
                     updated_at = NOW()`,
      [state.guild.id, member.id, member.user.tag || member.user.username || null, state.channelId]
    );
  }

  async endVoiceSession(state, logger) {
    const member = state?.member;
    if (!state?.guild || !member || member.user?.bot) return [];
    const result = await query(
      `DELETE FROM achievement_voice_sessions
       WHERE guild_id = $1 AND user_id = $2
       RETURNING *`,
      [state.guild.id, member.id]
    );
    const session = result.rows[0];
    if (!session) return [];
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(session.joined_at).getTime()) / 60000));
    const unlocked = await this.recordStat({
      guild: state.guild,
      channel: state.channel || null,
      userId: member.id,
      userTag: member.user.tag || member.user.username || null,
      statKey: ACHIEVEMENT_KEYS.VOICE_TIME,
      amount: minutes,
      logger
    });
    await logger?.log?.({
      guildId: state.guild.id,
      eventKey: 'achievement-voice-session',
      title: 'Voice Achievement Time Recorded',
      body: `User: <@${member.id}>\nMinutes: **${minutes}**`,
      actorUserId: member.id,
      metadata: { userId: member.id, minutes, channelId: session.channel_id }
    }).catch(() => {});
    return unlocked;
  }

  async processVoiceStateUpdate(oldState, newState, logger) {
    const member = newState?.member || oldState?.member;
    if (!member || member.user?.bot) return;
    const oldChannelId = oldState?.channelId || null;
    const newChannelId = newState?.channelId || null;
    if (oldChannelId === newChannelId) return;
    if (oldChannelId) await this.endVoiceSession(oldState, logger);
    if (newChannelId) await this.startVoiceSession(newState);
  }

  async processVoiceHeartbeat(client, logger) {
    const result = await query(`SELECT * FROM achievement_voice_sessions ORDER BY joined_at ASC LIMIT 500`);
    for (const session of result.rows) {
      const guild = client.guilds.cache.get(session.guild_id) || await client.guilds.fetch(session.guild_id).catch(() => null);
      if (!guild) continue;
      const member = await guild.members.fetch(session.user_id).catch(() => null);
      const activeChannelId = member?.voice?.channelId || null;
      const config = await this.getConfig(session.guild_id);
      if (!member || !activeChannelId || activeChannelId !== session.channel_id || (config.afk_channel_id && activeChannelId === config.afk_channel_id)) {
        const fakeState = { guild, member: member || { id: session.user_id, user: { bot: false, tag: session.user_tag || null, username: session.user_tag || null } }, channel: null };
        await this.endVoiceSession(fakeState, logger).catch(() => {});
      }
    }
  }

  async getStats(guildId, userId) {
    await this.ensureConfig(guildId);
    const result = await query(
      `INSERT INTO achievement_user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET guild_id = EXCLUDED.guild_id
       RETURNING *`,
      [guildId, userId]
    );
    return result.rows[0];
  }

  async recentUnlocks(guildId, userId, limit = 5, offset = 0) {
    const result = await query(
      `SELECT u.*, d.name, t.tier_name
       FROM achievement_unlocks u
       LEFT JOIN achievement_definitions d ON d.guild_id = u.guild_id AND d.achievement_key = u.achievement_key
       LEFT JOIN achievement_tiers t ON t.guild_id = u.guild_id AND t.achievement_key = u.achievement_key AND t.tier_level = u.tier_level
       WHERE u.guild_id = $1 AND u.user_id = $2
       ORDER BY u.unlocked_at DESC
       LIMIT $3 OFFSET $4`,
      [guildId, userId, limit, offset]
    );
    return result.rows;
  }

  async unlockCount(guildId, userId) {
    const result = await query(`SELECT COUNT(*)::int AS count FROM achievement_unlocks WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
    return Number(result.rows[0]?.count || 0);
  }

  statsLines(stats) {
    return [
      `Messages Sent: **${Number(stats.messages_sent || 0).toLocaleString()}**`,
      `Voice Time: **${formatStatValue(ACHIEVEMENT_KEYS.VOICE_TIME, Number(stats.voice_minutes || 0))}**`,
      `Referrals: **${Number(stats.referrals || 0).toLocaleString()}**`,
      `Suggestions Submitted: **${Number(stats.suggestions_submitted || 0).toLocaleString()}**`,
      `Games Played: **${Number(stats.games_played || 0).toLocaleString()}**`,
      `Games Won: **${Number(stats.games_won || 0).toLocaleString()}**`
    ];
  }

  unlockLines(unlocks, empty = 'No achievements unlocked yet.') {
    if (!unlocks.length) return [empty];
    return unlocks.map((row) => `${formatUnlockTitle(row)}\nEarned ${formatDate(row.unlocked_at)}`);
  }

  async buildProfilePayload(guild, user) {
    const stats = await this.getStats(guild.id, user.id);
    const recent = await this.recentUnlocks(guild.id, user.id, 5, 0);
    const total = await this.unlockCount(guild.id, user.id);
    const embed = createBaseEmbed({
      title: `${user.username || user.tag || 'Member'}'s Achievements`,
      description: this.statsLines(stats).join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: `SlickBot Achievements • ${total} unlocked`
    });
    const avatarUrl = user.displayAvatarURL?.({ size: 128 });
    if (avatarUrl) embed.setThumbnail(avatarUrl);
    embed.addFields({
      name: 'Most Recent Achievements',
      value: this.unlockLines(recent).join('\n\n').slice(0, 1024)
    });
    const row = new ActionRowBuilder().addComponents(historyButton(user.id, 0), refreshButton());
    return { embeds: [embed], components: [row] };
  }

  async buildHistoryPayload(guild, user, page = 0) {
    const safePage = Math.max(0, Math.floor(Number(page) || 0));
    const total = await this.unlockCount(guild.id, user.id);
    const unlocks = await this.recentUnlocks(guild.id, user.id, HISTORY_PAGE_SIZE, safePage * HISTORY_PAGE_SIZE);
    const maxPage = Math.max(0, Math.ceil(total / HISTORY_PAGE_SIZE) - 1);
    const embed = createBaseEmbed({
      title: `${user.username || user.tag || 'Member'}'s Achievement History`,
      description: this.unlockLines(unlocks, 'No achievements found on this page.').join('\n\n').slice(0, 4096),
      color: SlickBotColors.INFO,
      footer: `SlickBot Achievements • Page ${safePage + 1} of ${maxPage + 1}`
    });
    const avatarUrl = user.displayAvatarURL?.({ size: 128 });
    if (avatarUrl) embed.setThumbnail(avatarUrl);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AchievementsHistoryPrefix}${user.id}:${Math.max(0, safePage - 1)}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.AchievementsHistoryPrefix}${user.id}:${Math.min(maxPage, safePage + 1)}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= maxPage),
      refreshButton()
    );
    return { embeds: [embed], components: [row] };
  }

  async buildManagerPanel(guildId) {
    const config = (await this.getConfig(guildId)) || {};
    const definitions = await this.listDefinitions(guildId);
    const tiers = await this.listTiers(guildId);
    const ignored = await this.listIgnoredChannels(guildId);
    const oneTime = definitions.filter((definition) => definition.achievement_type === ACHIEVEMENT_TYPES.ONE_TIME);
    const embed = createBaseEmbed({
      title: 'SlickBot Community Center',
      description: [
        '**Viewing:** Achievements',
        '',
        `Status: **${config.enabled === false ? 'Disabled' : 'Enabled'}**`,
        `Announcement Channel: ${config.announcement_channel_id ? `<#${config.announcement_channel_id}>` : 'Not configured'}`,
        `DM Notifications: **${config.dm_enabled ? 'Enabled' : 'Disabled'}**`,
        `AFK Channel Exclusion: ${config.afk_channel_id ? `<#${config.afk_channel_id}>` : 'Not configured'}`,
        `Ignored Message Channels: **${ignored.length}**`,
        `Tiered Achievements: **${definitions.length - oneTime.length}**`,
        `One-Time Achievements: **${oneTime.length}**`,
        `Configured Standard Tiers: **${tiers.filter((tier) => Number(tier.tier_level) <= MAX_STANDARD_TIER_LEVEL && tier.enabled !== false).length}**`,
        '',
        '**Useful Commands**',
        '`/achievement setup`',
        '`/achievement tier-set`',
        '`/achievement one-time-config`',
        '`/achievement rename`',
        '`/achievement ignored-channel add`',
        '`/achievement profile`'
      ].join('\n'),
      color: config.enabled === false ? SlickBotColors.MUTED : SlickBotColors.PRIMARY
    });

    const moduleCfg = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'ACHIEVEMENTS' LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const achievementsEnabled = moduleCfg.rows[0]?.enabled ?? (config.enabled !== false);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CustomIds.OnboardingModulePrefix}ACHIEVEMENTS`)
        .setLabel('Quick Setup')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(`${CustomIds.ModuleTogglePrefix}ACHIEVEMENTS`)
        .setLabel(achievementsEnabled ? 'Disable Module' : 'Enable Module')
        .setStyle(achievementsEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(achievementsEnabled ? '⏸️' : '▶️'),
      new ButtonBuilder()
        .setCustomId(CustomIds.AchievementsToggleDm)
        .setLabel(config.dm_enabled ? 'Disable DMs' : 'Enable DMs')
        .setStyle(config.dm_enabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setEmoji('✉️')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomIds.AchievementsRefresh)
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

  async buildListEmbed(guildId) {
    const definitions = await this.listDefinitions(guildId);
    const tiers = await this.listTiers(guildId);
    const grouped = new Map();
    for (const tier of tiers.filter((row) => Number(row.tier_level) <= MAX_STANDARD_TIER_LEVEL && row.enabled !== false)) {
      if (!grouped.has(tier.achievement_key)) grouped.set(tier.achievement_key, []);
      grouped.get(tier.achievement_key).push(tier);
    }
    const embed = createBaseEmbed({
      title: 'Server Achievements',
      description: 'Tiered achievements use Bronze, Silver, Gold, and Diamond. One-time achievements unlock once and can optionally be removed if their condition ends.',
      color: SlickBotColors.INFO,
      footer: 'SlickBot Achievements'
    });
    for (const definition of definitions) {
      if (definition.achievement_type === ACHIEVEMENT_TYPES.ONE_TIME) {
        embed.addFields({
          name: definition.name,
          value: [
            definition.description || 'One-time achievement.',
            `Reward: **+${definition.one_time_xp_reward || 0} XP**${definition.one_time_role_reward_id ? ` · <@&${definition.one_time_role_reward_id}>` : ''}`,
            `Remove if condition ends: **${definition.remove_when_condition_ends ? 'Yes' : 'No'}**`,
            definition.image_url ? 'Custom Image: **Configured**' : null,
            definition.enabled === false ? '**Disabled**' : null
          ].filter(Boolean).join('\n'),
          inline: false
        });
        continue;
      }
      const rows = grouped.get(definition.achievement_key) || [];
      embed.addFields({
        name: definition.name,
        value: rows.map((tier) => `${tier.tier_name || tierName(tier.tier_level)}: ${Number(tier.threshold_value).toLocaleString()} ${ACHIEVEMENT_META[definition.achievement_key]?.unit || ''} · +${tier.xp_reward || 0} XP${tier.role_reward_id ? ` · <@&${tier.role_reward_id}>` : ''}${tier.image_url ? ' 🖼️' : ''}`).join('\n') || 'No active standard tiers configured.',
        inline: false
      });
    }
    return embed;
  }

  async buildLeaderboardEmbed(guildId, achievementKey, limit = 10) {
    const key = normalizeAchievementKey(achievementKey) || ACHIEVEMENT_KEYS.MESSAGES_SENT;
    if (!STAT_COLUMNS[key]) return createWarningEmbed('Leaderboard Unavailable', 'That achievement does not have a numeric leaderboard.');
    const column = STAT_COLUMNS[key];
    const definitions = await this.getDefinitionsMap(guildId);
    const result = await query(
      `SELECT user_id, user_tag, ${column} AS value
       FROM achievement_user_stats
       WHERE guild_id = $1 AND ${column} > 0
       ORDER BY ${column} DESC
       LIMIT $2`,
      [guildId, limit]
    );
    const meta = ACHIEVEMENT_META[key];
    const title = definitions.get(key)?.name || meta.label;
    const lines = result.rows.map((row, index) => `${index + 1}. <@${row.user_id}> — **${formatStatValue(key, Number(row.value || 0))}**`);
    return createBaseEmbed({
      title: `${title} Leaderboard`,
      description: lines.join('\n') || 'No tracked stats yet.',
      color: SlickBotColors.INFO,
      footer: 'SlickBot Achievements'
    });
  }

  async reset({ guildId, scope = 'server', userId = null }) {
    if (scope === 'user' && userId) {
      await query(`DELETE FROM achievement_unlocks WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
      await query(`DELETE FROM achievement_user_stats WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
      await query(`DELETE FROM achievement_voice_sessions WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
      return { scope: 'user' };
    }
    await query(`DELETE FROM achievement_voice_sessions WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM achievement_unlocks WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM achievement_user_stats WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM achievement_ignored_message_channels WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM achievement_tiers WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM achievement_definitions WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM achievement_configs WHERE guild_id = $1`, [guildId]);
    this.invalidateConfig(guildId);
    this.invalidateDefinitions(guildId);
    this.invalidateIgnoredChannels(guildId);
    this.seededGuilds.delete(guildId);
    return { scope: 'server' };
  }
}

module.exports = {
  AchievementService,
  ACHIEVEMENT_KEYS,
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  TIERED_ACHIEVEMENT_KEYS,
  ONE_TIME_ACHIEVEMENT_KEYS,
  STANDARD_TIERS,
  achievementChoiceList,
  tieredAchievementChoiceList,
  oneTimeAchievementChoiceList,
  normalizeAchievementKey,
  DEFAULT_UNLOCK_MESSAGE
};
