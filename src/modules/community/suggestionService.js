const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { query, pool } = require('../../services/db');
const { createBaseEmbed, createButtonRow, createPanelButton, createLinkButton, SlickBotColors, withPanelHeaderImage } = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

const DEFAULT_PANEL_TITLE = 'Server Suggestions';
const DEFAULT_PANEL_DESCRIPTION = 'Have an idea for the server? Submit a suggestion below. Staff will review suggestions and update their status when a decision is made.';
const DEFAULT_CATEGORIES = ['Server', 'Discord', 'Stream', 'Events', 'Bot', 'Other'];
const ANONYMOUS_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

const SUGGESTION_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  PLANNED: 'PLANNED',
  ACCEPTED: 'ACCEPTED',
  DENIED: 'DENIED',
  IMPLEMENTED: 'IMPLEMENTED'
});

const STATUS_LABELS = Object.freeze({
  PENDING: 'Pending Review',
  PLANNED: 'Planned',
  ACCEPTED: 'Accepted',
  DENIED: 'Denied',
  IMPLEMENTED: 'Implemented'
});

const STATUS_COLORS = Object.freeze({
  PENDING: SlickBotColors.INFO,
  PLANNED: 0x8b5cf6,
  ACCEPTED: SlickBotColors.SUCCESS,
  DENIED: SlickBotColors.ERROR,
  IMPLEMENTED: 0x2dd4bf
});

const FINAL_STATUSES = new Set([SUGGESTION_STATUSES.ACCEPTED, SUGGESTION_STATUSES.DENIED, SUGGESTION_STATUSES.IMPLEMENTED]);
const INDEX_FILTERS = ['PENDING', 'PLANNED', 'ACCEPTED', 'DENIED', 'IMPLEMENTED', 'ALL'];

function truncate(value, max = 1024) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeCategory(value) {
  return truncate(String(value || '').replace(/\s+/g, ' '), 80);
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  if (SUGGESTION_STATUSES[raw]) return raw;
  if (raw === 'APPROVED') return SUGGESTION_STATUSES.ACCEPTED;
  return null;
}

function normalizeIndexFilter(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  if (raw === 'ALL') return 'ALL';
  return normalizeStatus(raw) || SUGGESTION_STATUSES.PENDING;
}

function messageUrl(guildId, channelId, messageId) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function channelUrl(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 1)) * 100);
}

function defaultAvatarForUser(user) {
  if (!user) return null;
  if (typeof user.displayAvatarURL === 'function') return user.displayAvatarURL({ size: 128 });
  return null;
}

function isAnonymousValue(value) {
  return value === true || value === 'true';
}

function isVotingOpenStatus(status) {
  const normalized = normalizeStatus(status) || SUGGESTION_STATUSES.PENDING;
  return !FINAL_STATUSES.has(normalized);
}

function formatDate(value) {
  const timestamp = value ? Math.floor(new Date(value).getTime() / 1000) : null;
  return timestamp ? `<t:${timestamp}:f>` : 'Unknown time';
}

function statusLine(status) {
  const normalized = normalizeStatus(status) || SUGGESTION_STATUSES.PENDING;
  return STATUS_LABELS[normalized] || normalized;
}

function buildSuggestionEmbed({ suggestion, votes, submitter = null }) {
  const up = Number(votes?.upvotes || 0);
  const down = Number(votes?.downvotes || 0);
  const total = up + down;
  const anonymous = isAnonymousValue(suggestion.anonymous);
  const status = normalizeStatus(suggestion.status) || SUGGESTION_STATUSES.PENDING;
  const authorName = anonymous ? 'Anonymous Suggested' : `${submitter?.globalName || submitter?.username || 'Member'} Suggested`;
  const thumbnail = anonymous ? ANONYMOUS_AVATAR_URL : defaultAvatarForUser(submitter);

  const embed = createBaseEmbed({
    title: truncate(suggestion.title || 'Suggestion', 256),
    description: truncate(suggestion.description || 'No description provided.', 4000),
    color: STATUS_COLORS[status] || SlickBotColors.INFO,
    footer: `SlickBot Suggestions • Suggestion #${suggestion.suggestion_number || '—'}`
  });

  embed.setAuthor({ name: authorName });
  if (thumbnail) embed.setThumbnail(thumbnail);

  embed.addFields(
    { name: 'Status', value: `**${statusLine(status)}**`, inline: true },
    { name: 'Category', value: suggestion.category_name ? `**${suggestion.category_name}**` : '**Other**', inline: true },
    { name: 'Votes', value: `✅ **${up}** (${percent(up, total)}%) · ❌ **${down}** (${percent(down, total)}%) · Total: **${total}**`, inline: false }
  );

  return embed;
}

function buildSuggestionRevisionEmbed({ suggestion, notes = [] }) {
  const lines = notes
    .slice(0, 15)
    .map((note) => {
      const noteStatus = normalizeStatus(note.status);
      const label = noteStatus ? `**${STATUS_LABELS[noteStatus] || noteStatus}**` : '**Staff Note**';
      return `${formatDate(note.created_at)} · <@${note.author_user_id}> · ${label}\n${truncate(note.note_text, 360)}`;
    });

  if (!lines.length && !suggestion.staff_response) return null;

  const description = [
    suggestion.staff_response ? `**Latest Staff Response**\n${truncate(suggestion.staff_response, 700)}` : null,
    lines.length ? `**Revision History**\n${lines.join('\n\n')}` : null
  ].filter(Boolean).join('\n\n');

  return createBaseEmbed({
    title: 'Suggestion Review Updates',
    description: truncate(description, 4000),
    color: SlickBotColors.MUTED,
    footer: 'SlickBot Suggestions'
  });
}

