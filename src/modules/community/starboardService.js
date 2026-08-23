const { EmbedBuilder } = require('discord.js');
const { query } = require('../../services/db');
const { PermissionService } = require('../permissions/permissionService');
const { ModuleKeys } = require('../moduleRegistry');

const permissions = new PermissionService();

const DEFAULT_STARBOARD_CONFIG = Object.freeze({
  enabled: true,
  channel_id: null,
  star_threshold: 3,
  star_emoji: '⭐',
  allow_self_star: false,
  allow_nsfw: false,
  ignored_channels: [],
  ignored_roles: [],
  color: '#FFA800'
});

const configCache = new Map();

function getStarTier(count, emoji = '⭐') {
  if (emoji !== '⭐') {
    return `${emoji} **${count}**`;
  }
  if (count >= 50) return `🏆 **${count}**`;
  if (count >= 20) return `✨ **${count}**`;
  if (count >= 10) return `💫 **${count}**`;
  if (count >= 5) return `🌟 **${count}**`;
  return `⭐ **${count}**`;
}

function normalizeEmoji(emoji) {
  if (!emoji) return '⭐';
  if (typeof emoji === 'string') return emoji.trim();
  if (emoji.name) return emoji.name;
  return '⭐';
}

function matchStarEmoji(reactionEmoji, configuredEmoji) {
  const normConfig = normalizeEmoji(configuredEmoji);
  if (typeof reactionEmoji === 'string') {
    return reactionEmoji === normConfig;
  }
  if (reactionEmoji.id && normConfig.includes(reactionEmoji.id)) {
    return true;
  }
  if (reactionEmoji.name && (reactionEmoji.name === normConfig || normConfig.includes(reactionEmoji.name))) {
    return true;
  }
  return false;
}

class StarboardService {
  constructor() {
    this.cache = configCache;
  }

  clearAllCaches() {
    this.cache.clear();
  }

  async getConfig(guildId) {
    if (!guildId) return { ...DEFAULT_STARBOARD_CONFIG };
    if (this.cache.has(guildId)) {
      return { ...this.cache.get(guildId) };
    }

    const result = await query(
      `SELECT * FROM starboard_configs WHERE guild_id = $1 LIMIT 1`,
      [guildId]
    );

    if (!result || result.rowCount === 0) {
      const def = { ...DEFAULT_STARBOARD_CONFIG, guild_id: guildId };
      this.cache.set(guildId, def);
      return def;
    }

    const row = result.rows[0];
    const config = {
      guild_id: row.guild_id,
      enabled: row.enabled ?? true,
      channel_id: row.channel_id || null,
      star_threshold: row.star_threshold ?? 3,
      star_emoji: row.star_emoji || '⭐',
      allow_self_star: row.allow_self_star ?? false,
      allow_nsfw: row.allow_nsfw ?? false,
      ignored_channels: Array.isArray(row.ignored_channels) ? row.ignored_channels : [],
      ignored_roles: Array.isArray(row.ignored_roles) ? row.ignored_roles : [],
      color: row.color || '#FFA800',
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    this.cache.set(guildId, config);
    return config;
  }

  async upsertConfig(guildId, updates = {}) {
    if (!guildId) return null;
    const current = await this.getConfig(guildId);
    const updated = {
      ...current,
      ...updates,
      updated_at: new Date()
    };

    await query(
      `INSERT INTO starboard_configs
       (guild_id, enabled, channel_id, star_threshold, star_emoji, allow_self_star, allow_nsfw, ignored_channels, ignored_roles, color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (guild_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         channel_id = EXCLUDED.channel_id,
         star_threshold = EXCLUDED.star_threshold,
         star_emoji = EXCLUDED.star_emoji,
         allow_self_star = EXCLUDED.allow_self_star,
         allow_nsfw = EXCLUDED.allow_nsfw,
         ignored_channels = EXCLUDED.ignored_channels,
         ignored_roles = EXCLUDED.ignored_roles,
         color = EXCLUDED.color,
         updated_at = NOW()`,
      [
        guildId,
        updated.enabled,
        updated.channel_id,
        updated.star_threshold,
        updated.star_emoji,
        updated.allow_self_star,
        updated.allow_nsfw,
        updated.ignored_channels,
        updated.ignored_roles,
        updated.color
      ]
    );

    this.cache.set(guildId, updated);
    return updated;
  }

  async resetConfig(guildId) {
    if (!guildId) return;
    await query(`DELETE FROM starboard_configs WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM starboard_entries WHERE guild_id = $1`, [guildId]);
    this.cache.delete(guildId);
    return { ...DEFAULT_STARBOARD_CONFIG, guild_id: guildId };
  }

  buildStarboardMessagePayload(message, starCount, config) {
    const starTier = getStarTier(starCount, config.star_emoji || '⭐');
    const channelMention = `<#${message.channelId || message.channel?.id}>`;
    const jumpLink = `https://discord.com/channels/${message.guildId || message.guild?.id}/${message.channelId || message.channel?.id}/${message.id}`;

    const authorUser = message.author || message.user;
    const authorTag = authorUser?.tag || authorUser?.username || 'Unknown Author';
    const authorAvatar = authorUser?.displayAvatarURL ? authorUser.displayAvatarURL({ dynamic: true }) : null;

    const embed = new EmbedBuilder()
      .setColor(config.color || '#FFA800')
      .setAuthor({
        name: authorTag,
        iconURL: authorAvatar || undefined
      })
      .setDescription(message.content ? message.content.slice(0, 4000) : (message.attachments?.size > 0 ? '*[Attachment Only]*' : '*[No Text Content]*'))
      .addFields({
        name: 'Original Message',
        value: `[Jump to message](${jumpLink}) in ${channelMention}`,
        inline: false
      })
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp(message.createdAt || new Date());

    let attachments = [];
    if (message.attachments) {
      if (typeof message.attachments.values === 'function') {
        attachments = Array.from(message.attachments.values());
      } else if (Array.isArray(message.attachments)) {
        attachments = message.attachments;
      }
    }

    const imageAttachment = attachments.find((att) => {
      const url = att.url || att.proxyURL || '';
      const name = att.name || '';
      const contentType = att.contentType || '';
      return contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name) || /\.(png|jpe?g|gif|webp)$/i.test(url);
    });

    if (imageAttachment) {
      embed.setImage(imageAttachment.url || imageAttachment.proxyURL);
    }

    return {
      content: `${starTier} ${channelMention}`,
      embeds: [embed]
    };
  }

