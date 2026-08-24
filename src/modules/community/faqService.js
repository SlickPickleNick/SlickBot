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

function buildFaqIndexPayload({ guildId, config, channel, posts = [], entries = [] }) {
  const isForum = channel?.type === ChannelType.GuildForum;
  const categories = new Map();

  if (isForum) {
    const tagMap = buildTagMap(channel);
    for (const post of posts) {
      const appliedTags = Array.isArray(post.appliedTags) ? post.appliedTags : [];
      const labels = appliedTags.length ? appliedTags.map((tagId) => tagMap.get(tagId) || `Tag ${tagId}`) : ['Uncategorized'];
      for (const label of labels) {
        if (!categories.has(label)) categories.set(label, []);
        categories.get(label).push({
          title: post.name,
          url: forumPostUrl(guildId, post.id),
          archived: post.archived
        });
      }
    }
  } else {
    for (const entry of entries) {
      const label = entry.category || 'General';
      if (!categories.has(label)) categories.set(label, []);
      const url = entry.thread_id
        ? `https://discord.com/channels/${guildId}/${entry.thread_id}`
        : entry.message_id
          ? `https://discord.com/channels/${guildId}/${config.forum_channel_id}/${entry.message_id}`
          : null;
      categories.get(label).push({
        title: entry.question,
        url,
        archived: false
      });
    }
  }

  const sortedCategories = [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fields = sortedCategories.slice(0, 24).map(([label, items]) => {
    const value = items
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
      .map((item) => item.url ? `• [${truncate(item.title, 80)}](${item.url})${item.archived ? ' · archived' : ''}` : `• **${truncate(item.title, 80)}**`)
      .join('\n');
    return { name: truncate(label, 256), value: truncate(value || 'No posts found.', 1024), inline: false };
  });

  const totalCount = isForum ? posts.length : entries.length;
  if (!fields.length) fields.push({ name: 'No FAQ Posts Found', value: 'Use `/faq add` or create posts in this channel. SlickBot will list them here automatically.', inline: false });
  if (sortedCategories.length > 24) fields.push({ name: 'More Categories', value: `Additional categories exist: **24/${sortedCategories.length}**.`, inline: false });

  const embed = createBaseEmbed({
    title: config?.master_title || DEFAULT_MASTER_TITLE,
    description: [
      config?.master_description || DEFAULT_MASTER_DESCRIPTION,
      '',
      `Channel: <#${config.forum_channel_id}>`,
      `FAQ Topics Indexed: **${totalCount}**`,
      `Last Updated: <t:${Math.floor(Date.now() / 1000)}:R>`
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Knowledge Base'
  }).addFields(fields);

  return { embeds: [embed], components: [] };
}

function buildFaqAnswerPayload({ thread, entry, guildId, targetUserId, ticketChannelId }) {
  const ticket = ticketChannelId ? ` in <#${ticketChannelId}>` : '';
  const title = thread ? thread.name : entry ? entry.question : 'FAQ';
  const description = thread
    ? [
        `Please review this FAQ post: [${truncate(thread.name, 180)}](${forumPostUrl(guildId, thread.id)}).`,
        '',
        `If you still need support after reading it, submit a ticket${ticket}.`
      ].join('\n')
    : entry
      ? [
          `**Answer:**`,
          `${entry.answer}`,
          '',
          entry.thread_id ? `Discussion thread: <#${entry.thread_id}>` : '',
          `If you still need support after reading it, submit a ticket${ticket}.`
        ].filter(Boolean).join('\n')
      : 'Please check the FAQ.';

  const embed = createBaseEmbed({
    title: `FAQ: ${truncate(title, 220)}`,
    description,
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
  invalidateGuild(guildId) {
    // Stateless query service with no persistent memory cache
  }

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

  async resolveChannel(guild, config) {
    if (!guild || !config?.forum_channel_id) return null;
    const channel = await guild.channels.fetch(config.forum_channel_id).catch(() => null);
    if (!channel) return null;
    if (channel.type === ChannelType.GuildForum || (typeof channel.isTextBased === 'function' && channel.isTextBased())) {
      return channel;
    }
    return null;
  }

  async resolveForum(guild, config) {
    const channel = await this.resolveChannel(guild, config);
    return channel?.type === ChannelType.GuildForum ? channel : null;
  }

  async getFaqEntries(guildId) {
    const result = await query(
      `SELECT * FROM faq_entries WHERE guild_id = $1 ORDER BY category ASC, question ASC`,
      [guildId]
    ).catch(() => ({ rows: [] }));
    return result.rows || [];
  }

  async ensureMasterPost({ guild, config, logger, actorUserId = null }) {
    const channel = await this.resolveChannel(guild, config);
    if (!channel) return { ok: false, reason: 'The configured FAQ channel could not be found.' };

    const isForum = channel.type === ChannelType.GuildForum;

    if (isForum) {
      let thread = config.master_thread_id ? await guild.channels.fetch(config.master_thread_id).catch(() => null) : null;
      const threadInForum = thread && (thread.parentId === channel.id || thread.parent?.id === channel.id);
      if (!threadInForum) thread = null;
      let starter = thread ? await fetchStarterMessage(thread).catch(() => null) : null;

      if (!thread || !starter) {
        thread = await channel.threads.create({
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
          body: `Forum: <#${channel.id}>\nMaster Post: <#${thread.id}>`,
          actorUserId,
          metadata: { forumChannelId: channel.id, threadId: thread.id, messageId: starter?.id || null }
        }).catch(() => {});
      }

      return { ok: true, channel, forum: channel, thread, starter, config, isForum: true };
    } else {
      // Text channel mode
      let starter = config.master_message_id && channel.messages?.fetch
        ? await channel.messages.fetch(config.master_message_id).catch(() => null)
        : null;

      if (!starter) {
        const entries = await this.getFaqEntries(guild.id);
        const payload = buildFaqIndexPayload({ guildId: guild.id, config, channel, entries });
        starter = await channel.send(payload);
        config = await this.setMasterPost(config, null, starter.id);
        await logger?.log?.({
          guildId: guild.id,
          eventKey: 'faq-index',
          title: 'FAQ Master Panel Created',
          body: `Channel: <#${channel.id}>\nMaster Message: ${starter.id}`,
          actorUserId,
          metadata: { forumChannelId: channel.id, messageId: starter.id }
        }).catch(() => {});
      }

      return { ok: true, channel, message: starter, starter, config, isForum: false };
    }
  }

  async getFaqPosts(guild, config) {
    const channel = await this.resolveChannel(guild, config);
    if (!channel) return [];
    if (channel.type === ChannelType.GuildForum) {
      const threads = await collectThreads(channel);
      return threads
        .filter((thread) => thread.id !== config.master_thread_id)
        .filter((thread) => thread.parentId === channel.id || thread.parent?.id === channel.id)
        .filter((thread) => !thread.deleted)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
    return [];
  }

  async refreshMasterPost({ guild, client = null, logger = null, actorUserId = null }) {
    let config = await this.getConfig(guild.id);
    if (!config?.forum_channel_id) return { ok: false, reason: 'FAQ has not been configured. Run `/faq setup` first.' };

    const ensured = await this.ensureMasterPost({ guild, config, logger, actorUserId });
    if (!ensured.ok) return ensured;
    config = ensured.config;

    const channel = ensured.channel;
    const isForum = channel.type === ChannelType.GuildForum;

    if (isForum) {
      const desiredThreadName = truncate(config.master_title || DEFAULT_MASTER_TITLE, 100);
      if (ensured.thread?.name !== desiredThreadName) {
        await ensured.thread.edit({ name: desiredThreadName, reason: 'SlickBot FAQ master title updated' }).catch(() => {});
      }

      const posts = await this.getFaqPosts(guild, config);
      const payload = buildFaqIndexPayload({ guildId: guild.id, config, channel, posts });
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
      return { ok: true, config, channel, forum: channel, thread: ensured.thread, message: starter, posts, isForum: true };
    } else {
      const entries = await this.getFaqEntries(guild.id);
      const payload = buildFaqIndexPayload({ guildId: guild.id, config, channel, entries });
      const starter = ensured.starter || (config.master_message_id && channel.messages?.fetch ? await channel.messages.fetch(config.master_message_id).catch(() => null) : null);
      if (starter) {
        await starter.edit(payload).catch(() => {});
      }
      return { ok: true, config, channel, message: starter, entries, isForum: false };
    }
  }

  async setup({ guild, channel, ticketChannel = null, masterTitle, masterDescription, logger, actorUserId }) {
    const channelId = channel?.id || channel;
    const config = await this.upsertConfig({
      guildId: guild.id,
      forumChannelId: channelId,
      ticketChannelId: ticketChannel === undefined ? undefined : ticketChannel?.id || null,
      masterTitle,
      masterDescription
    });
    const refreshed = await this.refreshMasterPost({ guild, logger, actorUserId });
    return { ...refreshed, config: refreshed.config || config };
  }

  async addFaqEntry({ guild, question, answer, category = 'General', actorUserId = null, logger = null }) {
    let config = await this.getConfig(guild.id);
    if (!config?.forum_channel_id) return { ok: false, reason: 'FAQ is not configured. Run `/faq setup` first.' };

    const channel = await this.resolveChannel(guild, config);
    if (!channel) return { ok: false, reason: 'The configured FAQ channel could not be found.' };

    const isForum = channel.type === ChannelType.GuildForum;

    if (isForum) {
      const availableTags = Array.isArray(channel.availableTags) ? channel.availableTags : [];
      const matchedTag = availableTags.find((t) => t.name.toLowerCase() === category.toLowerCase());
      const appliedTags = matchedTag ? [matchedTag.id] : [];

      const thread = await channel.threads.create({
        name: truncate(question, 100),
        appliedTags,
        message: {
          content: answer
        },
        reason: 'SlickBot /faq add command'
      });

      const navPayload = buildFaqPostNavigationPayload({ guildId: guild.id, config, faqThread: thread });
      await thread.send(navPayload).catch(() => {});

      await this.refreshMasterPost({ guild, logger, actorUserId });
      return { ok: true, thread, isForum: true };
    } else {
      const faqEmbed = createBaseEmbed({
        title: `❓ ${truncate(question, 250)}`,
        description: answer,
        color: SlickBotColors.PRIMARY,
        footer: `Category: ${category} • SlickBot FAQ`
      });

      const message = await channel.send({ embeds: [faqEmbed] });

      let thread = null;
      if (typeof message.startThread === 'function') {
        thread = await message.startThread({
          name: truncate(`💬 FAQ: ${question}`, 100),
          autoArchiveDuration: 1440,
          reason: 'SlickBot FAQ discussion thread'
        }).catch(() => null);

        if (thread) {
          const navPayload = buildFaqPostNavigationPayload({ guildId: guild.id, config, faqThread: thread });
          await thread.send(navPayload).catch(() => {});
        }
      }

      const res = await query(
        `INSERT INTO faq_entries (guild_id, question, answer, category, channel_id, message_id, thread_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [guild.id, question, answer, category, channel.id, message.id, thread?.id || null]
      );

      await this.refreshMasterPost({ guild, logger, actorUserId });
      return { ok: true, entry: res.rows[0], message, thread, isForum: false };
    }
  }

  async editFaqEntry({ guild, idOrQuestion, newQuestion, newAnswer, category = null, logger = null, actorUserId = null }) {
    let config = await this.getConfig(guild.id);
    if (!config?.forum_channel_id) return { ok: false, reason: 'FAQ is not configured. Run `/faq setup` first.' };

    const channel = await this.resolveChannel(guild, config);
    if (!channel) return { ok: false, reason: 'The configured FAQ channel could not be found.' };

    const isForum = channel.type === ChannelType.GuildForum;

    if (isForum) {
      const found = await this.findFaqThread(guild, idOrQuestion);
      if (!found?.thread) return { ok: false, reason: 'Could not find an FAQ post matching that question or thread ID.' };

      if (newQuestion) {
        await found.thread.setName(truncate(newQuestion, 100)).catch(() => {});
      }
      if (newAnswer) {
        const starter = await fetchStarterMessage(found.thread);
        if (starter) {
          await starter.edit({ content: newAnswer }).catch(() => {});
        }
      }
      await this.refreshMasterPost({ guild, logger, actorUserId });
      return { ok: true, thread: found.thread, isForum: true };
    } else {
      const entries = await this.getFaqEntries(guild.id);
      const needle = normalizeSearch(idOrQuestion);
      const entry = entries.find((e) => e.id === idOrQuestion || normalizeSearch(e.question) === needle || normalizeSearch(e.question).includes(needle));
      if (!entry) return { ok: false, reason: 'Could not find an FAQ entry matching that title or ID.' };

      const updatedQuestion = newQuestion || entry.question;
      const updatedAnswer = newAnswer || entry.answer;
      const updatedCategory = category || entry.category;

      if (entry.message_id && channel.messages?.fetch) {
        const msg = await channel.messages.fetch(entry.message_id).catch(() => null);
        if (msg) {
          const faqEmbed = createBaseEmbed({
            title: `❓ ${truncate(updatedQuestion, 250)}`,
            description: updatedAnswer,
            color: SlickBotColors.PRIMARY,
            footer: `Category: ${updatedCategory} • SlickBot FAQ`
          });
          await msg.edit({ embeds: [faqEmbed] }).catch(() => {});
        }
      }

      if (newQuestion && entry.thread_id) {
        const thread = await guild.channels.fetch(entry.thread_id).catch(() => null);
        if (thread) {
          await thread.setName(truncate(`💬 FAQ: ${updatedQuestion}`, 100)).catch(() => {});
        }
      }

      const res = await query(
        `UPDATE faq_entries
         SET question = $2, answer = $3, category = $4, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [entry.id, updatedQuestion, updatedAnswer, updatedCategory]
      );

      await this.refreshMasterPost({ guild, logger, actorUserId });
      return { ok: true, entry: res.rows[0], isForum: false };
    }
  }

  async findFaqThread(guild, questionOrThreadId) {
    const config = await this.getConfig(guild.id);
    if (!config?.forum_channel_id) return null;

    const channel = await this.resolveChannel(guild, config);
    if (channel?.type === ChannelType.GuildForum) {
      const posts = await this.getFaqPosts(guild, config);
      const raw = String(questionOrThreadId || '').trim();
      if (!raw) return null;
      const byId = posts.find((thread) => thread.id === raw);
      if (byId) return { thread: byId, config, isForum: true };
      const needle = normalizeSearch(raw);
      if (!needle) return null;
      const exact = posts.find((thread) => normalizeSearch(thread.name) === needle);
      if (exact) return { thread: exact, config, isForum: true };
      const contains = posts.find((thread) => normalizeSearch(thread.name).includes(needle) || needle.includes(normalizeSearch(thread.name)));
      return contains ? { thread: contains, config, isForum: true } : null;
    } else {
      const entries = await this.getFaqEntries(guild.id);
      const raw = String(questionOrThreadId || '').trim();
      if (!raw) return null;
      const byId = entries.find((e) => e.id === raw);
      if (byId) return { entry: byId, config, isForum: false };
      const needle = normalizeSearch(raw);
      if (!needle) return null;
      const exact = entries.find((e) => normalizeSearch(e.question) === needle);
      if (exact) return { entry: exact, config, isForum: false };
      const contains = entries.find((e) => normalizeSearch(e.question).includes(needle) || needle.includes(normalizeSearch(e.question)));
      return contains ? { entry: contains, config, isForum: false } : null;
    }
  }

  async autocomplete(guild, focusedValue) {
    const config = await this.getConfig(guild.id).catch(() => null);
    if (!config?.forum_channel_id) return [];
    const channel = await this.resolveChannel(guild, config).catch(() => null);
    const needle = normalizeSearch(focusedValue);

    if (channel?.type === ChannelType.GuildForum) {
      const posts = await this.getFaqPosts(guild, config).catch(() => []);
      return posts
        .filter((thread) => !needle || normalizeSearch(thread.name).includes(needle))
        .slice(0, 25)
        .map((thread) => ({ name: truncate(thread.name, 100), value: thread.id }));
    } else {
      const entries = await this.getFaqEntries(guild.id).catch(() => []);
      return entries
        .filter((entry) => !needle || normalizeSearch(entry.question).includes(needle))
        .slice(0, 25)
        .map((entry) => ({ name: truncate(entry.question, 100), value: entry.id }));
    }
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
    if (!found) return { ok: false, reason: 'No matching FAQ was found in the configured FAQ channel.' };
    const targetUserId = targetUser?.id || targetMessage?.author?.id || null;
    const payload = buildFaqAnswerPayload({
      thread: found.thread || null,
      entry: found.entry || null,
      guildId: guild.id,
      targetUserId,
      ticketChannelId: found.config.ticket_channel_id
    });
    let message;
    if (targetMessage && typeof targetMessage.reply === 'function') message = await targetMessage.reply(payload);
    else message = await channel.send(payload);
    const title = found.thread ? found.thread.name : found.entry?.question || 'FAQ';
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'faq-answer',
      title: 'FAQ Answer Sent',
      body: `FAQ: ${title}\nChannel: <#${message.channelId}>${targetUserId ? `\nTarget: <@${targetUserId}>` : ''}`,
      actorUserId: actorUser?.id || null,
      metadata: { faqThreadId: found.thread?.id || found.entry?.thread_id || null, targetUserId, messageId: message.id }
    }).catch(() => {});
    return { ok: true, thread: found.thread || null, entry: found.entry || null, message, config: found.config };
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
    const moduleCfg = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'FAQ' LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const faqEnabled = moduleCfg.rows[0]?.enabled ?? true;

    return {
      embeds: [embed],
      components: [
        createButtonRow([
          createPanelButton(`${CustomIds.OnboardingModulePrefix}FAQ`, 'Quick Setup', ButtonStyle.Success, '🚀'),
          createPanelButton(`${CustomIds.ModuleTogglePrefix}FAQ`, faqEnabled ? 'Disable Module' : 'Enable Module', faqEnabled ? ButtonStyle.Danger : ButtonStyle.Success, faqEnabled ? '⏸️' : '▶️'),
          createPanelButton(CustomIds.FaqRefreshIndex, 'Sync Master Post', ButtonStyle.Primary, '🔄')
        ]),
        createButtonRow([
          createPanelButton(CustomIds.FaqRefresh, 'Refresh', ButtonStyle.Secondary, '📋'),
          createPanelButton(CustomIds.SetupCategoryCommunity, 'Community', ButtonStyle.Primary, '✨'),
          createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
        ])
      ]
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
