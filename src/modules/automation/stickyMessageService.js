const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

const DEFAULT_COOLDOWN_SECONDS = 10;
const DEFAULT_THRESHOLD_MESSAGES = 5;

const COLOR_PRESETS = Object.freeze({
  PRIMARY: SlickBotColors.PRIMARY || 0x5865F2,
  SUCCESS: SlickBotColors.SUCCESS || 0x57F287,
  WARNING: SlickBotColors.WARNING || 0xFEE75C,
  ERROR: SlickBotColors.ERROR || 0xED4245,
  INFO: SlickBotColors.INFO || 0x5865F2,
  MUTED: SlickBotColors.MUTED || 0x72767D,
  PURPLE: 0x9B59B6,
  CYAN: 0x00D2D3,
  GOLD: 0xF1C40F
});

function parseStickyColor(colorInput) {
  if (!colorInput) return COLOR_PRESETS.PRIMARY;
  const raw = String(colorInput).trim().toUpperCase();
  if (COLOR_PRESETS[raw]) return COLOR_PRESETS[raw];
  const hex = raw.replace(/^#/, '');
  if (/^[0-9A-F]{6}$/i.test(hex)) {
    return parseInt(hex, 16);
  }
  return COLOR_PRESETS.PRIMARY;
}

class StickyMessageService {
  constructor() {
    this.cache = new Map(); // key: `${guildId}:${channelId}` -> sticky object
    this.repostLocks = new Set(); // channelId set of in-flight reposts
  }

  cacheKey(guildId, channelId) {
    return `${guildId}:${channelId}`;
  }

  async getSticky(guildId, channelId) {
    const key = this.cacheKey(guildId, channelId);
    if (this.cache.has(key)) return this.cache.get(key);

    const result = await query(
      `SELECT * FROM sticky_messages WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`,
      [guildId, channelId]
    );

    if (result.rows[0]) {
      this.cache.set(key, result.rows[0]);
      return result.rows[0];
    }
    return null;
  }

  async listStickies(guildId) {
    const result = await query(
      `SELECT * FROM sticky_messages WHERE guild_id = $1 ORDER BY created_at ASC`,
      [guildId]
    );
    for (const row of result.rows) {
      this.cache.set(this.cacheKey(guildId, row.channel_id), row);
    }
    return result.rows;
  }

  async setSticky({
    guildId,
    channelId,
    messageContent = null,
    embedTitle = null,
    embedDescription = null,
    embedColor = 'PRIMARY',
    embedFooter = null,
    embedImageUrl = null,
    embedThumbnailUrl = null,
    cooldownSeconds = DEFAULT_COOLDOWN_SECONDS,
    messageCountThreshold = DEFAULT_THRESHOLD_MESSAGES,
    createdByUserId = null,
    client = null
  }) {
    const content = messageContent ? String(messageContent).trim() : null;
    const title = embedTitle ? String(embedTitle).trim() : null;
    const desc = embedDescription ? String(embedDescription).trim() : null;

    if (!content && !title && !desc) {
      return { ok: false, reason: 'Please provide message content or an embed title/description for the sticky notice.' };
    }

    const safeCooldown = Math.max(5, Math.min(300, Number(cooldownSeconds) || DEFAULT_COOLDOWN_SECONDS));
    const safeThreshold = Math.max(1, Math.min(100, Number(messageCountThreshold) || DEFAULT_THRESHOLD_MESSAGES));

    const result = await query(
      `INSERT INTO sticky_messages (
         guild_id, channel_id, message_content, embed_title, embed_description,
         embed_color, embed_footer, embed_image_url, embed_thumbnail_url,
         cooldown_seconds, message_count_threshold, message_count_since_last,
         enabled, created_by_user_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, true, $12, NOW(), NOW())
       ON CONFLICT (guild_id, channel_id) DO UPDATE SET
         message_content = EXCLUDED.message_content,
         embed_title = EXCLUDED.embed_title,
         embed_description = EXCLUDED.embed_description,
         embed_color = EXCLUDED.embed_color,
         embed_footer = EXCLUDED.embed_footer,
         embed_image_url = EXCLUDED.embed_image_url,
         embed_thumbnail_url = EXCLUDED.embed_thumbnail_url,
         cooldown_seconds = EXCLUDED.cooldown_seconds,
         message_count_threshold = EXCLUDED.message_count_threshold,
         enabled = true,
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        channelId,
        content,
        title,
        desc,
        embedColor || 'PRIMARY',
        embedFooter || null,
        embedImageUrl || null,
        embedThumbnailUrl || null,
        safeCooldown,
        safeThreshold,
        createdByUserId || null
      ]
    );

    const sticky = result.rows[0];
    this.cache.set(this.cacheKey(guildId, channelId), sticky);

    if (client) {
      await this.repostSticky(guildId, channelId, client, { force: true }).catch(() => {});
    }

    return { ok: true, sticky };
  }

  async editSticky(guildId, channelId, updates = {}, client = null) {
    const existing = await this.getSticky(guildId, channelId);
    if (!existing) return null;

    const messageContent = updates.messageContent !== undefined ? updates.messageContent : existing.message_content;
    const embedTitle = updates.embedTitle !== undefined ? updates.embedTitle : existing.embed_title;
    const embedDescription = updates.embedDescription !== undefined ? updates.embedDescription : existing.embed_description;
    const embedColor = updates.embedColor !== undefined ? updates.embedColor : existing.embed_color;
    const embedFooter = updates.embedFooter !== undefined ? updates.embedFooter : existing.embed_footer;
    const embedImageUrl = updates.embedImageUrl !== undefined ? updates.embedImageUrl : existing.embed_image_url;
    const embedThumbnailUrl = updates.embedThumbnailUrl !== undefined ? updates.embedThumbnailUrl : existing.embed_thumbnail_url;
    const cooldownSeconds = updates.cooldownSeconds !== undefined ? Math.max(5, Math.min(300, Number(updates.cooldownSeconds))) : existing.cooldown_seconds;
    const messageCountThreshold = updates.messageCountThreshold !== undefined ? Math.max(1, Math.min(100, Number(updates.messageCountThreshold))) : existing.message_count_threshold;
    const enabled = typeof updates.enabled === 'boolean' ? updates.enabled : existing.enabled;

    const result = await query(
      `UPDATE sticky_messages
       SET message_content = $3,
           embed_title = $4,
           embed_description = $5,
           embed_color = $6,
           embed_footer = $7,
           embed_image_url = $8,
           embed_thumbnail_url = $9,
           cooldown_seconds = $10,
           message_count_threshold = $11,
           enabled = $12,
           updated_at = NOW()
       WHERE guild_id = $1 AND channel_id = $2
       RETURNING *`,
      [
        guildId,
        channelId,
        messageContent,
        embedTitle,
        embedDescription,
        embedColor,
        embedFooter,
        embedImageUrl,
        embedThumbnailUrl,
        cooldownSeconds,
        messageCountThreshold,
        enabled
      ]
    );

    const updated = result.rows[0];
    if (updated) {
      this.cache.set(this.cacheKey(guildId, channelId), updated);
      if (client && updated.enabled) {
        await this.repostSticky(guildId, channelId, client, { force: true }).catch(() => {});
      }
    }
    return updated || null;
  }

  async removeSticky(guildId, channelId, client = null) {
    const existing = await this.getSticky(guildId, channelId);
    if (!existing) return null;

    if (client && existing.last_message_id) {
      try {
        const guild = client.guilds?.cache?.get(guildId);
        if (guild) {
          const channel = guild.channels?.cache?.get(channelId) || await guild.channels?.fetch?.(channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const msg = await channel.messages?.fetch?.(existing.last_message_id).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        }
      } catch (_) {}
    }

    const result = await query(
      `DELETE FROM sticky_messages WHERE guild_id = $1 AND channel_id = $2 RETURNING *`,
      [guildId, channelId]
    );

    this.cache.delete(this.cacheKey(guildId, channelId));
    return result.rows[0] || null;
  }

  async toggleSticky(guildId, channelId, client = null) {
    const existing = await this.getSticky(guildId, channelId);
    if (!existing) return null;

    const nextState = !existing.enabled;

    if (!nextState && client && existing.last_message_id) {
      // Pausing: remove active message
      try {
        const guild = client.guilds?.cache?.get(guildId);
        if (guild) {
          const channel = guild.channels?.cache?.get(channelId) || await guild.channels?.fetch?.(channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const msg = await channel.messages?.fetch?.(existing.last_message_id).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        }
      } catch (_) {}
    }

    const result = await query(
      `UPDATE sticky_messages
       SET enabled = $3,
           last_message_id = CASE WHEN $3 = false THEN NULL ELSE last_message_id END,
           updated_at = NOW()
       WHERE guild_id = $1 AND channel_id = $2
       RETURNING *`,
      [guildId, channelId, nextState]
    );

    const updated = result.rows[0];
    if (updated) {
      this.cache.set(this.cacheKey(guildId, channelId), updated);
      if (nextState && client) {
        await this.repostSticky(guildId, channelId, client, { force: true }).catch(() => {});
      }
    }
    return updated || null;
  }

  buildStickyPayload(sticky) {
    const payload = {};
    if (sticky.message_content) {
      payload.content = sticky.message_content;
    }

    const hasEmbed = sticky.embed_title || sticky.embed_description || sticky.embed_image_url || sticky.embed_thumbnail_url;
    if (hasEmbed) {
      const embed = new EmbedBuilder()
        .setColor(parseStickyColor(sticky.embed_color))
        .setFooter({ text: sticky.embed_footer || '📌 Sticky Notice • Automatically stays at the bottom' });

      if (sticky.embed_title) embed.setTitle(sticky.embed_title.slice(0, 256));
      if (sticky.embed_description) embed.setDescription(sticky.embed_description.slice(0, 4096));
      if (sticky.embed_image_url) embed.setImage(sticky.embed_image_url);
      if (sticky.embed_thumbnail_url) embed.setThumbnail(sticky.embed_thumbnail_url);

      payload.embeds = [embed];
    }

    return payload;
  }

  async repostSticky(guildId, channelId, client, options = { force: false }) {
    const sticky = await this.getSticky(guildId, channelId);
    if (!sticky || (!sticky.enabled && !options.force)) return false;

    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) return false;

    const channel = guild.channels?.cache?.get(channelId) || await guild.channels?.fetch?.(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    // Delete previously posted sticky message if present
    if (sticky.last_message_id) {
      try {
        const prevMessage = await channel.messages.fetch(sticky.last_message_id).catch(() => null);
        if (prevMessage) {
          await prevMessage.delete().catch(() => {});
        }
      } catch (_) {}
    }

    const payload = this.buildStickyPayload(sticky);
    const newMessage = await channel.send(payload).catch(() => null);

    if (newMessage) {
      await query(
        `UPDATE sticky_messages
         SET last_message_id = $3,
             last_reposted_at = NOW(),
             message_count_since_last = 0,
             updated_at = NOW()
         WHERE guild_id = $1 AND channel_id = $2`,
        [guildId, channelId, newMessage.id]
      );

      sticky.last_message_id = newMessage.id;
      sticky.last_reposted_at = new Date().toISOString();
      sticky.message_count_since_last = 0;
      this.cache.set(this.cacheKey(guildId, channelId), sticky);
      return true;
    }

    return false;
  }

  async handleMessage(message, logger = null) {
    if (!message.guild || message.author?.bot) return;

    const guildId = message.guild.id;
    const channelId = message.channelId;

    const sticky = await this.getSticky(guildId, channelId);
    if (!sticky || !sticky.enabled) return;

    // If message is the sticky message itself, do nothing
    if (sticky.last_message_id && message.id === sticky.last_message_id) return;

    // Concurrency lock check
    if (this.repostLocks.has(channelId)) return;

    const newCount = (Number(sticky.message_count_since_last) || 0) + 1;
    sticky.message_count_since_last = newCount;

    const cooldownMs = (Number(sticky.cooldown_seconds) || DEFAULT_COOLDOWN_SECONDS) * 1000;
    const lastPosted = sticky.last_reposted_at ? new Date(sticky.last_reposted_at).getTime() : 0;
    const timeSinceLast = Date.now() - lastPosted;

    const thresholdMet = newCount >= (Number(sticky.message_count_threshold) || DEFAULT_THRESHOLD_MESSAGES);
    const cooldownElapsed = timeSinceLast >= cooldownMs;

    if (thresholdMet && cooldownElapsed) {
      this.repostLocks.add(channelId);
      try {
        await this.repostSticky(guildId, channelId, message.client);
      } catch (err) {
        if (logger) {
          logger.log({
            guildId,
            eventKey: 'sticky-error',
            title: 'Sticky Message Repost Failed',
            body: `Failed to repost sticky in <#${channelId}>: ${err.message}`,
            metadata: { channelId, error: err.message }
          }).catch(() => {});
        }
      } finally {
        this.repostLocks.delete(channelId);
      }
    } else {
      // Just record count update in memory / periodic
      this.cache.set(this.cacheKey(guildId, channelId), sticky);
    }
  }

  async resetModule(guildId, client = null) {
    const stickies = await this.listStickies(guildId);

    if (client) {
      const guild = client.guilds?.cache?.get(guildId);
      if (guild) {
        for (const s of stickies) {
          if (s.last_message_id) {
            try {
              const channel = guild.channels?.cache?.get(s.channel_id) || await guild.channels?.fetch?.(s.channel_id).catch(() => null);
              if (channel && channel.isTextBased()) {
                const msg = await channel.messages?.fetch?.(s.last_message_id).catch(() => null);
                if (msg) await msg.delete().catch(() => {});
              }
            } catch (_) {}
          }
        }
      }
    }

    const before = stickies.length;
    await query(`DELETE FROM sticky_messages WHERE guild_id = $1`, [guildId]);

    for (const s of stickies) {
      this.cache.delete(this.cacheKey(guildId, s.channel_id));
    }

    return { ok: true, deletedCount: before };
  }

  async buildManagerPanel(guildId) {
    const stickies = await this.listStickies(guildId);
    const activeCount = stickies.filter((s) => s.enabled).length;

    const descriptionLines = [
      '**Viewing:** Sticky Messages Center',
      '',
      'Sticky messages keep important rules, guidelines, or channel notices pinned at the bottom of active text channels, automatically reposting when new chat arrives.',
      '',
      `• Total Configured Stickies: **${stickies.length}**`,
      `• Active & Auto-Reposting: **${activeCount}**`,
      `• Paused: **${stickies.length - activeCount}**`,
      ''
    ];

    if (stickies.length === 0) {
      descriptionLines.push('*No channels currently have a sticky message configured. Use `/sticky set` or click **Create Sticky** below to add one!*');
    } else {
      descriptionLines.push('**Active Sticky Channels:**');
      for (const [idx, s] of stickies.slice(0, 8).entries()) {
        const statusBadge = s.enabled ? '🟢 Active' : '⏸️ Paused';
        const titleText = s.embed_title ? ` · "${s.embed_title.slice(0, 30)}"` : '';
        descriptionLines.push(`**${idx + 1}.** <#${s.channel_id}> (${statusBadge})${titleText}\n   ↳ Throttle: Every **${s.message_count_threshold}** msgs · **${s.cooldown_seconds}s** cooldown`);
      }
      if (stickies.length > 8) {
        descriptionLines.push(`*...and ${stickies.length - 8} more channels.*`);
      }
    }

    descriptionLines.push(
      '',
      '**Quick Commands**',
      '• `/sticky set` — Add or configure a sticky notice in a channel',
      '• `/sticky edit` — Change title, message content, color, or cooldowns',
      '• `/sticky repost` — Force immediate repost in a channel',
      '• `/sticky toggle` — Pause or resume auto-reposting',
      '• `/sticky remove` — Remove sticky from a channel'
    );

    const embed = createBaseEmbed({
      title: '📌 SlickBot Sticky Messages Manager',
      description: descriptionLines.join('\n'),
      color: activeCount > 0 ? SlickBotColors.PRIMARY : SlickBotColors.MUTED,
      footer: 'SlickBot Automation • Sticky Notices'
    });

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CustomIds.StickyCreateModal).setLabel('Create Sticky').setStyle(ButtonStyle.Success).setEmoji('📌'),
      new ButtonBuilder().setCustomId(CustomIds.StickyRefresh).setLabel('Refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
      new ButtonBuilder().setCustomId(`${CustomIds.ModuleTogglePrefix}STICKY_MESSAGES`).setLabel('Module Status').setStyle(ButtonStyle.Primary).setEmoji('⚡')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CustomIds.SetupCategoryAutomation).setLabel('Automation Hub').setStyle(ButtonStyle.Secondary).setEmoji('🤖'),
      new ButtonBuilder().setCustomId(CustomIds.SetupRefresh).setLabel('Setup Center').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row1, row2] };
  }
}

