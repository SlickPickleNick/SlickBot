const {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { query } = require('../../services/db');
const { createBaseEmbed, createButtonRow, createPanelButton, createLinkButton, SlickBotColors } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

const DEFAULT_MASTER_TITLE = 'Knowledge Base / FAQ';
const DEFAULT_MASTER_DESCRIPTION = 'Browse the FAQ posts below by category. Categories are based on this forum channel\'s post tags.';

function forumPostUrl(guildId, threadId) {
  return `https://discord.com/channels/${guildId}/${threadId}`;
}

function truncate(value, max = 100) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeSearch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseMessageLink(value) {
  const match = String(value || '').match(/discord(?:app)?\.com\/channels\/(\d{15,25})\/(\d{15,25})\/(\d{15,25})/i);
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

async function fetchStarterMessage(thread) {
  if (!thread) return null;
  if (typeof thread.fetchStarterMessage === 'function') {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    if (starter) return starter;
  }
  if (thread.messages?.fetch) {
    const messages = await thread.messages.fetch({ limit: 1, after: '0' }).catch(() => null);
    return messages?.first?.() || null;
  }
  return null;
}

function buildTagMap(forumChannel) {
  const tags = Array.isArray(forumChannel?.availableTags) ? forumChannel.availableTags : [];
  return new Map(tags.map((tag) => [tag.id, tag.name || tag.id]));
}

async function collectThreads(forumChannel) {
  const byId = new Map();
  const addThreads = (collectionLike) => {
    const collection = collectionLike?.threads || collectionLike;
    if (!collection) return;
    const values = typeof collection.values === 'function' ? collection.values() : Array.isArray(collection) ? collection : [];
    for (const thread of values) {
      if (thread?.id) byId.set(thread.id, thread);
    }
  };

  if (forumChannel?.threads?.fetchActive) addThreads(await forumChannel.threads.fetchActive().catch(() => null));
  if (forumChannel?.threads?.fetchArchived) {
    addThreads(await forumChannel.threads.fetchArchived({ type: 'public', limit: 100 }).catch(() => null));
    addThreads(await forumChannel.threads.fetchArchived({ type: 'private', limit: 100 }).catch(() => null));
  }
  return [...byId.values()];
}

function buildFaqIndexPayload({ guildId, config, forumChannel, posts }) {
  const tagMap = buildTagMap(forumChannel);
  const categories = new Map();
  for (const post of posts) {
    const appliedTags = Array.isArray(post.appliedTags) ? post.appliedTags : [];
    const labels = appliedTags.length ? appliedTags.map((tagId) => tagMap.get(tagId) || `Tag ${tagId}`) : ['Uncategorized'];
    for (const label of labels) {
      if (!categories.has(label)) categories.set(label, []);
      categories.get(label).push(post);
    }
  }

  const sortedCategories = [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fields = sortedCategories.slice(0, 24).map(([label, categoryPosts]) => {
    const value = categoryPosts
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((thread) => `• [${truncate(thread.name, 80)}](${forumPostUrl(guildId, thread.id)})${thread.archived ? ' · archived' : ''}`)
      .join('\n');
    return { name: truncate(label, 256), value: truncate(value || 'No posts found.', 1024), inline: false };
  });

  if (!fields.length) fields.push({ name: 'No FAQ Posts Found', value: 'Create forum posts in this FAQ forum. SlickBot will list them here automatically.', inline: false });
  if (sortedCategories.length > 24) fields.push({ name: 'More Categories', value: `Additional categories exist but could not fit in one Discord embed. Current listed categories: **24/${sortedCategories.length}**.`, inline: false });

  const embed = createBaseEmbed({
    title: config?.master_title || DEFAULT_MASTER_TITLE,
    description: [
      config?.master_description || DEFAULT_MASTER_DESCRIPTION,
      '',
      `Forum: <#${config.forum_channel_id}>`,
      `FAQ Posts Indexed: **${posts.length}**`,
      `Last Updated: <t:${Math.floor(Date.now() / 1000)}:R>`
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Knowledge Base'
  }).addFields(fields);

  return { embeds: [embed], components: [] };
}

function buildFaqAnswerPayload({ thread, guildId, targetUserId, ticketChannelId }) {
  const ticket = ticketChannelId ? ` in <#${ticketChannelId}>` : '';
  const embed = createBaseEmbed({
    title: `FAQ: ${truncate(thread.name, 220)}`,
    description: [
      `Please review this FAQ post: [${truncate(thread.name, 180)}](${forumPostUrl(guildId, thread.id)}).`,
      '',
      `If you still need support after reading it, submit a ticket${ticket}.`
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Knowledge Base'
  });
  return {
    content: targetUserId ? `<@${targetUserId}>` : undefined,
    embeds: [embed],
    allowedMentions: targetUserId ? { parse: [], users: [targetUserId] } : { parse: [] }
  };
}

function buildFaqPostNavigationPayload({ guildId, config, faqThread }) {
  const masterUrl = config?.master_thread_id ? forumPostUrl(guildId, config.master_thread_id) : null;
  const ticketUrl = config?.ticket_channel_id ? forumPostUrl(guildId, config.ticket_channel_id) : null;
  const ticketLine = config?.ticket_channel_id
    ? `If this FAQ does not answer your question, use **Get Support** to open a ticket in <#${config.ticket_channel_id}>.`
    : 'If this FAQ does not answer your question, contact the staff team or use the server support process.';

  const embed = createBaseEmbed({
    title: 'FAQ Navigation',
    description: [
      `You are viewing **${truncate(faqThread?.name || 'this FAQ post', 180)}**.`,
      '',
      'Use **Return to Starting Menu** to go back to the main FAQ index and browse other FAQ posts.',
      ticketLine
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Knowledge Base'
  });

  const buttons = [];
  if (masterUrl) buttons.push(createLinkButton(masterUrl, 'Return to Starting Menu'));
  if (ticketUrl) buttons.push(createLinkButton(ticketUrl, 'Get Support'));

  return { embeds: [embed], components: buttons.length ? [createButtonRow(buttons)] : [] };
}

async function hasExistingNavigationMessage(thread, botUserId) {
  if (!thread?.messages?.fetch || !botUserId) return false;
  const messages = await thread.messages.fetch({ limit: 10 }).catch(() => null);
  if (!messages) return false;
  return messages.some((message) => {
    if (message.author?.id !== botUserId) return false;
    return message.embeds?.some((embed) => {
      const footer = embed.footer?.text || '';
      const title = embed.title || '';
      return footer === 'SlickBot Knowledge Base' && title === 'FAQ Navigation';
    });
  });
}

class FaqService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM faq_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async upsertConfig({ guildId, forumChannelId, ticketChannelId, masterTitle, masterDescription }) {
    const current = await this.getConfig(guildId);
    const result = await query(
      `INSERT INTO faq_configs (guild_id, forum_channel_id, ticket_channel_id, master_title, master_description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id)
       DO UPDATE SET forum_channel_id = EXCLUDED.forum_channel_id,
                     ticket_channel_id = EXCLUDED.ticket_channel_id,
                     master_title = EXCLUDED.master_title,
                     master_description = EXCLUDED.master_description,
                     updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        forumChannelId || current?.forum_channel_id || null,
        ticketChannelId === undefined ? current?.ticket_channel_id || null : ticketChannelId,
        masterTitle || current?.master_title || DEFAULT_MASTER_TITLE,
        masterDescription || current?.master_description || DEFAULT_MASTER_DESCRIPTION
      ]
    );
    return result.rows[0];
  }

  async setMasterPost(config, threadId, messageId) {
    const result = await query(
      `UPDATE faq_configs
       SET master_thread_id = $2, master_message_id = $3, updated_at = NOW()
       WHERE guild_id = $1
       RETURNING *`,
      [config.guild_id, threadId, messageId]
    );
    return result.rows[0] || config;
  }

  async resolveForum(guild, config) {
    if (!guild || !config?.forum_channel_id) return null;
    const channel = await guild.channels.fetch(config.forum_channel_id).catch(() => null);
    return channel?.type === ChannelType.GuildForum ? channel : null;
  }

  async ensureMasterPost({ guild, config, logger, actorUserId = null }) {
    const forum = await this.resolveForum(guild, config);
    if (!forum) return { ok: false, reason: 'The configured FAQ forum channel could not be found or is not a forum channel.' };

    let thread = config.master_thread_id ? await guild.channels.fetch(config.master_thread_id).catch(() => null) : null;
    const threadInForum = thread && (thread.parentId === forum.id || thread.parent?.id === forum.id);
    if (!threadInForum) thread = null;
    let starter = thread ? await fetchStarterMessage(thread).catch(() => null) : null;

    if (!thread || !starter) {
      thread = await forum.threads.create({
        name: truncate(config.master_title || DEFAULT_MASTER_TITLE, 100),
        message: { embeds: [createBaseEmbed({ title: config.master_title || DEFAULT_MASTER_TITLE, description: 'Building FAQ index…', color: SlickBotColors.INFO, footer: 'SlickBot Knowledge Base' })] },
        reason: 'SlickBot FAQ master index post'
      });
      starter = await fetchStarterMessage(thread).catch(() => null);
      config = await this.setMasterPost(config, thread.id, starter?.id || null);
      await logger?.log?.({
        guildId: guild.id,
        eventKey: 'faq-index',
        title: 'FAQ Master Post Created',
        body: `Forum: <#${forum.id}>\nMaster Post: <#${thread.id}>`,
        actorUserId,
        metadata: { forumChannelId: forum.id, threadId: thread.id, messageId: starter?.id || null }
      }).catch(() => {});
    }

    return { ok: true, forum, thread, starter, config };
  }

  async getFaqPosts(guild, config) {
    const forum = await this.resolveForum(guild, config);
    if (!forum) return [];
    const threads = await collectThreads(forum);
    return threads
      .filter((thread) => thread.id !== config.master_thread_id)
      .filter((thread) => thread.parentId === forum.id || thread.parent?.id === forum.id)
      .filter((thread) => !thread.deleted)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  async refreshMasterPost({ guild, client = null, logger = null, actorUserId = null }) {
    let config = await this.getConfig(guild.id);
    if (!config?.forum_channel_id) return { ok: false, reason: 'FAQ has not been configured. Run `/faq setup` first.' };

    const ensured = await this.ensureMasterPost({ guild, config, logger, actorUserId });
    if (!ensured.ok) return ensured;
    config = ensured.config;

    const desiredThreadName = truncate(config.master_title || DEFAULT_MASTER_TITLE, 100);
    if (ensured.thread?.name !== desiredThreadName) {
      await ensured.thread.edit({ name: desiredThreadName, reason: 'SlickBot FAQ master title updated' }).catch(() => {});
    }

    const posts = await this.getFaqPosts(guild, config);
    const payload = buildFaqIndexPayload({ guildId: guild.id, config, forumChannel: ensured.forum, posts });
    const starter = ensured.starter || await fetchStarterMessage(ensured.thread).catch(() => null);
    if (!starter) return { ok: false, reason: 'The FAQ master post exists, but SlickBot could not fetch its starter message.' };
    await starter.edit(payload);
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'faq-index',
      title: 'FAQ Master Index Refreshed',
      body: `Forum: <#${config.forum_channel_id}>\nFAQ Posts Indexed: **${posts.length}**\nMaster Post: <#${config.master_thread_id}>`,
      actorUserId,
      metadata: { forumChannelId: config.forum_channel_id, masterThreadId: config.master_thread_id, postCount: posts.length }
    }).catch(() => {});
    return { ok: true, config, forum: ensured.forum, thread: ensured.thread, message: starter, posts };
  }

  async setup({ guild, forumChannel, ticketChannel = null, masterTitle, masterDescription, logger, actorUserId }) {
    const config = await this.upsertConfig({
      guildId: guild.id,
      forumChannelId: forumChannel.id,
      ticketChannelId: ticketChannel === undefined ? undefined : ticketChannel?.id || null,
      masterTitle,
      masterDescription
    });
    const refreshed = await this.refreshMasterPost({ guild, logger, actorUserId });
    return { ...refreshed, config: refreshed.config || config };
  }

  async findFaqThread(guild, questionOrThreadId) {
    const config = await this.getConfig(guild.id);
    if (!config?.forum_channel_id) return null;
    const posts = await this.getFaqPosts(guild, config);
    const raw = String(questionOrThreadId || '').trim();
    if (!raw) return null;
    const byId = posts.find((thread) => thread.id === raw);
    if (byId) return { thread: byId, config };
    const needle = normalizeSearch(raw);
    if (!needle) return null;
    const exact = posts.find((thread) => normalizeSearch(thread.name) === needle);
    if (exact) return { thread: exact, config };
    const contains = posts.find((thread) => normalizeSearch(thread.name).includes(needle) || needle.includes(normalizeSearch(thread.name)));
    return contains ? { thread: contains, config } : null;
  }

  async autocomplete(guild, focusedValue) {
    const config = await this.getConfig(guild.id).catch(() => null);
    if (!config?.forum_channel_id) return [];
    const posts = await this.getFaqPosts(guild, config).catch(() => []);
    const needle = normalizeSearch(focusedValue);
    return posts
      .filter((thread) => !needle || normalizeSearch(thread.name).includes(needle))
      .slice(0, 25)
      .map((thread) => ({ name: truncate(thread.name, 100), value: thread.id }));
  }

  buildAnswerModal(targetChannelId, targetMessageId) {
    return new ModalBuilder()
      .setCustomId(`${CustomIds.FaqAnswerModalPrefix}${targetChannelId}:${targetMessageId}`)
      .setTitle('Send FAQ Reply')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('question')
          .setLabel('FAQ post title or keywords')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder('Example: how to open a ticket')
      ));
  }

  async sendFaqAnswer({ guild, channel, actorUser, question, targetUser = null, targetMessage = null, logger = null }) {
    const found = await this.findFaqThread(guild, question);
    if (!found) return { ok: false, reason: 'No matching FAQ post was found in the configured forum.' };
    const targetUserId = targetUser?.id || targetMessage?.author?.id || null;
    const payload = buildFaqAnswerPayload({ thread: found.thread, guildId: guild.id, targetUserId, ticketChannelId: found.config.ticket_channel_id });
    let message;
    if (targetMessage && typeof targetMessage.reply === 'function') message = await targetMessage.reply(payload);
    else message = await channel.send(payload);
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'faq-answer',
      title: 'FAQ Answer Sent',
      body: `FAQ: [${found.thread.name}](${forumPostUrl(guild.id, found.thread.id)})\nChannel: <#${message.channelId}>${targetUserId ? `\nTarget: <@${targetUserId}>` : ''}`,
      actorUserId: actorUser?.id || null,
      metadata: { faqThreadId: found.thread.id, targetUserId, messageId: message.id }
    }).catch(() => {});
    return { ok: true, thread: found.thread, message, config: found.config };
  }

  async shouldRefreshForThread(thread) {
    const guildId = thread?.guild?.id || thread?.guildId;
    const parentId = thread?.parentId || thread?.parent?.id;
    if (!guildId || !parentId) return false;
    const config = await this.getConfig(guildId).catch(() => null);
    return Boolean(config?.forum_channel_id === parentId && thread.id !== config.master_thread_id);
  }

  async postFaqThreadNavigation({ guild, thread, config, client = null, logger = null, force = false }) {
    if (!guild || !thread || !config?.forum_channel_id) return { ok: false, reason: 'Missing FAQ forum post context.' };
    if (thread.id === config.master_thread_id) return { ok: false, ignored: true, reason: 'Master post skipped.' };
    if ((thread.parentId || thread.parent?.id) !== config.forum_channel_id) return { ok: false, ignored: true, reason: 'Not in configured FAQ forum.' };
    const botUserId = client?.user?.id || guild.client?.user?.id || null;
    if (!force && await hasExistingNavigationMessage(thread, botUserId)) return { ok: true, skipped: true, reason: 'Navigation message already exists.' };

    const payload = buildFaqPostNavigationPayload({ guildId: guild.id, config, faqThread: thread });
    const message = await thread.send(payload);
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'faq-index',
      title: 'FAQ Post Navigation Added',
      body: `FAQ Post: [${thread.name}](${forumPostUrl(guild.id, thread.id)})${config.ticket_channel_id ? `\nTicket Channel: <#${config.ticket_channel_id}>` : ''}`,
      metadata: { forumChannelId: config.forum_channel_id, threadId: thread.id, messageId: message.id, ticketChannelId: config.ticket_channel_id || null }
    }).catch(() => {});
    return { ok: true, message };
  }

  async handleForumThreadChange(thread, client, logger, action = 'updated') {
    const guild = thread?.guild || (thread?.guildId ? client.guilds.cache.get(thread.guildId) : null);
    if (!guild) return { ok: false, reason: 'Missing guild.' };
    if (!(await this.shouldRefreshForThread(thread))) return { ok: false, ignored: true };
    const refreshed = await this.refreshMasterPost({ guild, client, logger });
    if (action === 'created' && refreshed?.ok && thread.id !== refreshed.config?.master_thread_id) {
      await this.postFaqThreadNavigation({ guild, thread, config: refreshed.config, client, logger }).catch(async (error) => {
        await logger?.log?.({
          guildId: guild.id,
          eventKey: 'faq-error',
          title: 'FAQ Post Navigation Failed',
          body: error instanceof Error ? error.message : String(error),
          metadata: { threadId: thread.id, forumChannelId: refreshed.config?.forum_channel_id || null }
        }).catch(() => {});
      });
    }
    return refreshed;
  }

  async buildManagerPanel(guildId) {
    const config = await this.getConfig(guildId).catch(() => null);
    const embed = createBaseEmbed({
      title: 'SlickBot Community Center',
      description: [
        '**Viewing:** Knowledge Base / FAQ',
        '',
        `Status: **${config?.forum_channel_id ? 'Configured' : 'Needs Setup'}**`,
        `Forum Channel: ${config?.forum_channel_id ? `<#${config.forum_channel_id}>` : '**Not configured**'}`,
        `Master Post: ${config?.master_thread_id ? `<#${config.master_thread_id}>` : '**Not created**'}`,
        `Ticket Channel: ${config?.ticket_channel_id ? `<#${config.ticket_channel_id}>` : 'Not set'}`,
        '',
        '**How It Works**',
        'Create FAQ items manually as posts in the configured forum. SlickBot maintains the master index, groups posts by forum tag, and adds navigation buttons to new FAQ posts.',
        '',
        '**Primary Commands**',
        '`/faq setup` · `/faq refresh` · `/faq resend-navigation` · `/faq answer` · `/faq status`'
      ].join('\n'),
      color: config?.forum_channel_id && config?.master_thread_id ? SlickBotColors.SUCCESS : SlickBotColors.WARNING,
      footer: 'SlickBot Knowledge Base'
    });
    return {
      embeds: [embed],
      components: [createButtonRow([
        createPanelButton(CustomIds.FaqRefresh, 'Refresh FAQ', ButtonStyle.Primary),
        createPanelButton(CustomIds.SetupCommunity, 'Community', ButtonStyle.Secondary),
        createPanelButton(CustomIds.SetupRefresh, 'Return to Setup', ButtonStyle.Secondary)
      ])]
    };
  }
}

module.exports = {
  FaqService,
  DEFAULT_MASTER_TITLE,
  DEFAULT_MASTER_DESCRIPTION,
  parseMessageLink,
  forumPostUrl
};
