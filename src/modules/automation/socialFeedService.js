const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { env } = require('../../config/env');

const PLATFORM_KEYS = Object.freeze({
  TWITCH: 'TWITCH',
  YOUTUBE: 'YOUTUBE'
});

const PLATFORM_META = Object.freeze({
  [PLATFORM_KEYS.TWITCH]: {
    key: PLATFORM_KEYS.TWITCH,
    label: 'Twitch',
    color: 0x9146FF,
    icon: '🟣',
    emoji: '🎮',
    defaultUrl: (handle) => `https://twitch.tv/${handle}`,
    supportsLive: true
  },
  [PLATFORM_KEYS.YOUTUBE]: {
    key: PLATFORM_KEYS.YOUTUBE,
    label: 'YouTube',
    color: 0xFF0000,
    icon: '🔴',
    emoji: '▶️',
    defaultUrl: (handle) => handle.startsWith('UC') ? `https://youtube.com/channel/${handle}` : `https://youtube.com/@${handle.replace(/^@/, '')}`,
    supportsShorts: true
  }
});

const DEFAULT_TEMPLATES = Object.freeze({
  TWITCH_LIVE: '🔴 **{author}** is now LIVE on Twitch playing **{game}**!\n**{title}**\n{url}',
  TWITCH_OFFLINE: '⚫ **{author}** has ended their stream. Streamed for **{duration}**.',
  YOUTUBE_VIDEO: '📹 **{author}** posted a new YouTube video!\n**{title}**\n{url}',
  YOUTUBE_SHORTS: '⚡ **{author}** uploaded a new YouTube Short!\n**{title}**\n{url}'
});

function normalizePlatform(input) {
  const raw = String(input || '').trim().toUpperCase();
  if (Object.values(PLATFORM_KEYS).includes(raw)) return raw;
  return null;
}