function buildSuggestionComponents(suggestion, votes) {
  const status = normalizeStatus(suggestion.status) || SUGGESTION_STATUSES.PENDING;
  if (!isVotingOpenStatus(status)) return [];
  const up = Number(votes?.upvotes || 0);
  const down = Number(votes?.downvotes || 0);
  const total = up + down;
  const id = suggestion.id;
  return [createButtonRow([
    new ButtonBuilder().setCustomId(`${CustomIds.SuggestionVoteTotalPrefix}${id}`).setLabel(String(total)).setStyle(ButtonStyle.Secondary).setDisabled(true),
    createPanelButton(`${CustomIds.SuggestionVoteUpPrefix}${id}`, String(up), ButtonStyle.Success, '✅'),
    createPanelButton(`${CustomIds.SuggestionVoteDownPrefix}${id}`, String(down), ButtonStyle.Danger, '❌')
  ])];
}

function buildSuggestionPayload({ suggestion, votes, submitter, notes }) {
  const embeds = [buildSuggestionEmbed({ suggestion, votes, submitter })];
  const revision = buildSuggestionRevisionEmbed({ suggestion, notes });
  if (revision) embeds.push(revision);
  return { embeds, components: buildSuggestionComponents(suggestion, votes) };
}

function buildPanelPayload(config) {
  const embed = createBaseEmbed({
    title: config?.panel_title || DEFAULT_PANEL_TITLE,
    description: config?.panel_description || DEFAULT_PANEL_DESCRIPTION,
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Suggestions'
  });
  const payload = {
    embeds: [embed],
    components: [createButtonRow([createPanelButton(CustomIds.SuggestionSubmitOpen, 'Submit Suggestion', ButtonStyle.Primary)])]
  };
  return withPanelHeaderImage(payload, config?.panel_header_image_url || null);
}

function buildReviewComponents(suggestion) {
  const id = suggestion.id;
  const status = normalizeStatus(suggestion.status) || SUGGESTION_STATUSES.PENDING;
  const statusButton = (target, label) => new ButtonBuilder()
    .setCustomId(`${CustomIds.SuggestionReviewStatusPrefix}${id}:${target}`)
    .setLabel(label)
    .setStyle(status === target ? ButtonStyle.Success : ButtonStyle.Secondary);

  const rows = [
    new ActionRowBuilder().addComponents(
      statusButton('PENDING', 'Pending'),
      statusButton('PLANNED', 'Planned'),
      statusButton('ACCEPTED', 'Accepted'),
      statusButton('DENIED', 'Denied'),
      statusButton('IMPLEMENTED', 'Implemented')
    ),
    new ActionRowBuilder().addComponents(
      createPanelButton(`${CustomIds.SuggestionReviewAddDetailsPrefix}${id}`, 'Add Details', ButtonStyle.Primary),
      createPanelButton(`${CustomIds.SuggestionReviewRevealPrefix}${id}`, 'Reveal Submitter', ButtonStyle.Secondary)
    )
  ];

  if (suggestion.message_channel_id && suggestion.message_id) {
    rows[1].addComponents(createLinkButton(messageUrl(suggestion.guild_id, suggestion.message_channel_id, suggestion.message_id), 'Open Public Suggestion'));
  }

  return rows;
}

function buildReviewPayload({ suggestion, votes, notes }) {
  const up = Number(votes?.upvotes || 0);
  const down = Number(votes?.downvotes || 0);
  const total = up + down;
  const publicUrl = suggestion.message_channel_id && suggestion.message_id ? messageUrl(suggestion.guild_id, suggestion.message_channel_id, suggestion.message_id) : null;
  const reviewStatus = statusLine(suggestion.status);
  const latestNote = notes[notes.length - 1];

  const embed = createBaseEmbed({
    title: `Suggestion #${suggestion.suggestion_number} Review`,
    description: [
      `**${truncate(suggestion.title, 240)}**`,
      '',
      truncate(suggestion.description, 1400),
      '',
      `Status: **${reviewStatus}**`,
      `Category: **${suggestion.category_name || 'Other'}**`,
      `Submitter: <@${suggestion.submitter_user_id}>${suggestion.anonymous ? ' · Publicly anonymous' : ''}`,
      `Votes: ✅ **${up}** (${percent(up, total)}%) · ❌ **${down}** (${percent(down, total)}%) · Total: **${total}**`,
      suggestion.thread_id ? `Discussion Thread: <#${suggestion.thread_id}>` : null,
      publicUrl ? `[Open Public Suggestion](${publicUrl})` : null,
      latestNote ? `\n**Latest Review Note**\n${formatDate(latestNote.created_at)} · <@${latestNote.author_user_id}>: ${truncate(latestNote.note_text, 500)}` : null
    ].filter(Boolean).join('\n'),
    color: STATUS_COLORS[normalizeStatus(suggestion.status) || 'PENDING'] || SlickBotColors.INFO,
    footer: 'SlickBot Suggestions Review'
  });

  return { embeds: [embed], components: buildReviewComponents(suggestion) };
}