  async countQualifyingStars(reaction, config) {
    const message = reaction.message;
    if (!message) return 0;

    let users = [];
    try {
      if (reaction.users?.fetch) {
        const fetched = await reaction.users.fetch();
        users = Array.from(fetched.values());
      } else if (reaction.users?.cache) {
        users = Array.from(reaction.users.cache.values());
      }
    } catch {
      return reaction.count || 0;
    }

    const authorId = message.author?.id;
    const qualifyingUsers = users.filter((user) => {
      if (user.bot) return false;
      if (!config.allow_self_star && authorId && user.id === authorId) return false;
      return true;
    });

    return qualifyingUsers.length;
  }

  async handleReactionAdd(reaction, user, client, logger) {
    if (!reaction || !user || user.bot) return;

    // Resolve partials if necessary
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message?.partial) await reaction.message.fetch();
    } catch {
      return;
    }

    const message = reaction.message;
    if (!message || !message.guild) return;
    const guild = message.guild;

    const enabled = await permissions.isModuleEnabled(guild.id, ModuleKeys.STARBOARD);
    if (!enabled) return;

    const config = await this.getConfig(guild.id);
    if (!config.enabled || !config.channel_id) return;

    // 1. Emoji check
    if (!matchStarEmoji(reaction.emoji, config.star_emoji)) return;

    // 2. Channel exclusions
    if (message.channelId === config.channel_id) return; // Don't starboard starboard channel
    if (config.ignored_channels?.includes(message.channelId)) return;

    // 3. NSFW channel check
    if (!config.allow_nsfw && message.channel?.nsfw) return;

    // 4. Role exclusions
    if (config.ignored_roles?.length > 0) {
      const member = guild.members?.cache?.get(user.id) || await guild.members?.fetch(user.id).catch(() => null);
      if (member && member.roles?.cache?.some((r) => config.ignored_roles.includes(r.id))) {
        return;
      }
    }

    // 5. Count qualifying stars
    const starCount = await this.countQualifyingStars(reaction, config);
    if (starCount < config.star_threshold) return;

    const starboardChannel = guild.channels?.cache?.get(config.channel_id) || await guild.channels?.fetch(config.channel_id).catch(() => null);
    if (!starboardChannel || !starboardChannel.isTextBased?.()) return;

    // 6. Check existing starboard entry
    const entryRes = await query(
      `SELECT * FROM starboard_entries WHERE guild_id = $1 AND original_message_id = $2 LIMIT 1`,
      [guild.id, message.id]
    );

    const payload = this.buildStarboardMessagePayload(message, starCount, config);

    if (entryRes && entryRes.rowCount > 0) {
      const entry = entryRes.rows[0];
      // Update existing message in starboard channel
      if (entry.starboard_message_id) {
        try {
          const starboardMsg = await starboardChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
          if (starboardMsg) {
            await starboardMsg.edit(payload);
          }
        } catch {}
      }

      await query(
        `UPDATE starboard_entries
         SET star_count = $1, updated_at = NOW()
         WHERE id = $2`,
        [starCount, entry.id]
      );
    } else {
      // Post new starboard message
      let postedMsg = null;
      try {
        postedMsg = await starboardChannel.send(payload);
      } catch (err) {
        logger?.log?.({
          guildId: guild.id,
          eventKey: 'starboard-error',
          title: 'Starboard Post Failed',
          body: `Failed to post message to starboard channel: ${err.message}`
        }).catch(() => {});
        return;
      }

      let attUrls = [];
      if (message.attachments) {
        const attList = typeof message.attachments.values === 'function' ? Array.from(message.attachments.values()) : message.attachments;
        attUrls = attList.map((a) => a.url || a.proxyURL).filter(Boolean);
      }

      await query(
        `INSERT INTO starboard_entries
         (guild_id, original_channel_id, original_message_id, starboard_message_id, author_user_id, author_tag, star_count, content, attachments, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (guild_id, original_message_id) DO UPDATE SET
           starboard_message_id = EXCLUDED.starboard_message_id,
           star_count = EXCLUDED.star_count,
           updated_at = NOW()`,
        [
          guild.id,
          message.channelId,
          message.id,
          postedMsg?.id || null,
          message.author?.id || 'unknown',
          message.author?.tag || message.author?.username || 'unknown',
          starCount,
          message.content || '',
          attUrls
        ]
      );

      logger?.log?.({
        guildId: guild.id,
        eventKey: 'starboard-pinned',
        title: '⭐ Message Starred to Hall of Fame',
        body: `Message by **${message.author?.tag || message.author?.id}** reached **${starCount}** stars in <#${message.channelId}> and was showcased in <#${config.channel_id}>.`,
        targetUserId: message.author?.id
      }).catch(() => {});
    }
  }

  async handleReactionRemove(reaction, user, client, logger) {
    if (!reaction || !user || user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message?.partial) await reaction.message.fetch();
    } catch {
      return;
    }

    const message = reaction.message;
    if (!message || !message.guild) return;
    const guild = message.guild;

    const enabled = await permissions.isModuleEnabled(guild.id, ModuleKeys.STARBOARD);
    if (!enabled) return;

    const config = await this.getConfig(guild.id);
    if (!config.enabled || !config.channel_id) return;

    if (!matchStarEmoji(reaction.emoji, config.star_emoji)) return;

    const starCount = await this.countQualifyingStars(reaction, config);

    const entryRes = await query(
      `SELECT * FROM starboard_entries WHERE guild_id = $1 AND original_message_id = $2 LIMIT 1`,
      [guild.id, message.id]
    );

    if (!entryRes || entryRes.rowCount === 0) return;
    const entry = entryRes.rows[0];

    const starboardChannel = guild.channels?.cache?.get(config.channel_id) || await guild.channels?.fetch(config.channel_id).catch(() => null);

    if (starCount < config.star_threshold) {
      // Star dropped below threshold -> delete starboard post or update
      if (entry.starboard_message_id && starboardChannel) {
        try {
          const starboardMsg = await starboardChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
          if (starboardMsg) {
            await starboardMsg.delete().catch(() => {});
          }
        } catch {}
      }
      await query(`DELETE FROM starboard_entries WHERE id = $1`, [entry.id]);
    } else {
      if (entry.starboard_message_id && starboardChannel) {
        try {
          const starboardMsg = await starboardChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
          if (starboardMsg) {
            const payload = this.buildStarboardMessagePayload(message, starCount, config);
            await starboardMsg.edit(payload);
          }
        } catch {}
      }
      await query(`UPDATE starboard_entries SET star_count = $1, updated_at = NOW() WHERE id = $2`, [starCount, entry.id]);
    }
  }

  async handleMessageDelete(message, client, logger) {
    if (!message || !message.guild) return;
    const guild = message.guild;

    const config = await this.getConfig(guild.id);
    if (!config.channel_id) return;

    const entryRes = await query(
      `SELECT * FROM starboard_entries WHERE guild_id = $1 AND (original_message_id = $2 OR starboard_message_id = $2) LIMIT 1`,
      [guild.id, message.id]
    );

    if (!entryRes || entryRes.rowCount === 0) return;
    const entry = entryRes.rows[0];

    if (message.id === entry.original_message_id && entry.starboard_message_id) {
      const starboardChannel = guild.channels?.cache?.get(config.channel_id) || await guild.channels?.fetch(config.channel_id).catch(() => null);
      if (starboardChannel) {
        try {
          const starboardMsg = await starboardChannel.messages.fetch(entry.starboard_message_id).catch(() => null);
          if (starboardMsg) await starboardMsg.delete().catch(() => {});
        } catch {}
      }
    }

    await query(`DELETE FROM starboard_entries WHERE id = $1`, [entry.id]);
  }

  async getTopMessages(guildId, limit = 10) {
    if (!guildId) return [];
    try {
      const result = await query(
        `SELECT * FROM starboard_entries
         WHERE guild_id = $1
         ORDER BY star_count DESC, created_at DESC
         LIMIT $2`,
        [guildId, limit]
      );
      return result?.rows || [];
    } catch {
      return [];
    }
  }

  async getTopAuthors(guildId, limit = 10) {
    if (!guildId) return [];
    try {
      const result = await query(
        `SELECT author_user_id, author_tag, SUM(star_count)::int as total_stars, COUNT(*)::int as post_count
         FROM starboard_entries
         WHERE guild_id = $1
         GROUP BY author_user_id, author_tag
         ORDER BY total_stars DESC, post_count DESC
         LIMIT $2`,
        [guildId, limit]
      );
      return result?.rows || [];
    } catch {
      return [];
    }
  }
}

module.exports = {
  StarboardService,
  DEFAULT_STARBOARD_CONFIG,
  getStarTier,
  normalizeEmoji,
  matchStarEmoji
};