function buildStickyCreateModal(defaultChannelId = '') {
  return new ModalBuilder()
    .setCustomId(CustomIds.StickyCreateModal)
    .setTitle('Create Channel Sticky Notice')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_id')
          .setLabel('Channel ID')
          .setPlaceholder('Enter channel ID (e.g. 123456789012345678)')
          .setValue(defaultChannelId || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('embed_title')
          .setLabel('Embed Title')
          .setPlaceholder('e.g. 📌 Channel Guidelines & Rules')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('embed_description')
          .setLabel('Embed Description')
          .setPlaceholder('Write your sticky notice description / rules here...')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('message_content')
          .setLabel('Plain Message Text (Optional)')
          .setPlaceholder('Text displayed above embed (supports mentions like @everyone)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('cooldown_seconds')
          .setLabel('Cooldown (Seconds) [Default: 10]')
          .setPlaceholder('10')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setRequired(false)
      )
    );
}

function buildStickyEditModal(sticky) {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.StickyEditModalPrefix}${sticky.channel_id}`)
    .setTitle(`Edit Sticky Notice: #${sticky.channel_id}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('embed_title')
          .setLabel('Embed Title')
          .setValue(sticky.embed_title || '')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('embed_description')
          .setLabel('Embed Description')
          .setValue(sticky.embed_description || '')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4000)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('message_content')
          .setLabel('Plain Message Text')
          .setValue(sticky.message_content || '')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('cooldown_seconds')
          .setLabel('Cooldown (Seconds)')
          .setValue(String(sticky.cooldown_seconds || DEFAULT_COOLDOWN_SECONDS))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('threshold_messages')
          .setLabel('Message Count Threshold')
          .setValue(String(sticky.message_count_threshold || DEFAULT_THRESHOLD_MESSAGES))
          .setStyle(TextInputStyle.Short)
          .setMaxLength(3)
          .setRequired(false)
      )
    );
}

module.exports = {
  StickyMessageService,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_THRESHOLD_MESSAGES,
  COLOR_PRESETS,
  parseStickyColor,
  buildStickyCreateModal,
  buildStickyEditModal
};