function normalizeAccountId(platform, rawInput) {
  let val = String(rawInput || '').trim();
  if (!val) return '';

  // Strip URLs if full profile/channel link provided
  val = val.replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '');
  val = val.replace(/^https?:\/\/(www\.)?youtube\.com\/(@|channel\/|user\/|c\/)?/i, '');
  val = val.replace(/[/?#].*$/, '').trim();

  // Strip leading @ for TikTok / YouTube handles unless UC channel ID
  if (platform !== PLATFORM_KEYS.YOUTUBE || !val.startsWith('UC')) {
    val = val.replace(/^@+/, '');
  }

  return val.toLowerCase();
}

function formatStreamDuration(startedAtLike, endedAtLike = new Date()) {
  const start = new Date(startedAtLike).getTime();
  const end = new Date(endedAtLike).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 'Less than a minute';
  }

  const diffSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr${hours === 1 ? '' : 's'}${minutes > 0 ? `, ${minutes} min${minutes === 1 ? '' : 's'}` : ''}`;
  }
  return `${Math.max(1, minutes)} min${minutes === 1 ? '' : 's'}`;
}

function applyFeedPlaceholders(template, data = {}) {
  let text = String(template || '');
  const author = data.authorName || data.accountName || 'Creator';
  const roleMention = data.pingRoleId ? `<@&${data.pingRoleId}>` : '';
  const title = data.title || '';
  const url = data.url || data.link || '';
  const platform = data.platformLabel || data.platform || 'Social';
  const game = data.gameName || 'General';
  const duration = data.duration || '';
  const itemType = data.itemType || 'Update';

  text = text.replaceAll('{author}', author);
  text = text.replaceAll('{channel}', author);
  text = text.replaceAll('{user}', author);
  text = text.replaceAll('{title}', title);
  text = text.replaceAll('{caption}', title);
  text = text.replaceAll('{url}', url);
  text = text.replaceAll('{link}', url);
  text = text.replaceAll('{platform}', platform);
  text = text.replaceAll('{game}', game);
  text = text.replaceAll('{category}', game);
  text = text.replaceAll('{duration}', duration);
  text = text.replaceAll('{type}', itemType);
  text = text.replaceAll('{role}', roleMention);

  return text.trim();
}

function classifyYouTubeVideo(title = '', description = '', url = '', durationSeconds = null) {
  const text = `${title} ${description} ${url}`.toLowerCase();
  if (text.includes('#shorts') || text.includes('#short') || text.includes('/shorts/')) {
    return 'SHORT';
  }
  if (typeof durationSeconds === 'number' && durationSeconds > 0 && durationSeconds <= 60) {
    return 'SHORT';
  }
  return 'VIDEO';
}

class SocialFeedService {
  constructor() {
    this.configCache = new Map();
    this.tokenCache = new Map();
  }

  async getConfig(guildId) {
    if (this.configCache.has(guildId)) return this.configCache.get(guildId);
    const result = await query(`SELECT * FROM social_feed_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) {
      this.configCache.set(guildId, result.rows[0]);
      return result.rows[0];
    }
    const created = await query(
      `INSERT INTO social_feed_configs (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    this.configCache.set(guildId, created.rows[0]);
    return created.rows[0];
  }

  async updateConfig(guildId, input = {}) {
    const current = await this.getConfig(guildId);
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : current.enabled;
    const defaultChannelId = input.defaultChannelId !== undefined ? input.defaultChannelId : current.default_channel_id;
    const defaultPingRoleId = input.defaultPingRoleId !== undefined ? input.defaultPingRoleId : current.default_ping_role_id;
    const checkIntervalSeconds = input.checkIntervalSeconds ? Math.max(30, Number(input.checkIntervalSeconds)) : current.check_interval_seconds || 120;

    const result = await query(
      `INSERT INTO social_feed_configs (guild_id, enabled, default_channel_id, default_ping_role_id, check_interval_seconds)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         default_channel_id = EXCLUDED.default_channel_id,
         default_ping_role_id = EXCLUDED.default_ping_role_id,
         check_interval_seconds = EXCLUDED.check_interval_seconds,
         updated_at = NOW()
       RETURNING *`,
      [guildId, enabled, defaultChannelId, defaultPingRoleId, checkIntervalSeconds]
    );
    this.configCache.set(guildId, result.rows[0]);
    return result.rows[0];
  }

  async addFeed({
    guildId,
    platform,
    account,
    channelId,
    pingRoleId = null,
    customMessage = null,
    shortsMessage = null,
    videoMessage = null,
    liveMessage = null,
    storyMessage = null,
    offlineMessage = null
  }) {
    const normalizedPlatform = normalizePlatform(platform);
    if (!normalizedPlatform) {
      return { ok: false, reason: 'Invalid platform. Supported platforms: Twitch, YouTube.' };
    }

    const normalizedAccount = normalizeAccountId(normalizedPlatform, account);
    if (!normalizedAccount) {
      return { ok: false, reason: 'Please provide a valid account username or channel ID.' };
    }

    const meta = PLATFORM_META[normalizedPlatform];
    const accountUrl = meta.defaultUrl(normalizedAccount);
    const displayAccountName = String(account).trim().replace(/^@+/, '');

    const result = await query(
      `INSERT INTO social_feeds (
         guild_id, platform, account_id, account_name, account_url, channel_id, ping_role_id,
         custom_message, shorts_message, video_message, live_message, story_message, offline_message,
         enabled, last_status, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, 'OFFLINE', NOW(), NOW())
       ON CONFLICT (guild_id, platform, account_id) DO UPDATE SET
         account_name = EXCLUDED.account_name,
         account_url = EXCLUDED.account_url,
         channel_id = EXCLUDED.channel_id,
         ping_role_id = COALESCE(EXCLUDED.ping_role_id, social_feeds.ping_role_id),
         custom_message = COALESCE(EXCLUDED.custom_message, social_feeds.custom_message),
         shorts_message = COALESCE(EXCLUDED.shorts_message, social_feeds.shorts_message),
         video_message = COALESCE(EXCLUDED.video_message, social_feeds.video_message),
         live_message = COALESCE(EXCLUDED.live_message, social_feeds.live_message),
         story_message = COALESCE(EXCLUDED.story_message, social_feeds.story_message),
         offline_message = COALESCE(EXCLUDED.offline_message, social_feeds.offline_message),
         enabled = true,
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        normalizedPlatform,
        normalizedAccount,
        displayAccountName,
        accountUrl,
        channelId,
        pingRoleId,
        customMessage,
        shortsMessage,
        videoMessage,
        liveMessage,
        storyMessage,
        offlineMessage
      ]
    );

    return { ok: true, feed: result.rows[0] };
  }

  async removeFeed(guildId, feedId) {
    const result = await query(
      `DELETE FROM social_feeds
       WHERE guild_id = $1 AND (id = $2 OR account_id = $2 OR LOWER(account_name) = LOWER($2))
       RETURNING *`,
      [guildId, feedId]
    );
    return result.rows[0] || null;
  }

  async editFeed(guildId, feedId, updates = {}) {
    const feed = await this.getFeed(guildId, feedId);
    if (!feed) return null;

    const channelId = updates.channelId !== undefined ? updates.channelId : feed.channel_id;
    const pingRoleId = updates.clearPingRole ? null : updates.pingRoleId !== undefined ? updates.pingRoleId : feed.ping_role_id;
    const customMessage = updates.customMessage !== undefined ? updates.customMessage : feed.custom_message;
    const shortsMessage = updates.shortsMessage !== undefined ? updates.shortsMessage : feed.shorts_message;
    const videoMessage = updates.videoMessage !== undefined ? updates.videoMessage : feed.video_message;
    const liveMessage = updates.liveMessage !== undefined ? updates.liveMessage : feed.live_message;
    const storyMessage = updates.storyMessage !== undefined ? updates.storyMessage : feed.story_message;
    const offlineMessage = updates.offlineMessage !== undefined ? updates.offlineMessage : feed.offline_message;
    const enabled = typeof updates.enabled === 'boolean' ? updates.enabled : feed.enabled;

    const result = await query(
      `UPDATE social_feeds
       SET channel_id = $3,
           ping_role_id = $4,
           custom_message = $5,
           shorts_message = $6,
           video_message = $7,
           live_message = $8,
           story_message = $9,
           offline_message = $10,
           enabled = $11,
           updated_at = NOW()
       WHERE guild_id = $1 AND id = $2
       RETURNING *`,
      [
        guildId,
        feed.id,
        channelId,
        pingRoleId,
        customMessage,
        shortsMessage,
        videoMessage,
        liveMessage,
        storyMessage,
        offlineMessage,
        enabled
      ]
    );
    return result.rows[0] || null;
  }

  async getFeed(guildId, feedId) {
    const result = await query(
      `SELECT * FROM social_feeds
       WHERE guild_id = $1 AND (id = $2 OR account_id = $2 OR LOWER(account_name) = LOWER($2))
       LIMIT 1`,
      [guildId, feedId]
    );
    return result.rows[0] || null;
  }

  async listFeeds(guildId, platform = null) {
    let sql = `SELECT * FROM social_feeds WHERE guild_id = $1`;
    const params = [guildId];
    if (platform) {
      const normalized = normalizePlatform(platform);
      if (normalized) {
        sql += ` AND platform = $2`;
        params.push(normalized);
      }
    }
    sql += ` ORDER BY platform ASC, account_name ASC`;
    const result = await query(sql, params);
    return result.rows;
  }

  async resetModule(guildId) {
    const [configBefore, feedsBefore, historyBefore] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM social_feed_configs WHERE guild_id = $1`, [guildId]),
      query(`SELECT COUNT(*)::int AS count FROM social_feeds WHERE guild_id = $1`, [guildId]),
      query(`SELECT COUNT(*)::int AS count FROM social_feed_posts_history WHERE guild_id = $1`, [guildId])
    ]);

    await query(`DELETE FROM social_feeds WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM social_feed_configs WHERE guild_id = $1`, [guildId]);
    this.configCache.delete(guildId);

    return {
      ok: true,
      before: {
        configs: configBefore.rows[0]?.count || 0,
        feeds: feedsBefore.rows[0]?.count || 0,
        history: historyBefore.rows[0]?.count || 0
      }
    };
  }

  // --- Platform Fetchers / Providers ---

  async fetchTwitchStream(feed) {
    const handle = feed.account_id;
    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;

    if (clientId && clientSecret) {
      try {
        const token = await this.getTwitchAppToken(clientId, clientSecret);
        if (token) {
          const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(handle)}`, {
            headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const stream = data.data?.[0];
            if (stream) {
              return {
                isLive: true,
                streamId: stream.id,
                title: stream.title || 'Live Stream',
                gameName: stream.game_name || 'General',
                viewerCount: stream.viewer_count || 0,
                startedAt: stream.started_at ? new Date(stream.started_at) : new Date(),
                thumbnailUrl: (stream.thumbnail_url || '').replace('{width}', '1280').replace('{height}', '720'),
                streamUrl: `https://twitch.tv/${handle}`,
                authorName: stream.user_name || feed.account_name
              };
            }
          }
        }
      } catch (err) {
        // Fallback
      }
    }

    return {
      isLive: false,
      streamUrl: `https://twitch.tv/${handle}`,
      authorName: feed.account_name
    };
  }

  async getTwitchAppToken(clientId, clientSecret) {
    const cached = this.tokenCache.get('twitch');
    if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
    try {
      const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        this.tokenCache.set('twitch', { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 });
        return data.access_token;
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  async fetchYouTubeUpdates(feed) {
    const handleOrId = feed.account_id;
    const isChannelId = handleOrId.startsWith('UC') && handleOrId.length >= 20;
    const url = isChannelId
      ? `https://www.youtube.com/feeds/videos.xml?channel_id=${handleOrId}`
      : `https://www.youtube.com/feeds/videos.xml?user=${handleOrId}`;

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SlickBot/0.9.5)' } });
      if (res.ok) {
        const xml = await res.text();
        const entries = this.parseYouTubeRss(xml);
        return entries;
      }
    } catch (_err) {
      // Return empty array on network / parsing fallback
    }
    return [];
  }

  parseYouTubeRss(xml) {
    const items = [];
    const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
    for (const match of entryMatches) {
      const entryXml = match[1];
      const idMatch = entryXml.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || entryXml.match(/<id>.*?video:(.*?)<\/id>/);
      const titleMatch = entryXml.match(/<title>(.*?)<\/title>/);
      const authorMatch = entryXml.match(/<name>(.*?)<\/name>/);
      const linkMatch = entryXml.match(/<link rel="alternate" href="(.*?)"\/>/);
      const publishedMatch = entryXml.match(/<published>(.*?)<\/published>/);
      const mediaDescMatch = entryXml.match(/<media:description>([\s\S]*?)<\/media:description>/);

      if (idMatch && titleMatch) {
        const videoId = idMatch[1].trim();
        const title = titleMatch[1].trim();
        const author = authorMatch ? authorMatch[1].trim() : 'YouTube Creator';
        const link = linkMatch ? linkMatch[1].trim() : `https://www.youtube.com/watch?v=${videoId}`;
        const desc = mediaDescMatch ? mediaDescMatch[1].trim() : '';
        const publishedAt = publishedMatch ? new Date(publishedMatch[1].trim()) : new Date();
        const itemType = classifyYouTubeVideo(title, desc, link);

        items.push({
          itemId: videoId,
          title,
          url: link,
          authorName: author,
          publishedAt,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          itemType,
          description: desc.slice(0, 300)
        });
      }
    }
    return items;
  }

  // --- Announcement & Message Editing Engine ---

  async sendAnnouncement(client, feed, updateData, logger) {
    const guild = client.guilds.cache.get(feed.guild_id);
    if (!guild) return { ok: false, reason: 'Guild not in cache' };

    const channel = guild.channels.cache.get(feed.channel_id) || await guild.channels.fetch(feed.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return { ok: false, reason: `Target channel ${feed.channel_id} is missing or not text-based` };
    }

    const platformMeta = PLATFORM_META[feed.platform] || { label: feed.platform, color: SlickBotColors.PRIMARY };
    const pingRole = feed.ping_role_id ? `<@&${feed.ping_role_id}>` : '';

    let template = feed.custom_message;
    if (updateData.itemType === 'SHORT' && feed.shorts_message) {
      template = feed.shorts_message;
    } else if (updateData.itemType === 'SHORT' && !template) {
      template = DEFAULT_TEMPLATES.YOUTUBE_SHORTS;
    } else if (updateData.itemType === 'VIDEO' && feed.video_message) {
      template = feed.video_message;
    } else if (updateData.itemType === 'VIDEO' && !template) {
      template = DEFAULT_TEMPLATES.YOUTUBE_VIDEO;
    } else if (updateData.itemType === 'LIVE' && feed.live_message) {
      template = feed.live_message;
    } else if (updateData.itemType === 'LIVE' && !template) {
      template = DEFAULT_TEMPLATES.TWITCH_LIVE;
    } else if (!template) {
      template = `{author} posted a new update on {platform}!\n{url}`;
    }

    const messageContent = applyFeedPlaceholders(template, {
      authorName: updateData.authorName || feed.account_name,
      accountName: feed.account_name,
      pingRoleId: feed.ping_role_id,
      title: updateData.title,
      url: updateData.url,
      platform: platformMeta.label,
      platformLabel: platformMeta.label,
      gameName: updateData.gameName,
      itemType: updateData.itemType,
      duration: updateData.duration
    });

    const isLive = updateData.itemType === 'LIVE';
    const embed = new EmbedBuilder()
      .setColor(platformMeta.color || SlickBotColors.PRIMARY)
      .setAuthor({ name: `${updateData.authorName || feed.account_name} (${platformMeta.label})`, url: updateData.url, iconURL: updateData.avatarUrl || undefined })
      .setTitle(updateData.title ? updateData.title.slice(0, 256) : `${updateData.authorName || feed.account_name} on ${platformMeta.label}`)
      .setURL(updateData.url)
      .setTimestamp(updateData.publishedAt || new Date())
      .setFooter({ text: `SlickBot Social Feeds · ${platformMeta.label}` });

    if (updateData.description) {
      embed.setDescription(updateData.description.slice(0, 1000));
    }

    if (isLive) {
      embed.addFields(
        { name: 'Status', value: '🔴 **LIVE NOW**', inline: true },
        { name: 'Game / Category', value: updateData.gameName || 'General', inline: true }
      );
      if (updateData.viewerCount !== undefined) {
        embed.addFields({ name: 'Viewers', value: String(updateData.viewerCount), inline: true });
      }
    }

    if (updateData.thumbnailUrl) {
      embed.setImage(updateData.thumbnailUrl);
    }

    const payload = {
      content: pingRole ? `${pingRole} ${messageContent}`.trim() : messageContent,
      embeds: [embed]
    };

    const sentMessage = await channel.send(payload).catch((err) => {
      if (logger) {
        logger.log({
          guildId: feed.guild_id,
          eventKey: 'social-feed-error',
          title: 'Social Feed Announcement Failed',
          body: `Could not send announcement in <#${feed.channel_id}> for ${feed.account_name} (${feed.platform}): ${err.message}`,
          metadata: { feedId: feed.id, error: err.message }
        }).catch(() => {});
      }
      return null;
    });

    if (!sentMessage) return { ok: false, reason: 'Failed to send message to Discord channel' };

    // Record in history
    await query(
      `INSERT INTO social_feed_posts_history (guild_id, feed_id, platform, item_id, item_type, title, url, message_id, channel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (feed_id, item_id, item_type) DO UPDATE SET message_id = EXCLUDED.message_id, created_at = NOW()`,
      [feed.guild_id, feed.id, feed.platform, updateData.itemId || `post-${Date.now()}`, updateData.itemType, updateData.title || null, updateData.url || null, sentMessage.id, channel.id]
    );

    // Update feed row with live state or last item
    if (isLive) {
      await query(
        `UPDATE social_feeds
         SET last_status = 'LIVE',
             last_announcement_message_id = $2,
             last_announcement_channel_id = $3,
             live_started_at = $4,
             last_item_id = $5,
             last_checked_at = NOW(),
             last_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [feed.id, sentMessage.id, channel.id, (updateData.startedAt || new Date()).toISOString(), updateData.itemId || updateData.streamId || 'live']
      );
    } else {
      await query(
        `UPDATE social_feeds
         SET last_item_id = $2,
             last_checked_at = NOW(),
             last_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [feed.id, updateData.itemId || 'item']
      );
    }

    if (logger) {
      await logger.log({
        guildId: feed.guild_id,
        eventKey: 'social-feed-announced',
        title: `${platformMeta.label} Announcement Sent`,
        body: `Posted announcement for **${feed.account_name}** in <#${channel.id}>.\nType: \`${updateData.itemType}\`\n[View Post](${updateData.url})`,
        metadata: { feedId: feed.id, platform: feed.platform, account: feed.account_name, url: updateData.url }
      }).catch(() => {});
    }

    return { ok: true, messageId: sentMessage.id };
  }

  async handleStreamOffline(client, feed, logger) {
    if (feed.last_status !== 'LIVE' || !feed.last_announcement_message_id || !feed.last_announcement_channel_id) {
      return;
    }

    const durationText = formatStreamDuration(feed.live_started_at, new Date());
    const endedAt = new Date();
    const platformMeta = PLATFORM_META[feed.platform] || { label: feed.platform };

    const guild = client.guilds.cache.get(feed.guild_id);
    if (guild) {
      const channel = guild.channels.cache.get(feed.last_announcement_channel_id) || await guild.channels.fetch(feed.last_announcement_channel_id).catch(() => null);
      if (channel && channel.isTextBased()) {
        const message = await channel.messages.fetch(feed.last_announcement_message_id).catch(() => null);
        if (message) {
          const offlineTemplate = feed.offline_message || DEFAULT_TEMPLATES.TWITCH_OFFLINE;
          const offlineText = applyFeedPlaceholders(offlineTemplate, {
            authorName: feed.account_name,
            accountName: feed.account_name,
            platform: platformMeta.label,
            url: feed.account_url || platformMeta.defaultUrl(feed.account_id),
            duration: durationText
          });

          const embed = new EmbedBuilder()
            .setColor(SlickBotColors.MUTED || 0x72767D)
            .setAuthor({ name: `${feed.account_name} (${platformMeta.label})`, url: feed.account_url || platformMeta.defaultUrl(feed.account_id) })
            .setTitle(`⚫ Stream Ended: ${feed.account_name}`)
            .setURL(feed.account_url || platformMeta.defaultUrl(feed.account_id))
            .setDescription(`**${feed.account_name}** is now offline.\n${offlineText}`)
            .addFields(
              { name: 'Stream Duration', value: `⏱️ **${durationText}**`, inline: true },
              { name: 'Started At', value: feed.live_started_at ? `<t:${Math.floor(new Date(feed.live_started_at).getTime() / 1000)}:t>` : 'Unknown', inline: true },
              { name: 'Ended At', value: `<t:${Math.floor(endedAt.getTime() / 1000)}:t>`, inline: true }
            )
            .setTimestamp(endedAt)
            .setFooter({ text: `SlickBot Social Feeds · Stream Ended` });

          await message.edit({ embeds: [embed] }).catch(() => {});
        }
      }
    }

    await query(
      `UPDATE social_feeds
       SET last_status = 'OFFLINE',
           last_announcement_message_id = NULL,
           last_announcement_channel_id = NULL,
           last_checked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [feed.id]
    );

    if (logger) {
      await logger.log({
        guildId: feed.guild_id,
        eventKey: 'social-feed-offline',
        title: `${feed.account_name} Stream Ended`,
        body: `Live stream ended for **${feed.account_name}** (${platformMeta.label}).\nDuration: **${durationText}**`,
        metadata: { feedId: feed.id, platform: feed.platform, duration: durationText }
      }).catch(() => {});
    }
  }

  async testFeedAnnouncement(client, feed, customType = null, logger = null) {
    const platform = feed.platform;
    const type = customType || (platform === PLATFORM_KEYS.TWITCH ? 'LIVE' : 'VIDEO');
    const meta = PLATFORM_META[platform] || { label: platform };

    const mockData = {
      itemId: `test-${Date.now()}`,
      itemType: type,
      authorName: feed.account_name,
      title: type === 'SHORT'
        ? `🔥 Epic ${feed.account_name} Short #shorts`
        : type === 'LIVE'
          ? `Playing exciting games with the community! [TEST]`
          : `Amazing new ${meta.label} upload by ${feed.account_name} [TEST]`,
      url: feed.account_url || meta.defaultUrl(feed.account_id),
      description: `This is a test announcement to verify channel permissions, embed styling, and role pings for ${feed.account_name}.`,
      gameName: 'Just Chatting',
      viewerCount: 1420,
      startedAt: new Date(Date.now() - 3600000), // 1 hour ago
      duration: '1 hr, 15 mins',
      publishedAt: new Date()
    };

    return this.sendAnnouncement(client, feed, mockData, logger);
  }

  async checkGuildFeeds(guildId, client, logger) {
    const config = await this.getConfig(guildId);
    if (!config.enabled) return { checked: 0, announced: 0, results: [] };

    const feeds = await this.listFeeds(guildId);
    const activeFeeds = feeds.filter((f) => f.enabled);
    let announcedCount = 0;
    const results = [];

    for (const feed of activeFeeds) {
      let feedAnnounced = 0;
      let statusNote = 'No new updates';

      try {
        if (feed.platform === PLATFORM_KEYS.TWITCH) {
          const status = await this.fetchTwitchStream(feed);
          if (status.isLive && feed.last_status !== 'LIVE') {
            const res = await this.sendAnnouncement(client, feed, {
              itemId: status.streamId || `stream-${Date.now()}`,
              itemType: 'LIVE',
              authorName: status.authorName || feed.account_name,
              title: status.title,
              url: status.streamUrl,
              gameName: status.gameName,
              viewerCount: status.viewerCount,
              startedAt: status.startedAt,
              thumbnailUrl: status.thumbnailUrl
            }, logger);
            if (res.ok) {
              announcedCount++;
              feedAnnounced++;
              statusNote = '🔴 Announced LIVE stream';
            }
          } else if (!status.isLive && feed.last_status === 'LIVE') {
            await this.handleStreamOffline(client, feed, logger);
            statusNote = '⚫ Stream ended / updated offline';
          } else {
            statusNote = status.isLive ? 'Currently live (already announced)' : 'Stream is offline';
          }
        } else if (feed.platform === PLATFORM_KEYS.YOUTUBE) {
          const updates = await this.fetchYouTubeUpdates(feed);
          for (const item of updates.slice(0, 3)) {
            const exists = await query(
              `SELECT id FROM social_feed_posts_history WHERE feed_id = $1 AND item_id = $2 LIMIT 1`,
              [feed.id, item.itemId]
            );
            if (!exists.rows[0]) {
              const res = await this.sendAnnouncement(client, feed, item, logger);
              if (res.ok) {
                announcedCount++;
                feedAnnounced++;
              }
            }
          }
          statusNote = feedAnnounced > 0 ? `Announced ${feedAnnounced} new upload(s)` : (updates.length ? 'Up to date' : 'No uploads found');
        }

        await query(`UPDATE social_feeds SET last_checked_at = NOW(), last_error = NULL WHERE id = $1`, [feed.id]);
        results.push({ feed, ok: true, note: statusNote, announced: feedAnnounced });
      } catch (err) {
        await query(`UPDATE social_feeds SET last_error = $2, last_checked_at = NOW() WHERE id = $1`, [feed.id, err.message]);
        results.push({ feed, ok: false, note: `Error: ${err.message}`, announced: 0 });
      }
    }

    return { checked: activeFeeds.length, announced: announcedCount, results };
  }

  async processFeeds(client, logger) {
    for (const guild of client.guilds.cache.values()) {
      await this.checkGuildFeeds(guild.id, client, logger).catch((err) => {
        console.error(`Error processing social feeds for guild ${guild.name}:`, err);
      });
    }
  }

  async buildManagerPanel(guildId) {
    const [rawConfig, rawFeeds] = await Promise.all([
      this.getConfig(guildId),
      this.listFeeds(guildId)
    ]);
    const config = rawConfig || {};
    const feeds = rawFeeds || [];

    const byPlatform = feeds.reduce((acc, f) => {
      acc[f.platform] = (acc[f.platform] || 0) + 1;
      return acc;
    }, {});

    const activeCount = feeds.filter((f) => f.enabled).length;
    const twitchCount = byPlatform[PLATFORM_KEYS.TWITCH] || 0;
    const ytCount = byPlatform[PLATFORM_KEYS.YOUTUBE] || 0;

    const embed = createBaseEmbed({
      title: 'SlickBot Social Feeds Manager',
      description: [
        '**Viewing:** Social Media Announcement Center',
        '',
        `Module Enabled: **${config.enabled ? '✅ Enabled' : '⏸️ Disabled'}**`,
        `Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : '*None (Configured per feed)*'}`,
        `Default Ping Role: ${config.default_ping_role_id ? `<@&${config.default_ping_role_id}>` : '*None*'}`,
        '',
        '**Tracked Channels Summary**',
        `• Total Feeds: **${feeds.length}** (${activeCount} active)`,
        `• 🟣 Twitch: **${twitchCount}**`,
        `• 🔴 YouTube: **${ytCount}**`,
        '',
        '**Quick Commands**',
        '• `/feed add` — Follow a new creator or channel',
        '• `/feed remove` — Unfollow a channel',
        '• `/feed edit` — Change notification channels or custom messages',
        '• `/feed list` — View all followed social accounts',
        '• `/feed test` — Send a test announcement embed',
        '• `/feed check` — Force an immediate feed refresh'
      ].join('\n'),
      color: config.enabled ? SlickBotColors.PRIMARY : SlickBotColors.MUTED,
      footer: 'SlickBot Social Feeds'
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CustomIds.OnboardingModulePrefix}SOCIAL_FEEDS`).setLabel('Quick Setup').setStyle(ButtonStyle.Success).setEmoji('🚀'),
      new ButtonBuilder().setCustomId(`${CustomIds.ModuleTogglePrefix}SOCIAL_FEEDS`).setLabel(config.enabled ? 'Disable Module' : 'Enable Module').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji(config.enabled ? '⏸️' : '▶️'),
      new ButtonBuilder().setCustomId(CustomIds.FeedsCheckNow).setLabel('Check Feeds Now').setStyle(ButtonStyle.Primary).setEmoji('🔄')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CustomIds.FeedsRefresh).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
      new ButtonBuilder().setCustomId(CustomIds.SetupCategoryAutomation).setLabel('Automation').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
      new ButtonBuilder().setCustomId(CustomIds.SetupRefresh).setLabel('Setup Center').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row1, row2] };
  }
}

module.exports = {
  SocialFeedService,
  PLATFORM_KEYS,
  PLATFORM_META,
  DEFAULT_TEMPLATES,
  normalizePlatform,
  normalizeAccountId,
  formatStreamDuration,
  applyFeedPlaceholders,
  classifyYouTubeVideo
};