function buildReviewIndexPayload(index, suggestions = []) {
  const filter = normalizeIndexFilter(index?.status_filter || 'PENDING');
  const visible = suggestions.slice(0, 20);
  const lines = visible.length ? visible.map((suggestion) => {
    const reviewUrl = suggestion.review_channel_id && suggestion.review_message_id ? messageUrl(suggestion.guild_id, suggestion.review_channel_id, suggestion.review_message_id) : null;
    const publicUrl = suggestion.message_channel_id && suggestion.message_id ? messageUrl(suggestion.guild_id, suggestion.message_channel_id, suggestion.message_id) : null;
    const status = statusLine(suggestion.status);
    const author = suggestion.anonymous ? 'Anonymous' : `<@${suggestion.submitter_user_id}>`;
    return `• **#${suggestion.suggestion_number}** · ${status} · ${suggestion.category_name || 'Other'} · ${author} · ${formatDate(suggestion.created_at)}\n  ${reviewUrl ? `[Open Review](${reviewUrl})` : 'Review message unavailable'}${publicUrl ? ` · [Public Post](${publicUrl})` : ''}`;
  }).join('\n') : `No ${filter === 'ALL' ? 'suggestions' : statusLine(filter).toLowerCase()} found for this index.`;

  const embed = createBaseEmbed({
    title: 'Server Suggestions - Review Filter',
    description: [
      `**Current Filter:** ${filter === 'ALL' ? 'All Suggestions' : `${statusLine(filter)} Suggestions`}`,
      '',
      lines,
      suggestions.length > visible.length ? `\nShowing **${visible.length}/${suggestions.length}** suggestions. Use the review channel search or change filters for more.` : null,
      '',
      'This index refreshes when suggestions are submitted, reviewed, updated, or filtered.'
    ].filter(Boolean).join('\n'),
    color: filter === 'ALL' ? SlickBotColors.INFO : STATUS_COLORS[filter] || SlickBotColors.INFO,
    footer: 'SlickBot Suggestions'
  });

  const makeButton = (status, label) => new ButtonBuilder()
    .setCustomId(`${CustomIds.SuggestionReviewIndexFilterPrefix}${index.id}:${status}`)
    .setLabel(label)
    .setStyle(filter === status ? ButtonStyle.Success : ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        makeButton('PENDING', 'Pending'),
        makeButton('PLANNED', 'Planned'),
        makeButton('ACCEPTED', 'Accepted'),
        makeButton('DENIED', 'Denied')
      ),
      new ActionRowBuilder().addComponents(
        makeButton('IMPLEMENTED', 'Implemented'),
        makeButton('ALL', 'All')
      )
    ]
  };
}

function formatCounts(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `• ${key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}: **${value}**`)
    .join('\n');
}

class SuggestionService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM suggestion_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async ensureConfig(guildId) {
    const result = await query(
      `INSERT INTO suggestion_configs (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO NOTHING
       RETURNING *`,
      [guildId]
    );
    const config = result.rows[0] || await this.getConfig(guildId);
    await this.ensureDefaultCategories(guildId);
    return config;
  }

  async ensureDefaultCategories(guildId) {
    for (let index = 0; index < DEFAULT_CATEGORIES.length; index += 1) {
      await query(
        `INSERT INTO suggestion_categories (guild_id, name, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, name) DO UPDATE SET active = true, sort_order = EXCLUDED.sort_order, updated_at = NOW()`,
        [guildId, DEFAULT_CATEGORIES[index], index + 1]
      );
    }
  }

  async setup({ guildId, channelId, reviewChannelId = undefined, logChannelId = undefined, defaultAnonymous = undefined, autoCreateThreads = undefined }) {
    const current = await this.ensureConfig(guildId);
    const result = await query(
      `INSERT INTO suggestion_configs (guild_id, channel_id, review_channel_id, log_channel_id, default_anonymous, auto_create_threads)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id) DO UPDATE SET
         channel_id = COALESCE(EXCLUDED.channel_id, suggestion_configs.channel_id),
         review_channel_id = CASE WHEN $3::text IS NULL THEN suggestion_configs.review_channel_id ELSE EXCLUDED.review_channel_id END,
         log_channel_id = CASE WHEN $4::text IS NULL THEN suggestion_configs.log_channel_id ELSE EXCLUDED.log_channel_id END,
         default_anonymous = COALESCE(EXCLUDED.default_anonymous, suggestion_configs.default_anonymous),
         auto_create_threads = COALESCE(EXCLUDED.auto_create_threads, suggestion_configs.auto_create_threads),
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        channelId || current?.channel_id || null,
        reviewChannelId === undefined ? null : reviewChannelId,
        logChannelId === undefined ? null : logChannelId,
        defaultAnonymous === undefined ? null : defaultAnonymous,
        autoCreateThreads === undefined ? null : autoCreateThreads
      ]
    );
    await this.ensureDefaultCategories(guildId);
    return result.rows[0];
  }

  async setPanelDesign({ guildId, title, description, headerImageUrl, clearHeader = false }) {
    await this.ensureConfig(guildId);
    const current = await this.getConfig(guildId);
    const result = await query(
      `UPDATE suggestion_configs
       SET panel_title = COALESCE($2, panel_title),
           panel_description = COALESCE($3, panel_description),
           panel_header_image_url = CASE WHEN $5 = true THEN NULL ELSE COALESCE($4, panel_header_image_url) END,
           updated_at = NOW()
       WHERE guild_id = $1
       RETURNING *`,
      [guildId, title || null, description || null, headerImageUrl || null, clearHeader]
    );
    return result.rows[0] || current;
  }

  async listCategories(guildId) {
    await this.ensureDefaultCategories(guildId);
    const result = await query(`SELECT * FROM suggestion_categories WHERE guild_id = $1 AND active = true ORDER BY sort_order ASC, name ASC`, [guildId]);
    return result.rows;
  }

  async addCategory(guildId, name) {
    const normalized = normalizeCategory(name);
    if (!normalized) throw new Error('Category name is required.');
    const count = await query(`SELECT COALESCE(MAX(sort_order), 0)::int AS max FROM suggestion_categories WHERE guild_id = $1`, [guildId]);
    const result = await query(
      `INSERT INTO suggestion_categories (guild_id, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, name) DO UPDATE SET active = true, updated_at = NOW()
       RETURNING *`,
      [guildId, normalized, Number(count.rows[0]?.max || 0) + 1]
    );
    return result.rows[0];
  }

  async removeCategory(guildId, name) {
    const normalized = normalizeCategory(name);
    const result = await query(`UPDATE suggestion_categories SET active = false, updated_at = NOW() WHERE guild_id = $1 AND LOWER(name) = LOWER($2) RETURNING *`, [guildId, normalized]);
    return result.rows[0] || null;
  }

  async resolveCategory(guildId, categoryName) {
    await this.ensureDefaultCategories(guildId);
    const raw = normalizeCategory(categoryName || 'Other');
    let result = await query(`SELECT * FROM suggestion_categories WHERE guild_id = $1 AND active = true AND LOWER(name) = LOWER($2) LIMIT 1`, [guildId, raw]);
    if (result.rows[0]) return result.rows[0];
    result = await query(`SELECT * FROM suggestion_categories WHERE guild_id = $1 AND active = true AND LOWER(name) = LOWER('Other') LIMIT 1`, [guildId]);
    return result.rows[0] || await this.addCategory(guildId, 'Other');
  }

  async autocompleteCategories(guildId, focused) {
    const needle = String(focused || '').toLowerCase();
    const categories = await this.listCategories(guildId).catch(() => []);
    return categories
      .filter((category) => !needle || category.name.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((category) => ({ name: category.name, value: category.name }));
  }

  async nextSuggestionNumber(client, guildId) {
    const result = await client.query(
      `UPDATE suggestion_configs
       SET next_suggestion_number = next_suggestion_number + 1, updated_at = NOW()
       WHERE guild_id = $1
       RETURNING next_suggestion_number - 1 AS number`,
      [guildId]
    );
    return Number(result.rows[0]?.number || 1);
  }

  async getVotes(suggestionId) {
    const result = await query(
      `SELECT
        COUNT(*) FILTER (WHERE vote_type = 'UP')::int AS upvotes,
        COUNT(*) FILTER (WHERE vote_type = 'DOWN')::int AS downvotes
       FROM suggestion_votes WHERE suggestion_id = $1`,
      [suggestionId]
    );
    return result.rows[0] || { upvotes: 0, downvotes: 0 };
  }

  async getNotes(suggestionId, order = 'ASC') {
    const direction = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const result = await query(`SELECT * FROM suggestion_notes WHERE suggestion_id = $1 ORDER BY created_at ${direction}, id ${direction} LIMIT 15`, [suggestionId]);
    return result.rows;
  }

  async getSuggestionByNumber(guildId, numberOrId) {
    const raw = String(numberOrId || '').trim().replace(/^#/, '');
    const result = await query(
      `SELECT * FROM suggestions WHERE guild_id = $1 AND (id = $2 OR suggestion_number::text = $2) LIMIT 1`,
      [guildId, raw]
    );
    return result.rows[0] || null;
  }

  async postSuggestionMessage({ guild, suggestion, submitter }) {
    const config = await this.getConfig(guild.id);
    if (!config?.channel_id) throw new Error('Suggestion channel is not configured.');
    const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased?.()) throw new Error('Configured suggestion channel could not be found.');
    const votes = await this.getVotes(suggestion.id);
    const notes = await this.getNotes(suggestion.id);
    const message = await channel.send(buildSuggestionPayload({ suggestion, votes, submitter, notes }));
    let thread = null;
    if (config.auto_create_threads !== false && typeof message.startThread === 'function') {
      thread = await message.startThread({ name: `Suggestion #${suggestion.suggestion_number} - ${truncate(suggestion.title, 60)}`, reason: 'SlickBot suggestion discussion thread' }).catch(() => null);
    }
    const updated = await query(
      `UPDATE suggestions SET message_channel_id = $2, message_id = $3, thread_id = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [suggestion.id, message.channelId, message.id, thread?.id || null]
    );
    return { suggestion: updated.rows[0], message, thread };
  }

  async postReviewMessage({ guild, suggestion }) {
    const config = await this.getConfig(guild.id);
    if (!config?.review_channel_id) return { ok: false, reason: 'Suggestion review channel is not configured.' };
    const channel = await guild.channels.fetch(config.review_channel_id).catch(() => null);
    if (!channel?.send) return { ok: false, reason: 'Configured suggestion review channel could not be found.' };
    const votes = await this.getVotes(suggestion.id);
    const notes = await this.getNotes(suggestion.id);
    const sent = await channel.send(buildReviewPayload({ suggestion, votes, notes })).catch(() => null);
    if (!sent) return { ok: false, reason: 'Could not send review message.' };
    const updated = await query(`UPDATE suggestions SET review_channel_id = $2, review_message_id = $3, updated_at = NOW() WHERE id = $1 RETURNING *`, [suggestion.id, channel.id, sent.id]);
    return { ok: true, suggestion: updated.rows[0], message: sent };
  }

  async refreshReviewMessage(guild, suggestion, { createIfMissing = false } = {}) {
    let current = suggestion;
    if (!current?.id) return false;
    if (!current.review_channel_id || !current.review_message_id) {
      if (!createIfMissing) return false;
      const posted = await this.postReviewMessage({ guild, suggestion: current });
      return posted.ok;
    }
    const channel = await guild.channels.fetch(current.review_channel_id).catch(() => null);
    const message = channel?.messages?.fetch ? await channel.messages.fetch(current.review_message_id).catch(() => null) : null;
    if (!message) {
      if (!createIfMissing) return false;
      const posted = await this.postReviewMessage({ guild, suggestion: current });
      return posted.ok;
    }
    const votes = await this.getVotes(current.id);
    const notes = await this.getNotes(current.id);
    await message.edit(buildReviewPayload({ suggestion: current, votes, notes })).catch(() => {});
    return true;
  }

  async submitSuggestion({ guild, user, title, description, categoryName, anonymous = undefined, client = null, logger = null }) {
    const config = await this.ensureConfig(guild.id);
    if (!config.channel_id) return { ok: false, reason: 'Suggestions are not configured yet. Staff need to run `/suggestion setup` first.' };
    const category = await this.resolveCategory(guild.id, categoryName);
    const isAnonymous = anonymous === undefined || anonymous === null ? config.default_anonymous !== false : Boolean(anonymous);
    const dbClient = await pool.connect();
    let suggestion;
    try {
      await dbClient.query('BEGIN');
      await dbClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`suggestions:${guild.id}`]);
      const number = await this.nextSuggestionNumber(dbClient, guild.id);
      const inserted = await dbClient.query(
        `INSERT INTO suggestions (guild_id, suggestion_number, submitter_user_id, anonymous, title, description, category_id, category_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [guild.id, number, user.id, isAnonymous, truncate(title, 120), truncate(description, 4000), category.id, category.name]
      );
      suggestion = inserted.rows[0];
      await dbClient.query('COMMIT');
    } catch (error) {
      await dbClient.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      dbClient.release();
    }

    const posted = await this.postSuggestionMessage({ guild, suggestion, submitter: user });
    await this.postReviewMessage({ guild, suggestion: posted.suggestion }).catch(() => {});
    const refreshed = await this.getSuggestionByNumber(guild.id, posted.suggestion.id).catch(() => posted.suggestion);
    await this.repostPanel(client || guild.client, guild.id).catch(() => {});
    await this.refreshReviewIndexes({ client: client || guild.client, guildId: guild.id }).catch(() => {});
    await this.sendSuggestionLog({ guild, config, suggestion: refreshed || posted.suggestion, action: 'New Suggestion Submitted', actorUserId: user.id, logger }).catch(() => {});
    await logger?.log?.({
      guildId: guild.id,
      eventKey: 'suggestion-submit',
      title: 'Suggestion Submitted',
      body: `Suggestion #${posted.suggestion.suggestion_number}: [${posted.suggestion.title}](${messageUrl(guild.id, posted.suggestion.message_channel_id, posted.suggestion.message_id)})${posted.suggestion.anonymous ? '\nPublic Author: Anonymous' : `\nAuthor: <@${user.id}>`}`,
      actorUserId: user.id,
      metadata: { suggestionId: posted.suggestion.id, suggestionNumber: posted.suggestion.suggestion_number }
    }).catch(() => {});
    return { ok: true, suggestion: refreshed || posted.suggestion, message: posted.message, thread: posted.thread };
  }

  buildSubmitModal(guildId) {
    return new ModalBuilder()
      .setCustomId(`${CustomIds.SuggestionSubmitModalPrefix}${guildId}`)
      .setTitle('Submit Suggestion')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Suggestion Title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Suggestion Description').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('category').setLabel('Category').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('Server, Discord, Stream, Events, Bot, Other')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('anonymous').setLabel('Anonymous? yes/no, blank = server default').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('yes'))
      );
  }

  buildDetailsModal(suggestionId, status = null) {
    const normalizedStatus = status ? normalizeStatus(status) : null;
    return new ModalBuilder()
      .setCustomId(`${CustomIds.SuggestionReviewDetailsModalPrefix}${suggestionId}${normalizedStatus ? `:${normalizedStatus}` : ''}`)
      .setTitle(normalizedStatus ? `Set ${STATUS_LABELS[normalizedStatus] || normalizedStatus}` : 'Add Suggestion Details')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('details')
            .setLabel(normalizedStatus ? 'Optional review details' : 'Review details')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(!normalizedStatus)
            .setMaxLength(1000)
            .setPlaceholder(normalizedStatus ? 'Optional. This will be added to the suggestion revision history.' : 'Add the staff note or revision details.')
        )
      );
  }

  parseAnonymousInput(raw, defaultValue = true) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return defaultValue;
    if (['yes', 'y', 'true', 'anonymous', 'anon', '1'].includes(value)) return true;
    if (['no', 'n', 'false', 'public', '0'].includes(value)) return false;
    return defaultValue;
  }

  async refreshSuggestionMessage(guild, suggestion) {
    if (!suggestion?.message_channel_id || !suggestion?.message_id) return false;
    const channel = await guild.channels.fetch(suggestion.message_channel_id).catch(() => null);
    const message = channel?.messages?.fetch ? await channel.messages.fetch(suggestion.message_id).catch(() => null) : null;
    if (!message) return false;
    const submitter = suggestion.anonymous ? null : await guild.client.users.fetch(suggestion.submitter_user_id).catch(() => null);
    const votes = await this.getVotes(suggestion.id);
    const notes = await this.getNotes(suggestion.id);
    await message.edit(buildSuggestionPayload({ suggestion, votes, submitter, notes })).catch(() => {});
    return true;
  }

  async vote({ guild, suggestionId, user, voteType }) {
    const suggestion = await query(`SELECT * FROM suggestions WHERE id = $1 AND guild_id = $2 LIMIT 1`, [suggestionId, guild.id]).then((r) => r.rows[0] || null);
    if (!suggestion) return { ok: false, reason: 'Suggestion not found.' };
    if (!isVotingOpenStatus(suggestion.status)) return { ok: false, reason: `Voting is closed because this suggestion is ${statusLine(suggestion.status).toLowerCase()}.` };
    const current = await query(`SELECT vote_type FROM suggestion_votes WHERE suggestion_id = $1 AND user_id = $2 LIMIT 1`, [suggestionId, user.id]);
    const existing = current.rows[0]?.vote_type || null;
    if (existing === voteType) {
      await query(`DELETE FROM suggestion_votes WHERE suggestion_id = $1 AND user_id = $2`, [suggestionId, user.id]);
    } else {
      await query(
        `INSERT INTO suggestion_votes (guild_id, suggestion_id, user_id, vote_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (suggestion_id, user_id) DO UPDATE SET vote_type = EXCLUDED.vote_type, updated_at = NOW()`,
        [guild.id, suggestionId, user.id, voteType]
      );
    }
    await this.refreshSuggestionMessage(guild, suggestion);
    await this.refreshReviewMessage(guild, suggestion).catch(() => {});
    return { ok: true, removed: existing === voteType, suggestion };
  }

  async updateStatus({ guild, suggestionNumber, status, response, actorUser, logger }) {
    const normalized = normalizeStatus(status);
    if (!normalized) return { ok: false, reason: 'Invalid status. Use Pending, Planned, Accepted, Denied, or Implemented.' };
    const suggestion = await this.getSuggestionByNumber(guild.id, suggestionNumber);
    if (!suggestion) return { ok: false, reason: 'Suggestion not found.' };
    const result = await query(
      `UPDATE suggestions SET status = $3, staff_response = COALESCE($4, staff_response), reviewed_by_user_id = $5, reviewed_at = NOW(), updated_at = NOW()
       WHERE guild_id = $1 AND id = $2 RETURNING *`,
      [guild.id, suggestion.id, normalized, response || null, actorUser.id]
    );
    const updated = result.rows[0];
    await query(
      `INSERT INTO suggestion_notes (guild_id, suggestion_id, author_user_id, status, note_text)
       VALUES ($1, $2, $3, $4, $5)`,
      [guild.id, suggestion.id, actorUser.id, normalized, response || `Status changed to ${STATUS_LABELS[normalized] || normalized}.`]
    );
    await this.refreshSuggestionMessage(guild, updated);
    await this.refreshReviewMessage(guild, updated, { createIfMissing: true }).catch(() => {});
    await this.refreshReviewIndexes({ client: guild.client, guildId: guild.id }).catch(() => {});
    await this.sendSuggestionLog({ guild, suggestion: updated, action: `Suggestion ${STATUS_LABELS[normalized] || normalized}`, actorUserId: actorUser.id, logger }).catch(() => {});
    await logger?.log?.({ guildId: guild.id, eventKey: 'suggestion-review', title: `Suggestion ${STATUS_LABELS[normalized] || normalized}`, body: `Suggestion #${updated.suggestion_number}: ${updated.title}`, actorUserId: actorUser.id, metadata: { suggestionId: updated.id, status: normalized } }).catch(() => {});
    return { ok: true, suggestion: updated };
  }

  async addDetails({ guild, suggestionNumber, details, actorUser, logger }) {
    const suggestion = await this.getSuggestionByNumber(guild.id, suggestionNumber);
    if (!suggestion) return { ok: false, reason: 'Suggestion not found.' };
    await query(`INSERT INTO suggestion_notes (guild_id, suggestion_id, author_user_id, status, note_text) VALUES ($1, $2, $3, $4, $5)`, [guild.id, suggestion.id, actorUser.id, suggestion.status, truncate(details, 1000)]);
    const result = await query(`UPDATE suggestions SET updated_at = NOW() WHERE id = $1 RETURNING *`, [suggestion.id]);
    const updated = result.rows[0] || suggestion;
    await this.refreshSuggestionMessage(guild, updated);
    await this.refreshReviewMessage(guild, updated, { createIfMissing: true }).catch(() => {});
    await this.refreshReviewIndexes({ client: guild.client, guildId: guild.id }).catch(() => {});
    await logger?.log?.({ guildId: guild.id, eventKey: 'suggestion-note', title: 'Suggestion Details Added', body: `Suggestion #${suggestion.suggestion_number}: ${suggestion.title}`, actorUserId: actorUser.id, metadata: { suggestionId: suggestion.id } }).catch(() => {});
    return { ok: true, suggestion: updated };
  }

  async postPanel({ guild, channel, title, description, headerImageUrl }) {
    const config = await this.setPanelDesign({ guildId: guild.id, title, description, headerImageUrl });
    const message = await channel.send(buildPanelPayload(config));
    const result = await query(
      `UPDATE suggestion_configs SET panel_channel_id = $2, panel_message_id = $3, panel_active = true, updated_at = NOW() WHERE guild_id = $1 RETURNING *`,
      [guild.id, channel.id, message.id]
    );
    return { config: result.rows[0], message };
  }

  async refreshPanel(client, guildId) {
    const config = await this.getConfig(guildId);
    if (!config?.panel_active || !config.panel_channel_id || !config.panel_message_id) return 0;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const channel = guild ? await guild.channels.fetch(config.panel_channel_id).catch(() => null) : null;
    const message = channel?.messages?.fetch ? await channel.messages.fetch(config.panel_message_id).catch(() => null) : null;
    if (!message) {
      await query(`UPDATE suggestion_configs SET panel_active = false, updated_at = NOW() WHERE guild_id = $1`, [guildId]);
      return 0;
    }
    await message.edit(buildPanelPayload(config));
    return 1;
  }

  async repostPanel(client, guildId) {
    const config = await this.getConfig(guildId);
    if (!config?.panel_active || !config.panel_channel_id) return 0;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const channel = guild ? await guild.channels.fetch(config.panel_channel_id).catch(() => null) : null;
    if (!channel?.send) return 0;
    if (config.panel_message_id && channel.messages?.fetch) {
      const oldMessage = await channel.messages.fetch(config.panel_message_id).catch(() => null);
      await oldMessage?.delete?.().catch(() => {});
    }
    const message = await channel.send(buildPanelPayload(config));
    await query(`UPDATE suggestion_configs SET panel_message_id = $2, updated_at = NOW() WHERE guild_id = $1`, [guildId, message.id]);
    return 1;
  }

  async sendSuggestionLog({ guild, config = null, suggestion, action, actorUserId = null, logger = null }) {
    const cfg = config || await this.getConfig(guild.id);
    if (!cfg?.log_channel_id) return null;
    const channel = await guild.channels.fetch(cfg.log_channel_id).catch(() => null);
    if (!channel?.send) return null;
    const embed = createBaseEmbed({
      title: action,
      description: [
        `Suggestion: **#${suggestion.suggestion_number}** — ${suggestion.title}`,
        suggestion.message_id ? `[Open Suggestion](${messageUrl(guild.id, suggestion.message_channel_id, suggestion.message_id)})` : null,
        suggestion.review_message_id ? `[Open Review](${messageUrl(guild.id, suggestion.review_channel_id, suggestion.review_message_id)})` : null,
        `Submitter: <@${suggestion.submitter_user_id}>`,
        `Public Author: **${suggestion.anonymous ? 'Anonymous' : 'Visible'}**`,
        actorUserId ? `Actor: <@${actorUserId}>` : null
      ].filter(Boolean).join('\n'),
      color: SlickBotColors.INFO,
      footer: 'SlickBot Suggestions'
    });
    return channel.send({ embeds: [embed] }).catch(() => null);
  }

  async createReviewIndex({ guildId, channelId, statusFilter = 'PENDING', createdByUserId = null, client = null }) {
    const normalizedFilter = INDEX_FILTERS.includes(normalizeIndexFilter(statusFilter)) ? normalizeIndexFilter(statusFilter) : 'PENDING';
    const existing = await query(`SELECT * FROM suggestion_review_indexes WHERE guild_id = $1 AND channel_id = $2 LIMIT 1`, [guildId, channelId]).catch(() => ({ rows: [] }));
    const result = existing.rows[0]
      ? await query(`UPDATE suggestion_review_indexes SET status_filter = $1, active = true, updated_at = NOW() WHERE id = $2 RETURNING *`, [normalizedFilter, existing.rows[0].id])
      : await query(`INSERT INTO suggestion_review_indexes (guild_id, channel_id, status_filter, created_by_user_id, active) VALUES ($1, $2, $3, $4, true) RETURNING *`, [guildId, channelId, normalizedFilter, createdByUserId || null]);
    const index = result.rows[0];
    if (client) await this.refreshReviewIndex({ client, index }).catch(() => {});
    return index;
  }

  async updateReviewIndexFilter({ guildId, indexId, statusFilter }) {
    const normalizedFilter = INDEX_FILTERS.includes(normalizeIndexFilter(statusFilter)) ? normalizeIndexFilter(statusFilter) : 'PENDING';
    const result = await query(`UPDATE suggestion_review_indexes SET status_filter = $1, updated_at = NOW() WHERE guild_id = $2 AND id = $3 AND active = true RETURNING *`, [normalizedFilter, guildId, indexId]).catch(() => ({ rows: [] }));
    return result.rows[0] || null;
  }

  async getReviewIndexSuggestions(index) {
    const filter = normalizeIndexFilter(index.status_filter || 'PENDING');
    const params = [index.guild_id];
    const clauses = ['guild_id = $1'];
    if (filter !== 'ALL') {
      params.push(filter);
      clauses.push(`status = $${params.length}`);
    }
    const result = await query(`SELECT * FROM suggestions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 50`, params).catch(() => ({ rows: [] }));
    return result.rows;
  }

  async refreshReviewIndex({ client, index }) {
    if (!index?.channel_id) return false;
    const guild = await client.guilds.fetch(index.guild_id).catch(() => null);
    const channel = guild ? await guild.channels.fetch(index.channel_id).catch(() => null) : null;
    if (!channel?.send) return false;
    if (index.message_id && channel.messages?.fetch) {
      const oldMessage = await channel.messages.fetch(index.message_id).catch(() => null);
      if (oldMessage?.delete) await oldMessage.delete().catch(() => {});
    }
    const rows = await this.getReviewIndexSuggestions(index);
    const sent = await channel.send(buildReviewIndexPayload(index, rows)).catch(() => null);
    if (!sent) return false;
    await query(`UPDATE suggestion_review_indexes SET message_id = $1, updated_at = NOW() WHERE id = $2`, [sent.id, index.id]).catch(() => {});
    return true;
  }

  async refreshReviewIndexes({ client, guildId }) {
    const result = await query(`SELECT * FROM suggestion_review_indexes WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [] }));
    let refreshed = 0;
    for (const index of result.rows) {
      if (await this.refreshReviewIndex({ client, index }).catch(() => false)) refreshed += 1;
    }
    return refreshed;
  }

  async getResetSummary(guildId) {
    const countRows = async (sql, params) => Number((await query(sql, params).catch(() => ({ rows: [{ count: 0 }] }))).rows[0]?.count || 0);
    const [configs, categories, suggestions, votes, notes, reviewIndexes, panelActive] = await Promise.all([
      countRows(`SELECT COUNT(*) FROM suggestion_configs WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM suggestion_categories WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM suggestions WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM suggestion_votes WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM suggestion_notes WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM suggestion_review_indexes WHERE guild_id = $1 AND active = true`, [guildId]),
      countRows(`SELECT COUNT(*) FROM suggestion_configs WHERE guild_id = $1 AND panel_active = true`, [guildId])
    ]);
    return { configs, categories, suggestions, votes, notes, reviewIndexes, panelActive };
  }

  async buildResetConfirmationPayload({ guildId, requestedByUserId }) {
    const counts = await this.getResetSummary(guildId);
    return {
      embeds: [createBaseEmbed({
        title: 'Confirm Suggestions Reset',
        description: [
          'This will reset only the **Suggestions** module for this server.',
          '',
          '**What will be cleared**',
          'Suggestion setup, categories, suggestions, votes, staff revision notes, review indexes, and the tracked public panel reference. Existing Discord suggestion/review messages will not be deleted.',
          '',
          '**Current records found**',
          formatCounts(counts),
          '',
          'This action cannot be undone from SlickBot.'
        ].join('\n'),
        color: SlickBotColors.ERROR,
        footer: 'SlickBot Suggestions Reset'
      })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CustomIds.SuggestionResetConfirmPrefix}${requestedByUserId}`).setLabel('Confirm Suggestions Reset').setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
        new ButtonBuilder().setCustomId(`${CustomIds.SuggestionResetCancelPrefix}${requestedByUserId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      )]
    };
  }

  async resetModule(guildId) {
    const before = await this.getResetSummary(guildId);
    await query(`DELETE FROM suggestion_review_indexes WHERE guild_id = $1`, [guildId]).catch(() => {});
    await query(`DELETE FROM suggestions WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM suggestion_categories WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM suggestion_configs WHERE guild_id = $1`, [guildId]);
    return { before };
  }

  buildResetCompletePayload(result) {
    return {
      embeds: [createBaseEmbed({
        title: 'Suggestions Reset Complete',
        description: [
          'The **Suggestions** module was reset for this server.',
          '',
          '**Cleared records**',
          formatCounts(result.before),
          '',
          'Run `/suggestion setup` when you are ready to rebuild it.'
        ].join('\n'),
        color: SlickBotColors.SUCCESS,
        footer: 'SlickBot Suggestions Reset'
      })],
      components: []
    };
  }

  async buildManagerPanel(guildId) {
    const config = await this.ensureConfig(guildId);
    const [categoryCount, suggestionCount, indexCount] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM suggestion_categories WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM suggestions WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM suggestion_review_indexes WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const embed = createBaseEmbed({
      title: 'SlickBot Community Center',
      description: [
        '**Viewing:** Suggestions',
        '',
        `Status: **${config.channel_id ? 'Configured' : 'Needs Setup'}**`,
        `Public Voting Channel: ${config.channel_id ? `<#${config.channel_id}>` : '**Not configured**'}`,
        `Review Channel: ${config.review_channel_id ? `<#${config.review_channel_id}>` : '**Not configured**'}`,
        `Suggestion Logs: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set'}`,
        `Auto Discussion Threads: **${config.auto_create_threads === false ? 'Disabled' : 'Enabled'}**`,
        `Default Anonymous: **${config.default_anonymous === false ? 'No' : 'Yes'}**`,
        `Categories: **${categoryCount.rows[0]?.count || 0}**`,
        `Suggestions Submitted: **${suggestionCount.rows[0]?.count || 0}**`,
        `Review Indexes: **${indexCount.rows[0]?.count || 0}**`,
        `Public Panel: ${config.panel_active && config.panel_channel_id ? `<#${config.panel_channel_id}>` : 'Not posted'}`,
        '',
        '**Primary Commands**',
        '`/suggestion setup` · `/suggestion panel post` · `/suggestion review-index` · `/suggestion submit` · `/suggestion review status` · `/suggestion reset`'
      ].join('\n'),
      color: config.channel_id ? SlickBotColors.SUCCESS : SlickBotColors.WARNING,
      footer: 'SlickBot Suggestions'
    });
    return {
      embeds: [embed],
      components: [createButtonRow([
        createPanelButton(CustomIds.SuggestionsRefresh, 'Refresh', ButtonStyle.Secondary),
        createPanelButton(CustomIds.SetupCommunity, 'Community', ButtonStyle.Secondary),
        createPanelButton(CustomIds.SetupRefresh, 'Return to Setup', ButtonStyle.Secondary)
      ])]
    };
  }

  async buildViewPayload(guild, suggestionNumber) {
    const suggestion = await this.getSuggestionByNumber(guild.id, suggestionNumber);
    if (!suggestion) return { ok: false, reason: 'Suggestion not found.' };
    const votes = await this.getVotes(suggestion.id);
    const notes = await this.getNotes(suggestion.id);
    const submitter = suggestion.anonymous ? null : await guild.client.users.fetch(suggestion.submitter_user_id).catch(() => null);
    return { ok: true, payload: buildSuggestionPayload({ suggestion, votes, submitter, notes }) };
  }

  async buildRevealPayload(guild, suggestionNumber) {
    const suggestion = await this.getSuggestionByNumber(guild.id, suggestionNumber);
    if (!suggestion) return { ok: false, reason: 'Suggestion not found.' };
    return {
      ok: true,
      payload: {
        embeds: [createBaseEmbed({
          title: `Suggestion #${suggestion.suggestion_number} Submitter`,
          description: [`**${suggestion.title}**`, '', `Submitter: <@${suggestion.submitter_user_id}>`, `Anonymous Publicly: **${suggestion.anonymous ? 'Yes' : 'No'}**`].join('\n'),
          color: SlickBotColors.INFO,
          footer: 'SlickBot Suggestions'
        })]
      }
    };
  }
}

module.exports = {
  SuggestionService,
  SUGGESTION_STATUSES,
  STATUS_LABELS,
  normalizeStatus,
  messageUrl,
  channelUrl,
  buildPanelPayload,
  buildReviewIndexPayload,
  isVotingOpenStatus
};
