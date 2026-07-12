const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, createSuccessEmbed, SlickBotColors } = require('../ui/uiService');
const { truncate } = require('../../utils/format');

function nextNumberQuery(table, numberColumn) {
  return `SELECT COALESCE(MAX(${numberColumn}), 0) + 1 AS next_number FROM ${table} WHERE guild_id = $1`;
}

function safeJson(value) {
  return value ? JSON.stringify(value) : null;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeStatus(status) {
  return String(status || '').toUpperCase();
}

function formatTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function formatRelativeTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function clampApplicationTimeoutSeconds(value) {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 180;
  return Math.min(Math.max(seconds, 60), 86400);
}

function formatDuration(seconds) {
  const safe = clampApplicationTimeoutSeconds(seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (minutes && remainder) return `${minutes} minute${minutes === 1 ? '' : 's'} ${remainder} second${remainder === 1 ? '' : 's'}`;
  if (minutes) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${safe} second${safe === 1 ? '' : 's'}`;
}

function getSessionDeadline(timeoutSeconds) {
  return new Date(Date.now() + clampApplicationTimeoutSeconds(timeoutSeconds) * 1000);
}

const SUPPORT_STATUS_LABELS = Object.freeze({
  OPEN: '🟠 **Open**',
  CLAIMED: '🔵 **Claimed**',
  PENDING: '🟠 **Pending Review**',
  APPROVED: '✅ **Approved**',
  DENIED: '⛔ **Denied**',
  RESOLVED: '✅ **Resolved**',
  DISMISSED: '⚪ **Dismissed**',
  CLOSED: '⚪ **Closed**'
});

function formatSupportStatus(status) {
  const normalized = normalizeStatus(status || 'OPEN');
  return SUPPORT_STATUS_LABELS[normalized] || `**${normalized || 'UNKNOWN'}**`;
}

function supportStatusColor(status, fallback = SlickBotColors.PRIMARY) {
  const normalized = normalizeStatus(status || 'OPEN');
  if (['APPROVED', 'RESOLVED'].includes(normalized)) return SlickBotColors.SUCCESS;
  if (['DENIED'].includes(normalized)) return SlickBotColors.ERROR;
  if (['DISMISSED', 'CLOSED'].includes(normalized)) return SlickBotColors.MUTED;
  if (['PENDING', 'OPEN'].includes(normalized)) return SlickBotColors.WARNING;
  if (['CLAIMED'].includes(normalized)) return SlickBotColors.PRIMARY;
  return fallback;
}

function normalizeChannelName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'ticket';
}

function formatTicketChannelName(format, { username, number, type }) {
  const padded = String(number).padStart(4, '0');
  const raw = String(format || 'ticket-{username}-{number}')
    .replaceAll('{username}', username)
    .replaceAll('{user}', username)
    .replaceAll('{number}', padded)
    .replaceAll('{ticket_number}', padded)
    .replaceAll('{type}', type || 'ticket');
  return normalizeChannelName(raw);
}

async function fetchSendableChannel(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
  if (typeof channel.send !== 'function') return null;
  return channel;
}

async function getTeamRoleIds(teamId) {
  if (!teamId) return [];
  const result = await query(`SELECT role_id FROM permission_team_roles WHERE team_id = $1`, [teamId]).catch(() => ({ rows: [] }));
  return result.rows.map((row) => row.role_id);
}

async function resolveTeamId(guildId, teamName) {
  if (!teamName) return null;
  const result = await query(`SELECT id FROM permission_teams WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [guildId, teamName]).catch(() => ({ rows: [] }));
  return result.rows[0]?.id || null;
}


async function resolveReviewerRoleIds(ticketType, config) {
  const staffTeamId = ticketType?.staff_team_id || config?.staff_team_id || null;
  const teamRoleIds = await getTeamRoleIds(staffTeamId);
  return [...new Set([
    ticketType?.staff_role_id || config?.staff_role_id,
    ...teamRoleIds
  ].filter(Boolean))];
}

async function resolveEscalationRoleIds(ticketType, config) {
  const escalationTeamId = ticketType?.escalated_team_id || config?.escalated_team_id || null;
  const teamRoleIds = await getTeamRoleIds(escalationTeamId);
  return [...new Set([
    ticketType?.escalated_role_id || config?.escalated_role_id,
    ...teamRoleIds
  ].filter(Boolean))];
}

function buildQuestionLines(answers) {
  const parsed = parseJson(answers, {});
  const entries = Object.entries(parsed);
  if (!entries.length) return 'No answers provided.';
  return entries.map(([question, answer]) => `**${question}**\n${truncate(String(answer || 'No answer provided.'), 700)}`).join('\n\n');
}

function sanitizeThreadName(value) {
  return String(value || 'applicant')
    .toLowerCase()
    .replace(/#[0-9]{4,}$/g, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'applicant';
}

function buildApplicationThreadName(submission) {
  const applicant = sanitizeThreadName(submission.applicant_user_tag || submission.applicant_user_id || 'applicant');
  const application = sanitizeThreadName(submission.application_name || 'application');
  return `${applicant}-${application}`.slice(0, 100) || 'application-review';
}

function buildApplicationTranscriptAttachment(submission) {
  const answers = parseJson(submission.answers, {});
  const lines = [
    `SlickBot Application Transcript`,
    `Application Number: #${submission.submission_number}`,
    `Application Type: ${submission.application_name || 'Application'}`,
    `Status: ${normalizeStatus(submission.status || 'PENDING')}`,
    `Applicant: ${submission.applicant_user_tag || 'Unknown'} (${submission.applicant_user_id})`,
    `Submitted At: ${submission.created_at ? new Date(submission.created_at).toISOString() : 'Unknown'}`,
    submission.reviewed_by_user_id ? `Reviewed By User ID: ${submission.reviewed_by_user_id}` : null,
    submission.reviewed_at ? `Reviewed At: ${new Date(submission.reviewed_at).toISOString()}` : null,
    submission.review_reason ? `Review Reason: ${submission.review_reason}` : null,
    '',
    'Answers',
    '======='
  ].filter((line) => line !== null);

  Object.entries(answers).forEach(([question, answer], index) => {
    lines.push('', `${index + 1}. ${question}`, String(answer || 'No answer provided.'));
  });

  const safeStatus = normalizeStatus(submission.status || 'reviewed').toLowerCase();
  const fileName = `application-${submission.submission_number}-${safeStatus}.txt`;
  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: fileName });
}

function buildApplicationReviewThreadPayload(submission) {
  return {
    embeds: [createBaseEmbed({
      title: `Review Thread · ${submission.application_name} #${submission.submission_number}`,
      description: [
        `Applicant: <@${submission.applicant_user_id}>`,
        `Status: **${normalizeStatus(submission.status || 'PENDING')}**`,
        '',
        'Use this thread for staff discussion. When the application is approved or denied, SlickBot will close this thread automatically.',
        '',
        '**Answers**',
        buildQuestionLines(submission.answers)
      ].join('\n'),
      color: SlickBotColors.INFO,
      footer: 'SlickBot Applications'
    })]
  };
}


function hasAnyRole(member, roleIds = []) {
  if (!member?.roles?.cache) return false;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function hasAdministratorBypass(interaction, member) {
  if (interaction?.guild?.ownerId && interaction.guild.ownerId === interaction.user.id) return true;
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function buildTicketControlRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CustomIds.TicketClaim).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
    new ButtonBuilder().setCustomId(CustomIds.TicketEscalate).setLabel('Escalate').setStyle(ButtonStyle.Secondary).setEmoji('⬆️'),
    new ButtonBuilder().setCustomId(CustomIds.TicketCloseReason).setLabel('Close With Reason').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );
}

class TicketService {
  async getConfig(guildId) {
    const result = await query(`SELECT * FROM ticket_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    if (result.rows[0]) return result.rows[0];

    const created = await query(
      `INSERT INTO ticket_configs (guild_id) VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return created.rows[0];
  }

  async updateConfig(guildId, input) {
    const result = await query(
      `INSERT INTO ticket_configs (guild_id, category_id, log_channel_id, staff_role_id, staff_team_id, escalated_role_id, escalated_team_id, ticket_limit, transcript_enabled, naming_format, panel_title, panel_description, panel_color, panel_header_image_url, close_delete_seconds, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (guild_id)
       DO UPDATE SET
         category_id = COALESCE(EXCLUDED.category_id, ticket_configs.category_id),
         log_channel_id = COALESCE(EXCLUDED.log_channel_id, ticket_configs.log_channel_id),
         staff_role_id = COALESCE(EXCLUDED.staff_role_id, ticket_configs.staff_role_id),
         staff_team_id = COALESCE(EXCLUDED.staff_team_id, ticket_configs.staff_team_id),
         escalated_role_id = COALESCE(EXCLUDED.escalated_role_id, ticket_configs.escalated_role_id),
         escalated_team_id = COALESCE(EXCLUDED.escalated_team_id, ticket_configs.escalated_team_id),
         ticket_limit = COALESCE(EXCLUDED.ticket_limit, ticket_configs.ticket_limit),
         transcript_enabled = COALESCE(EXCLUDED.transcript_enabled, ticket_configs.transcript_enabled),
         naming_format = COALESCE(EXCLUDED.naming_format, ticket_configs.naming_format),
         panel_title = COALESCE(EXCLUDED.panel_title, ticket_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, ticket_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, ticket_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, ticket_configs.panel_header_image_url),
         close_delete_seconds = COALESCE(EXCLUDED.close_delete_seconds, ticket_configs.close_delete_seconds),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, ticket_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        input.categoryId || null,
        input.logChannelId || null,
        input.staffRoleId || null,
        input.staffTeamName ? await resolveTeamId(guildId, input.staffTeamName) : null,
        input.escalatedRoleId || null,
        input.escalatedTeamName ? await resolveTeamId(guildId, input.escalatedTeamName) : null,
        input.ticketLimit || null,
        typeof input.transcriptEnabled === 'boolean' ? input.transcriptEnabled : null,
        input.namingFormat || null,
        input.panelTitle || null,
        input.panelDescription || null,
        input.panelColor || null,
        input.panelHeaderImageUrl || null,
        input.closeDeleteSeconds || null,
        input.panelDisplayMode || null
      ]
    );
    await this.ensureDefaultType(guildId);
    return result.rows[0];
  }

  async ensureDefaultType(guildId) {
    const cfg = await this.getConfig(guildId);
    const result = await query(
      `INSERT INTO ticket_types (guild_id, name, label, description, category_id, log_channel_id, staff_role_id, staff_team_id, escalated_role_id, escalated_team_id, ticket_limit, transcript_enabled, naming_format, questions, enabled)
       VALUES ($1, 'Admin Support', 'Admin Support', 'General server support and administrative help.', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
       ON CONFLICT (guild_id, name)
       DO UPDATE SET
         category_id = COALESCE(ticket_types.category_id, EXCLUDED.category_id),
         log_channel_id = COALESCE(ticket_types.log_channel_id, EXCLUDED.log_channel_id),
         staff_role_id = COALESCE(ticket_types.staff_role_id, EXCLUDED.staff_role_id),
         staff_team_id = COALESCE(ticket_types.staff_team_id, EXCLUDED.staff_team_id),
         escalated_role_id = COALESCE(ticket_types.escalated_role_id, EXCLUDED.escalated_role_id),
         escalated_team_id = COALESCE(ticket_types.escalated_team_id, EXCLUDED.escalated_team_id),
         updated_at = NOW()
       RETURNING *`,
      [guildId, cfg.category_id || null, cfg.log_channel_id || null, cfg.staff_role_id || null, cfg.staff_team_id || null, cfg.escalated_role_id || null, cfg.escalated_team_id || null, cfg.ticket_limit || 1, cfg.transcript_enabled !== false, cfg.naming_format || 'ticket-{username}-{number}', JSON.stringify([{ label: 'How can staff help?', required: true }])]
    );
    return result.rows[0];
  }

  async setupType(guildId, input) {
    const staffTeamId = input.staffTeamName ? await resolveTeamId(guildId, input.staffTeamName) : null;
    const escalatedTeamId = input.escalatedTeamName ? await resolveTeamId(guildId, input.escalatedTeamName) : null;
    const result = await query(
      `INSERT INTO ticket_types (guild_id, name, label, description, category_id, log_channel_id, staff_role_id, staff_team_id, escalated_role_id, escalated_team_id, ticket_limit, transcript_enabled, naming_format, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
       ON CONFLICT (guild_id, name)
       DO UPDATE SET
         label = COALESCE(EXCLUDED.label, ticket_types.label),
         description = COALESCE(EXCLUDED.description, ticket_types.description),
         category_id = COALESCE(EXCLUDED.category_id, ticket_types.category_id),
         log_channel_id = COALESCE(EXCLUDED.log_channel_id, ticket_types.log_channel_id),
         staff_role_id = COALESCE(EXCLUDED.staff_role_id, ticket_types.staff_role_id),
         staff_team_id = COALESCE(EXCLUDED.staff_team_id, ticket_types.staff_team_id),
         escalated_role_id = COALESCE(EXCLUDED.escalated_role_id, ticket_types.escalated_role_id),
         escalated_team_id = COALESCE(EXCLUDED.escalated_team_id, ticket_types.escalated_team_id),
         ticket_limit = COALESCE(EXCLUDED.ticket_limit, ticket_types.ticket_limit),
         transcript_enabled = COALESCE(EXCLUDED.transcript_enabled, ticket_types.transcript_enabled),
         naming_format = COALESCE(EXCLUDED.naming_format, ticket_types.naming_format),
         enabled = true,
         updated_at = NOW()
       RETURNING *`,
      [guildId, input.name, input.label || input.name, input.description || null, input.categoryId || null, input.logChannelId || null, input.staffRoleId || null, staffTeamId, input.escalatedRoleId || null, escalatedTeamId, input.ticketLimit || null, typeof input.transcriptEnabled === 'boolean' ? input.transcriptEnabled : null, input.namingFormat || null]
    );
    return result.rows[0];
  }

  async listTypes(guildId) {
    await this.ensureDefaultType(guildId);
    const result = await query(`SELECT * FROM ticket_types WHERE guild_id = $1 ORDER BY name ASC`, [guildId]);
    return result.rows;
  }

  async getTypeById(guildId, id) {
    const result = await query(`SELECT * FROM ticket_types WHERE guild_id = $1 AND id = $2 LIMIT 1`, [guildId, id]);
    return result.rows[0] || null;
  }

  async getTypeByName(guildId, name) {
    const result = await query(`SELECT * FROM ticket_types WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [guildId, name]);
    return result.rows[0] || null;
  }

  async addQuestion(guildId, typeName, question, required = true) {
    const type = await this.getTypeByName(guildId, typeName);
    if (!type) return null;
    const questions = parseJson(type.questions, []);
    questions.push({ label: question, required: Boolean(required) });
    const result = await query(`UPDATE ticket_types SET questions = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [safeJson(questions.slice(0, 4)), type.id]);
    return result.rows[0];
  }

  async clearQuestions(guildId, typeName) {
    const type = await this.getTypeByName(guildId, typeName);
    if (!type) return null;
    const result = await query(`UPDATE ticket_types SET questions = '[]'::jsonb, updated_at = NOW() WHERE id = $1 RETURNING *`, [type.id]);
    return result.rows[0];
  }


  async deleteType(guildId, typeName) {
    const type = await this.getTypeByName(guildId, typeName);
    if (!type) return { ok: false, reason: 'Ticket type not found.' };
    const openTickets = await query(`SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND ticket_type_id = $2 AND status = 'OPEN'`, [guildId, type.id]).catch(() => ({ rows: [{ count: 0 }] }));
    if ((openTickets.rows[0]?.count || 0) > 0) return { ok: false, reason: 'This ticket type still has open tickets. Close them before deleting the type.' };
    await query(`DELETE FROM ticket_types WHERE guild_id = $1 AND id = $2`, [guildId, type.id]);
    return { ok: true, type };
  }

  async createTicket({ interaction, client, logger, type = 'Admin Support', ticketType = null, openerUser = null, actorUser = null, subject, details, answers = null, reviewerRoleIdsOverride = null, skipTicketLimit = false }) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    const config = await this.getConfig(guildId);
    const opener = openerUser || interaction.user;
    const actor = actorUser || interaction.user;
    const selectedType = ticketType || await this.getTypeByName(guildId, type) || await this.ensureDefaultType(guildId);

    const openCount = skipTicketLimit ? { rows: [{ count: 0 }] } : await query(
      `SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND opener_user_id = $2 AND status = 'OPEN'`,
      [guildId, opener.id]
    );

    const limit = selectedType.ticket_limit || config.ticket_limit || 1;
    if (!skipTicketLimit && (openCount.rows[0]?.count || 0) >= limit) {
      return { ok: false, reason: `This user already has the maximum number of open tickets allowed (**${limit}**).` };
    }

    const next = await query(nextNumberQuery('tickets', 'ticket_number'), [guildId]);
    const ticketNumber = Number(next.rows[0].next_number);
    const channelName = formatTicketChannelName(selectedType.naming_format || config.naming_format, {
      username: opener.username,
      number: ticketNumber,
      type: selectedType.name
    });

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: opener.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
    ];

    if (botMember) {
      overwrites.push({ id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
    }

    const reviewerRoleIds = Array.isArray(reviewerRoleIdsOverride) ? [...new Set(reviewerRoleIdsOverride)] : await resolveReviewerRoleIds(selectedType, config);
    for (const roleId of reviewerRoleIds) {
      overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: selectedType.category_id || config.category_id || null,
      topic: `SlickBot ticket #${ticketNumber} opened by ${opener.tag} (${opener.id})`,
      permissionOverwrites: overwrites,
      reason: `SlickBot ticket #${ticketNumber}`
    });

    const readableDetails = answers ? buildQuestionLines(answers) : (details || null);
    const insert = await query(
      `INSERT INTO tickets (guild_id, ticket_number, channel_id, opener_user_id, opener_user_tag, type, subject, details, status, priority, ticket_type_id, reviewer_role_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 'NORMAL', $9, $10)
       RETURNING *`,
      [guildId, ticketNumber, channel.id, opener.id, opener.tag, selectedType.name, subject || 'Support Request', readableDetails, selectedType.id, reviewerRoleIds[0] || null]
    );
    const ticket = insert.rows[0];

    const embed = buildTicketControlEmbed(ticket, selectedType);
    const row = buildTicketControlRow();

    const reviewerMentions = reviewerRoleIds.map((roleId) => `<@&${roleId}>`).join(' ');
    const controlMessage = await channel.send({ content: `<@${opener.id}>${reviewerMentions ? ` ${reviewerMentions}` : ''}`, embeds: [embed], components: [row] });
    await query(`UPDATE tickets SET control_message_id = $1, updated_at = NOW() WHERE id = $2`, [controlMessage.id, ticket.id]).catch(() => {});
    ticket.control_message_id = controlMessage.id;

    await logger.log({
      guildId,
      eventKey: 'ticket-open',
      title: 'Ticket Opened',
      body: `Ticket #${ticket.ticket_number} opened by ${opener.tag} in <#${channel.id}>.${actor.id !== opener.id ? ` Created by ${actor.tag}.` : ''}`,
      actorUserId: actor.id,
      metadata: { ticketId: ticket.id, channelId: channel.id, openerUserId: opener.id }
    }).catch(() => {});

    return { ok: true, ticket, channel };
  }

  async findOpenTicketByChannel(guildId, channelId) {
    const result = await query(`SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'OPEN' LIMIT 1`, [guildId, channelId]);
    return result.rows[0] || null;
  }

  async listActiveAddedUsers(ticketId) {
    const result = await query(
      `SELECT user_id, user_tag, added_by_user_id, added_at
       FROM ticket_added_users
       WHERE ticket_id = $1 AND removed_at IS NULL
       ORDER BY added_at ASC`,
      [ticketId]
    ).catch(() => ({ rows: [] }));
    return result.rows;
  }

  async canManageTicket({ interaction }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const member = interaction.member?.roles?.cache
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (hasAdministratorBypass(interaction, member)) return { ok: true, ticket };

    const config = await this.getConfig(interaction.guildId);
    const type = ticket.ticket_type_id ? await this.getTypeById(interaction.guildId, ticket.ticket_type_id) : null;
    const reviewerRoles = await resolveReviewerRoleIds(type, config);
    const escalatedRoles = await resolveEscalationRoleIds(type, config);
    const allowedRoleIds = [...new Set([...reviewerRoles, ...escalatedRoles].filter(Boolean))];

    if (!allowedRoleIds.length) {
      return { ok: false, reason: 'This ticket does not have a configured staff role or escalation role.' };
    }

    if (!hasAnyRole(member, allowedRoleIds)) {
      return { ok: false, reason: 'Only the assigned ticket staff or escalation team can use this ticket control.' };
    }

    return { ok: true, ticket };
  }

  async refreshTicketControlMessage({ interaction, client = null, ticket = null }) {
    const currentTicket = ticket || await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!currentTicket?.control_message_id) return false;

    const channel = interaction.channel || await client?.channels?.fetch?.(currentTicket.channel_id).catch(() => null);
    if (!channel?.messages?.fetch) return false;

    const message = await channel.messages.fetch(currentTicket.control_message_id).catch(() => null);
    if (!message) return false;

    const type = currentTicket.ticket_type_id ? await this.getTypeById(currentTicket.guild_id || interaction.guildId, currentTicket.ticket_type_id) : null;
    const addedUsers = await this.listActiveAddedUsers(currentTicket.id);
    const isClosed = normalizeStatus(currentTicket.status) === 'CLOSED';
    await message.edit({
      embeds: [buildTicketControlEmbed(currentTicket, type, addedUsers)],
      components: isClosed ? [] : [buildTicketControlRow()]
    }).catch(() => {});
    return true;
  }

  async claimTicket({ interaction, logger }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const result = await query(`UPDATE tickets SET claimed_by_user_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [interaction.user.id, ticket.id]);
    const updatedTicket = result.rows[0];
    await this.refreshTicketControlMessage({ interaction, ticket: updatedTicket }).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'ticket-claim', title: 'Ticket Claimed', body: `Ticket #${ticket.ticket_number} claimed by ${interaction.user.tag}.`, actorUserId: interaction.user.id, metadata: { ticketId: ticket.id } }).catch(() => {});
    return { ok: true, ticket: updatedTicket };
  }

  async setPriority({ interaction, logger, priority }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };
    const result = await query(`UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [priority, ticket.id]);
    const updatedTicket = result.rows[0];
    await this.refreshTicketControlMessage({ interaction, ticket: updatedTicket }).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'ticket-priority', title: 'Ticket Priority Updated', body: `Ticket #${ticket.ticket_number} priority changed to **${priority}** by ${interaction.user.tag}.`, actorUserId: interaction.user.id, metadata: { ticketId: ticket.id, priority } }).catch(() => {});
    return { ok: true, ticket: updatedTicket };
  }

  async escalateTicket({ interaction, logger, reason = 'No escalation reason provided.' }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const config = await this.getConfig(interaction.guildId);
    const type = ticket.ticket_type_id ? await this.getTypeById(interaction.guildId, ticket.ticket_type_id) : null;
    const escalatedRoles = await resolveEscalationRoleIds(type, config);
    if (!escalatedRoles.length) return { ok: false, reason: 'This ticket type does not have an escalation role or team configured.' };

    const reviewerRoles = await resolveReviewerRoleIds(type, config);
    const escalatedRoleSet = new Set(escalatedRoles);
    for (const roleId of reviewerRoles) {
      if (!escalatedRoleSet.has(roleId)) {
        await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false, ManageMessages: false }).catch(() => {});
      }
    }

    for (const roleId of escalatedRoles) {
      await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true }).catch(() => {});
    }

    const result = await query(
      `UPDATE tickets SET priority = 'ESCALATED', escalated_to_role_id = $1, escalated_by_user_id = $2, escalated_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [escalatedRoles[0], interaction.user.id, ticket.id]
    );

    const updatedTicket = result.rows[0];
    await this.refreshTicketControlMessage({ interaction, ticket: updatedTicket }).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'ticket-escalate', title: 'Ticket Escalated', body: `Ticket #${ticket.ticket_number} escalated by ${interaction.user.tag}.\nReason: ${reason}`, actorUserId: interaction.user.id, metadata: { ticketId: ticket.id, escalatedRoles } }).catch(() => {});
    return { ok: true, ticket: updatedTicket, roleIds: escalatedRoles };
  }

  async addUserToTicket({ interaction, logger, user, reason = 'No reason provided.' }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };
    if (!user) return { ok: false, reason: 'No user was provided.' };
    if (user.id === ticket.opener_user_id) return { ok: false, reason: 'The ticket opener already has access to this ticket.' };

    const permissionUpdated = await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    }).then(() => true).catch(() => false);

    if (!permissionUpdated) {
      return { ok: false, reason: "I could not update this ticket channel's permission overwrites. Check that SlickBot can manage this channel." };
    }

    await query(
      `INSERT INTO ticket_added_users (guild_id, ticket_id, user_id, user_tag, added_by_user_id, add_reason, added_at, removed_by_user_id, remove_reason, removed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NULL, NULL, NULL, NOW())
       ON CONFLICT (ticket_id, user_id) DO UPDATE SET
         user_tag = EXCLUDED.user_tag,
         added_by_user_id = EXCLUDED.added_by_user_id,
         add_reason = EXCLUDED.add_reason,
         added_at = NOW(),
         removed_by_user_id = NULL,
         remove_reason = NULL,
         removed_at = NULL,
         updated_at = NOW()`,
      [interaction.guildId, ticket.id, user.id, user.tag || null, interaction.user.id, reason]
    );

    await this.refreshTicketControlMessage({ interaction, ticket }).catch(() => {});

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'ticket-update',
      title: 'User Added to Ticket',
      body: `Ticket #${ticket.ticket_number}: <@${user.id}> was added by ${interaction.user.tag}.\nReason: ${reason}`,
      actorUserId: interaction.user.id,
      metadata: { ticketId: ticket.id, addedUserId: user.id }
    }).catch(() => {});

    return { ok: true, ticket, user };
  }

  async removeUserFromTicket({ interaction, logger, user, reason = 'No reason provided.' }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };
    if (!user) return { ok: false, reason: 'No user was provided.' };
    if (user.id === ticket.opener_user_id) return { ok: false, reason: 'The ticket opener cannot be removed with this command.' };

    const existing = await query(
      `SELECT * FROM ticket_added_users WHERE ticket_id = $1 AND user_id = $2 AND removed_at IS NULL LIMIT 1`,
      [ticket.id, user.id]
    ).catch(() => ({ rows: [] }));

    if (!existing.rows[0]) {
      return { ok: false, reason: 'That user was not added to this ticket through `/ticket add-user`, or they have already been removed.' };
    }

    const permissionRemoved = await interaction.channel.permissionOverwrites.delete(user.id, `SlickBot ticket user removed by ${interaction.user.tag}: ${reason}`)
      .then(() => true)
      .catch(async () => interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false, AttachFiles: false })
        .then(() => true)
        .catch(() => false));

    if (!permissionRemoved) {
      return { ok: false, reason: "I could not remove this ticket channel's user permission overwrite. Check that SlickBot can manage this channel." };
    }

    await query(
      `UPDATE ticket_added_users
       SET removed_by_user_id = $1, remove_reason = $2, removed_at = NOW(), updated_at = NOW()
       WHERE ticket_id = $3 AND user_id = $4`,
      [interaction.user.id, reason, ticket.id, user.id]
    );

    await this.refreshTicketControlMessage({ interaction, ticket }).catch(() => {});

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'ticket-update',
      title: 'User Removed from Ticket',
      body: `Ticket #${ticket.ticket_number}: <@${user.id}> was removed by ${interaction.user.tag}.\nReason: ${reason}`,
      actorUserId: interaction.user.id,
      metadata: { ticketId: ticket.id, removedUserId: user.id }
    }).catch(() => {});

    return { ok: true, ticket, user };
  }

  async closeTicket({ interaction, client, logger, reason = 'No reason provided.' }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const config = await this.getConfig(interaction.guildId);
    const type = ticket.ticket_type_id ? await this.getTypeById(interaction.guildId, ticket.ticket_type_id) : null;
    let transcriptSent = false;
    const transcriptEnabled = type?.transcript_enabled ?? config.transcript_enabled;
    const logChannelId = type?.log_channel_id || config.log_channel_id;

    if (transcriptEnabled !== false && logChannelId) {
      const transcript = await this.buildTranscript(interaction.channel, ticket, reason, interaction.user);
      const logChannel = await fetchSendableChannel(client, logChannelId);
      if (logChannel) {
        const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `ticket-${ticket.ticket_number}-transcript.txt` });
        await logChannel.send({
          embeds: [createBaseEmbed({ title: `Ticket #${ticket.ticket_number} Transcript`, description: [`Closed By: <@${interaction.user.id}>`, `Channel: <#${interaction.channelId}>`, `Reason: ${reason}`].join('\n'), color: SlickBotColors.INFO, footer: 'SlickBot Ticket Transcript' })],
          files: [file]
        });
        transcriptSent = true;
      }
    }

    const result = await query(
      `UPDATE tickets SET status = 'CLOSED', closed_by_user_id = $1, closed_at = NOW(), close_reason = $2, transcript_sent = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [interaction.user.id, reason, transcriptSent, ticket.id]
    );

    const closedTicket = result.rows[0];
    await this.refreshTicketControlMessage({ interaction, ticket: closedTicket }).catch(() => {});
    await interaction.channel.permissionOverwrites.edit(ticket.opener_user_id, { SendMessages: false }).catch(() => {});
    await interaction.channel.setName(`closed-${interaction.channel.name}`.slice(0, 95)).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'ticket-close', title: 'Ticket Closed', body: `Ticket #${ticket.ticket_number} closed by ${interaction.user.tag}. Transcript sent: **${transcriptSent ? 'Yes' : 'No'}**.\nReason: ${reason}`, actorUserId: interaction.user.id, metadata: { ticketId: ticket.id, transcriptSent } }).catch(() => {});
    return { ok: true, ticket: closedTicket, transcriptSent, shouldDelete: transcriptSent === true, deleteSeconds: Number(type?.close_delete_seconds || config.close_delete_seconds || 10) };
  }

  async buildTranscript(channel, ticket, reason, closedBy) {
    const messages = [];
    let before;
    while (messages.length < 1000) {
      const fetched = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!fetched || fetched.size === 0) break;
      messages.push(...fetched.values());
      before = fetched.last().id;
      if (fetched.size < 100) break;
    }

    const lines = [`SlickBot Ticket Transcript`, `Ticket: #${ticket.ticket_number}`, `Subject: ${ticket.subject}`, `Type: ${ticket.type}`, `Opened By: ${ticket.opener_user_tag || ticket.opener_user_id} (${ticket.opener_user_id})`, `Closed By: ${closedBy.tag} (${closedBy.id})`, `Close Reason: ${reason}`, `Channel: #${channel.name} (${channel.id})`, `Generated At: ${new Date().toISOString()}`, '', '--- Messages ---', ''];
    for (const message of messages.reverse()) {
      const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown Author';
      const timestamp = message.createdAt ? message.createdAt.toISOString() : 'Unknown Time';
      lines.push(`[${timestamp}] ${author}`);
      lines.push(message.content || '[No text content]');
      if (message.attachments?.size) for (const attachment of message.attachments.values()) lines.push(`Attachment: ${attachment.url}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}

function buildTicketControlEmbed(ticket, ticketType, addedUsers = []) {
  const status = normalizeStatus(ticket.status || 'OPEN');
  const closedAt = formatTimestamp(ticket.closed_at);
  const createdAt = formatTimestamp(ticket.created_at);
  const lines = [
    `Status: ${formatSupportStatus(status)}`,
    `Opened By: <@${ticket.opener_user_id}>`,
    createdAt ? `Opened: ${createdAt}` : null,
    `Type: **${ticket.type || ticketType?.name || 'Ticket'}**`,
    `Priority: **${ticket.priority || 'NORMAL'}**`
  ];

  if (ticket.claimed_by_user_id) lines.push(`Claimed By: <@${ticket.claimed_by_user_id}>`);
  if (ticket.escalated_by_user_id) lines.push(`Escalated By: <@${ticket.escalated_by_user_id}>`);
  if (status === 'CLOSED') {
    if (ticket.closed_by_user_id) lines.push(`Closed By: <@${ticket.closed_by_user_id}>${closedAt ? ` on ${closedAt}` : ''}`);
    if (ticket.close_reason) lines.push(`Close Reason: ${truncate(ticket.close_reason, 700)}`);
    lines.push(`Transcript Sent: **${ticket.transcript_sent ? 'Yes' : 'No'}**`);
  }
  if (addedUsers.length) lines.push(`Added Users: ${addedUsers.map((entry) => `<@${entry.user_id}>`).join(', ')}`);

  lines.push('', '**Details**', truncate(ticket.details || 'No details provided.', 2400));

  return createBaseEmbed({
    title: `Ticket #${ticket.ticket_number}: ${ticket.subject}`,
    description: lines.filter(Boolean).join('\n'),
    color: status === 'CLOSED' ? SlickBotColors.MUTED : ticket.priority === 'ESCALATED' ? SlickBotColors.WARNING : SlickBotColors.PRIMARY,
    footer: 'SlickBot Tickets'
  });
}

class ReportService {
  async updateConfig(guildId, input) {
    const pingTeamId = input.pingTeamName ? await resolveTeamId(guildId, input.pingTeamName) : null;
    const result = await query(
      `INSERT INTO report_configs (guild_id, review_channel_id, ping_role_id, ping_team_id, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (guild_id)
       DO UPDATE SET
         review_channel_id = COALESCE(EXCLUDED.review_channel_id, report_configs.review_channel_id),
         ping_role_id = COALESCE(EXCLUDED.ping_role_id, report_configs.ping_role_id),
         ping_team_id = COALESCE(EXCLUDED.ping_team_id, report_configs.ping_team_id),
         panel_title = COALESCE(EXCLUDED.panel_title, report_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, report_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, report_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, report_configs.panel_header_image_url),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, report_configs.panel_display_mode),
         updated_at = NOW()
       RETURNING *`,
      [guildId, input.reviewChannelId || null, input.pingRoleId || null, pingTeamId, input.panelTitle || null, input.panelDescription || null, input.panelColor || null, input.panelHeaderImageUrl || null, input.panelDisplayMode || null]
    );
    return result.rows[0];
  }

  async getConfig(guildId) {
    const result = await query(`SELECT * FROM report_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }


  async getReviewerRoleIds(guildId) {
    const config = await this.getConfig(guildId);
    if (!config) return [];
    const teamRoleIds = await getTeamRoleIds(config.ping_team_id);
    return [...new Set([config.ping_role_id, ...teamRoleIds].filter(Boolean))];
  }

  async createReport({ interaction, client, logger, type = 'General Report', targetUser = null, details, messageLink = null }) {
    const next = await query(nextNumberQuery('reports', 'report_number'), [interaction.guildId]);
    const reportNumber = Number(next.rows[0].next_number);
    const inserted = await query(
      `INSERT INTO reports (guild_id, report_number, reporter_user_id, reporter_user_tag, target_user_id, target_user_tag, report_type, message_link, details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN') RETURNING *`,
      [interaction.guildId, reportNumber, interaction.user.id, interaction.user.tag, targetUser?.id || null, targetUser?.tag || null, type, messageLink, details]
    );
    const report = inserted.rows[0];
    const config = await this.getConfig(interaction.guildId);
    const reviewChannel = await fetchSendableChannel(client, config?.review_channel_id);
    if (reviewChannel) {
      const teamRoleIds = await getTeamRoleIds(config?.ping_team_id);
      const mentions = [...new Set([config?.ping_role_id, ...teamRoleIds].filter(Boolean))].map((roleId) => `<@&${roleId}>`).join(' ');
      const sent = await reviewChannel.send({ content: mentions || undefined, ...buildReportReviewPayload(report) });
      await query(`UPDATE reports SET review_channel_id = $1, review_message_id = $2 WHERE id = $3`, [reviewChannel.id, sent.id, report.id]).catch(() => {});
      report.review_channel_id = reviewChannel.id;
      report.review_message_id = sent.id;
    }
    await logger.log({ guildId: interaction.guildId, eventKey: 'report-submit', title: 'Report Submitted', body: `Report #${report.report_number} submitted by ${interaction.user.tag}.${targetUser ? ` Target: ${targetUser.tag}.` : ''}`, actorUserId: interaction.user.id, metadata: { reportId: report.id, targetUserId: targetUser?.id || null } }).catch(() => {});
    return report;
  }

  async getReport(guildId, reportId) {
    const result = await query(`SELECT * FROM reports WHERE guild_id = $1 AND id = $2 LIMIT 1`, [guildId, reportId]);
    return result.rows[0] || null;
  }

  async claimReport({ guildId, reportId, reviewer, logger }) {
    const result = await query(`UPDATE reports SET status = 'CLAIMED', claimed_by_user_id = $1, updated_at = NOW() WHERE guild_id = $2 AND id = $3 AND status IN ('OPEN','CLAIMED') RETURNING *`, [reviewer.id, guildId, reportId]);
    const report = result.rows[0] || null;
    if (!report) return null;
    await logger.log({ guildId, eventKey: 'report-claim', title: 'Report Claimed', body: `Report #${report.report_number} claimed by ${reviewer.tag}.`, actorUserId: reviewer.id, metadata: { reportId } }).catch(() => {});
    return report;
  }

  async addDetails({ guildId, reportId, reviewer, details, logger }) {
    const result = await query(`UPDATE reports SET review_notes = CONCAT(COALESCE(review_notes, ''), $1), updated_at = NOW() WHERE guild_id = $2 AND id = $3 RETURNING *`, [`\n[${new Date().toISOString()}] ${reviewer.tag}: ${details}`, guildId, reportId]);
    const report = result.rows[0] || null;
    if (!report) return null;
    await logger.log({ guildId, eventKey: 'report-note', title: 'Report Details Added', body: `Details added to report #${report.report_number} by ${reviewer.tag}.`, actorUserId: reviewer.id, metadata: { reportId } }).catch(() => {});
    return report;
  }

  async reviewReport({ guildId, reportId, reviewer, status, logger, reason = null, details = null }) {
    const normalizedStatus = normalizeStatus(status);
    const note = details ? `\n[${new Date().toISOString()}] ${reviewer.tag}: ${details}` : null;
    const result = await query(
      `UPDATE reports
       SET status = $1,
           reviewed_by_user_id = $2,
           reviewed_at = NOW(),
           decision_reason = $3,
           review_notes = CASE WHEN $4::text IS NULL THEN review_notes ELSE CONCAT(COALESCE(review_notes, ''), $4) END,
           updated_at = NOW()
       WHERE guild_id = $5 AND id = $6
       RETURNING *`,
      [normalizedStatus, reviewer.id, reason || null, note, guildId, reportId]
    );
    const report = result.rows[0] || null;
    if (!report) return null;
    await logger.log({ guildId, eventKey: 'report-review', title: 'Report Reviewed', body: `Report #${report.report_number} marked **${report.status}** by ${reviewer.tag}.${reason ? ` Reason: ${reason}` : ''}`, actorUserId: reviewer.id, metadata: { reportId: report.id, status: report.status } }).catch(() => {});
    return report;
  }

  async refreshReviewMessage({ client, report }) {
    if (!report?.review_channel_id || !report?.review_message_id) return false;
    const channel = await fetchSendableChannel(client, report.review_channel_id);
    if (!channel || !channel.messages?.fetch) return false;
    const message = await channel.messages.fetch(report.review_message_id).catch(() => null);
    if (!message) return false;
    await message.edit(buildReportReviewPayload(report)).catch(() => {});
    return true;
  }

  async linkTicket({ guildId, reportId, ticketId, reviewer = null }) {
    const result = await query(
      `UPDATE reports
       SET linked_ticket_id = $1, linked_ticket_opened_by_user_id = $2, linked_ticket_opened_at = NOW(), updated_at = NOW()
       WHERE guild_id = $3 AND id = $4
       RETURNING *`,
      [ticketId, reviewer?.id || null, guildId, reportId]
    ).catch(() => ({ rows: [] }));
    return result.rows[0] || null;
  }
}

function buildReportReviewPayload(report) {
  const status = normalizeStatus(report.status || 'OPEN');
  const isResolved = status === 'RESOLVED';
  const isDismissed = status === 'DISMISSED';
  const isClosed = isResolved || isDismissed;
  const reviewedAt = formatTimestamp(report.reviewed_at);
  const ticketOpenedAt = formatTimestamp(report.linked_ticket_opened_at);
  const color = supportStatusColor(status, SlickBotColors.WARNING);

  const lines = [
    `Status: ${formatSupportStatus(status)}`,
    `Reporter: <@${report.reporter_user_id}>`,
    report.claimed_by_user_id ? `Claimed By: <@${report.claimed_by_user_id}>` : 'Claimed By: Not claimed',
    report.reviewed_by_user_id ? `Reviewed By: <@${report.reviewed_by_user_id}>${reviewedAt ? ` on ${reviewedAt}` : ''}` : null,
    report.decision_reason ? `Decision Reason: ${truncate(report.decision_reason, 700)}` : null,
    report.target_user_id ? `Target: <@${report.target_user_id}>` : null,
    report.message_link ? `Message: ${report.message_link}` : null,
    `Type: **${report.report_type}**`,
    report.linked_ticket_id ? `Follow-Up Ticket: Created${report.linked_ticket_opened_by_user_id ? ` by <@${report.linked_ticket_opened_by_user_id}>` : ''}${ticketOpenedAt ? ` on ${ticketOpenedAt}` : ''}` : null,
    '',
    '**Details**',
    truncate(report.details || 'No details provided.', 1500),
    report.review_notes ? `\n**Review Notes**\n${truncate(report.review_notes, 800)}` : null
  ].filter(Boolean);

  const embed = createBaseEmbed({
    title: `Report #${report.report_number}`,
    description: lines.join('\n'),
    color,
    footer: 'SlickBot Reports'
  });

  if (isClosed) return { embeds: [embed], components: [] };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.ReportClaimPrefix}${report.id}`).setLabel(status === 'CLAIMED' ? 'Claimed' : 'Claim').setStyle(ButtonStyle.Primary).setDisabled(status === 'CLAIMED'),
    new ButtonBuilder().setCustomId(`${CustomIds.ReportDetailsPrefix}${report.id}`).setLabel('Add Details').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${CustomIds.ReportOpenTicketPrefix}${report.id}`).setLabel(report.linked_ticket_id ? 'Ticket Opened' : 'Open Ticket').setStyle(ButtonStyle.Primary).setDisabled(Boolean(report.linked_ticket_id)),
    new ButtonBuilder().setCustomId(`${CustomIds.ReportResolvePrefix}${report.id}`).setLabel('Resolve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.ReportDismissPrefix}${report.id}`).setLabel('Dismiss').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row] };
}


function buildApplicationQuestionPayload(session, applicationName, question, questionIndex, questionCount) {
  const deadlineText = formatRelativeTimestamp(session.expires_at);
  const timeoutText = formatDuration(session.question_timeout_seconds || 180);
  return {
    embeds: [createBaseEmbed({
      title: `${applicationName} Application`,
      description: [
        `Question **${questionIndex + 1}** of **${questionCount}**`,
        '',
        `**${question.question_text}**`,
        '',
        question.required === false ? 'This question is optional. Reply with `skip` if you do not want to answer it.' : 'Reply to this DM with your answer.',
        '',
        `**Answer within:** ${deadlineText || timeoutText}`,
        deadlineText ? `Timeout length: **${timeoutText}**` : null
      ].filter(Boolean).join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: 'SlickBot Applications'
    })]
  };
}

function buildApplicationConfirmPayload(session, applicationName, answers) {
  const answerLines = Object.entries(answers || {}).map(([question, answer], index) => {
    return `**${index + 1}. ${question}**\n${truncate(String(answer || 'No answer provided.'), 500)}`;
  }).join('\n\n');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationSubmitPrefix}${session.id}`).setLabel('Submit Application').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationCancelPrefix}${session.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [createBaseEmbed({
      title: `${applicationName} Application Ready to Submit`,
      description: [
        'Review your answers below, then choose whether to submit or cancel this application.',
        '',
        answerLines || 'No answers recorded.'
      ].join('\n'),
      color: SlickBotColors.INFO,
      footer: 'SlickBot Applications'
    })],
    components: [row]
  };
}

class ApplicationService {

  async setupType(guildId, input) {
    const result = await query(
      `INSERT INTO application_types (guild_id, name, description, review_channel_id, pending_role_id, approved_role_id, auto_assign_approved_role, submission_confirmation_message, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode, question_timeout_seconds, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 180), true)
       ON CONFLICT (guild_id, name) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, application_types.description),
         review_channel_id = COALESCE(EXCLUDED.review_channel_id, application_types.review_channel_id),
         pending_role_id = COALESCE(EXCLUDED.pending_role_id, application_types.pending_role_id),
         approved_role_id = COALESCE(EXCLUDED.approved_role_id, application_types.approved_role_id),
         auto_assign_approved_role = EXCLUDED.auto_assign_approved_role,
         submission_confirmation_message = COALESCE(EXCLUDED.submission_confirmation_message, application_types.submission_confirmation_message),
         panel_title = COALESCE(EXCLUDED.panel_title, application_types.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, application_types.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, application_types.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, application_types.panel_header_image_url),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, application_types.panel_display_mode),
         question_timeout_seconds = CASE WHEN $14 IS NULL THEN application_types.question_timeout_seconds ELSE EXCLUDED.question_timeout_seconds END,
         enabled = true,
         updated_at = NOW() RETURNING *`,
      [guildId, input.name, input.description || null, input.reviewChannelId || null, input.pendingRoleId || null, input.approvedRoleId || null, Boolean(input.autoAssignApprovedRole), input.submissionConfirmationMessage || null, input.panelTitle || null, input.panelDescription || null, input.panelColor || null, input.panelHeaderImageUrl || null, input.panelDisplayMode || null, input.questionTimeoutSeconds == null ? null : clampApplicationTimeoutSeconds(input.questionTimeoutSeconds)]
    );
    return result.rows[0];
  }

  async getTypeByName(guildId, name) {
    const result = await query(`SELECT * FROM application_types WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [guildId, name]);
    return result.rows[0] || null;
  }

  async getTypeById(guildId, id) {
    const result = await query(`SELECT * FROM application_types WHERE guild_id = $1 AND id = $2 LIMIT 1`, [guildId, id]);
    return result.rows[0] || null;
  }

  async getQuestions(applicationTypeId) {
    const result = await query(`SELECT * FROM application_questions WHERE application_type_id = $1 ORDER BY display_order ASC, created_at ASC`, [applicationTypeId]);
    return result.rows;
  }

  async addQuestion(guildId, typeName, questionText, required = true, order = null) {
    const type = await this.getTypeByName(guildId, typeName);
    if (!type) return null;
    const nextOrder = order || ((await this.getQuestions(type.id)).length + 1);
    const result = await query(`INSERT INTO application_questions (application_type_id, question_text, required, display_order) VALUES ($1, $2, $3, $4) RETURNING *`, [type.id, questionText, Boolean(required), nextOrder]);
    return result.rows[0];
  }

  async clearQuestions(guildId, typeName) {
    const type = await this.getTypeByName(guildId, typeName);
    if (!type) return null;
    await query(`DELETE FROM application_questions WHERE application_type_id = $1`, [type.id]);
    return type;
  }


  async deleteType(guildId, typeName) {
    const type = await this.getTypeByName(guildId, typeName);
    if (!type) return { ok: false, reason: 'Application type not found.' };
    await query(`DELETE FROM application_types WHERE guild_id = $1 AND id = $2`, [guildId, type.id]);
    return { ok: true, type };
  }

  async startApplicationDm({ interaction, client, logger, applicationType }) {
    const duplicate = await query(`SELECT id FROM application_submissions WHERE guild_id = $1 AND application_type_id = $2 AND applicant_user_id = $3 AND status = 'PENDING' LIMIT 1`, [interaction.guildId, applicationType.id, interaction.user.id]);
    if (duplicate.rowCount > 0) return { ok: false, reason: 'You already have a pending application for this type.' };

    await query(`UPDATE application_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE applicant_user_id = $1 AND status = 'ACTIVE'`, [interaction.user.id]).catch(() => {});
    const refreshedQuestions = await this.getQuestions(applicationType.id);
    if (!refreshedQuestions.length) {
      return { ok: false, reason: 'This application type does not have any questions configured yet. Staff must add questions with `/application question-add` before users can apply.' };
    }

    const dm = await interaction.user.createDM().catch(() => null);
    if (!dm) {
      await query(`UPDATE application_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE applicant_user_id = $1 AND status = 'ACTIVE'`, [interaction.user.id]).catch(() => {});
      return { ok: false, reason: 'I could not DM you. Please enable server DMs and try again.' };
    }

    const timeoutSeconds = clampApplicationTimeoutSeconds(applicationType.question_timeout_seconds || 180);
    const expiresAt = getSessionDeadline(timeoutSeconds);
    const insertedSession = await query(
      `INSERT INTO application_sessions (guild_id, application_type_id, applicant_user_id, applicant_user_tag, current_index, answers, status, expires_at) VALUES ($1, $2, $3, $4, 0, '{}'::jsonb, 'ACTIVE', $5) RETURNING *`,
      [interaction.guildId, applicationType.id, interaction.user.id, interaction.user.tag, expiresAt.toISOString()]
    );
    await dm.send({ embeds: [createBaseEmbed({ title: `${applicationType.name} Application Started`, description: [`SlickBot will ask **${refreshedQuestions.length}** question(s), one at a time.`, `You have **${formatDuration(timeoutSeconds)}** to answer each question.`, 'If you do not answer a question in time, your application will be cancelled.', '', 'The first question is below.'].join('\n'), color: SlickBotColors.PRIMARY, footer: 'SlickBot Applications' })] });
    await dm.send(buildApplicationQuestionPayload({ ...insertedSession.rows[0], question_timeout_seconds: timeoutSeconds }, applicationType.name, refreshedQuestions[0], 0, refreshedQuestions.length));
    await logger.log({ guildId: interaction.guildId, eventKey: 'application-start', title: 'Application Started', body: `${interaction.user.tag} started a DM application for ${applicationType.name}.`, actorUserId: interaction.user.id }).catch(() => {});
    return { ok: true, questionCount: refreshedQuestions.length };
  }

  async handleDmResponse({ message, client, logger }) {
    if (message.author.bot || !message.channel || message.guild) return false;
    const sessionResult = await query(`SELECT s.*, t.name AS application_name, t.review_channel_id, t.pending_role_id, t.approved_role_id, t.auto_assign_approved_role, t.submission_confirmation_message, t.question_timeout_seconds FROM application_sessions s INNER JOIN application_types t ON t.id = s.application_type_id WHERE s.applicant_user_id = $1 AND s.status = 'ACTIVE' ORDER BY s.updated_at DESC LIMIT 1`, [message.author.id]).catch(() => ({ rows: [] }));
    const session = sessionResult.rows[0];
    if (!session) return false;

    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
      await this.cancelExpiredSession({ session, client, logger, user: message.author, dmChannel: message.channel }).catch(() => null);
      return true;
    }

    const questions = await this.getQuestions(session.application_type_id);
    const current = questions[session.current_index];
    if (!current) return false;

    const answers = parseJson(session.answers, {});
    const rawAnswer = String(message.content || '').trim();
    answers[current.question_text] = current.required === false && rawAnswer.toLowerCase() === 'skip' ? '[Skipped]' : (rawAnswer || '[No text response]');
    const nextIndex = session.current_index + 1;

    if (nextIndex < questions.length) {
      const timeoutSeconds = clampApplicationTimeoutSeconds(session.question_timeout_seconds || 180);
      const expiresAt = getSessionDeadline(timeoutSeconds);
      const updatedSession = await query(`UPDATE application_sessions SET current_index = $1, answers = $2, expires_at = $3, updated_at = NOW() WHERE id = $4 RETURNING *`, [nextIndex, safeJson(answers), expiresAt.toISOString(), session.id]);
      await message.channel.send(buildApplicationQuestionPayload({ ...updatedSession.rows[0], question_timeout_seconds: timeoutSeconds }, session.application_name, questions[nextIndex], nextIndex, questions.length));
      return true;
    }

    const updatedSession = await query(`UPDATE application_sessions SET current_index = $1, answers = $2, status = 'AWAITING_CONFIRMATION', expires_at = NULL, updated_at = NOW() WHERE id = $3 RETURNING *`, [nextIndex, safeJson(answers), session.id]);
    await message.channel.send(buildApplicationConfirmPayload(updatedSession.rows[0], session.application_name, answers));
    return true;
  }


  async cancelExpiredSession({ session, client = null, logger = null, user = null, dmChannel = null }) {
    const result = await query(
      `UPDATE application_sessions
       SET status = 'CANCELLED', expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING *`,
      [session.id]
    );
    const cancelled = result.rows[0] || null;
    if (!cancelled) return null;

    const applicationName = session.application_name || 'application';
    const cancellationMessage = {
      embeds: [createBaseEmbed({
        title: 'Application Cancelled',
        description: `Your application for **${applicationName}** was cancelled because you did not respond in time.`,
        color: SlickBotColors.WARNING,
        footer: 'SlickBot Applications'
      })]
    };

    if (dmChannel && typeof dmChannel.send === 'function') {
      await dmChannel.send(cancellationMessage).catch(() => null);
    } else {
      const targetUser = user || (client ? await client.users.fetch(session.applicant_user_id).catch(() => null) : null);
      await targetUser?.send(cancellationMessage).catch(() => null);
    }

    await logger?.log({
      guildId: session.guild_id,
      eventKey: 'application-cancel',
      title: 'Application Timed Out',
      body: `${session.applicant_user_tag || session.applicant_user_id} did not respond to ${applicationName} in time.`,
      actorUserId: session.applicant_user_id,
      metadata: { sessionId: session.id, applicationTypeId: session.application_type_id, reason: 'timeout' }
    }).catch(() => {});
    return cancelled;
  }

  async processExpiredSessions(client, logger = null, limit = 25) {
    const result = await query(
      `SELECT s.*, t.name AS application_name, t.question_timeout_seconds
       FROM application_sessions s
       INNER JOIN application_types t ON t.id = s.application_type_id
       WHERE s.status = 'ACTIVE' AND s.expires_at IS NOT NULL AND s.expires_at <= NOW()
       ORDER BY s.expires_at ASC
       LIMIT $1`,
      [limit]
    ).catch(() => ({ rows: [] }));

    let cancelled = 0;
    for (const session of result.rows) {
      const updated = await this.cancelExpiredSession({ session, client, logger }).catch(() => null);
      if (updated) cancelled += 1;
    }
    return { checked: result.rows.length, cancelled };
  }


  async cancelSession({ sessionId, user, logger = null }) {
    const result = await query(`UPDATE application_sessions SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND applicant_user_id = $2 AND status IN ('ACTIVE','AWAITING_CONFIRMATION') RETURNING *`, [sessionId, user.id]);
    const session = result.rows[0] || null;
    if (session && logger) await logger.log({ guildId: session.guild_id, eventKey: 'application-cancel', title: 'Application Cancelled', body: `${user.tag} cancelled an application before submission.`, actorUserId: user.id, metadata: { sessionId } }).catch(() => {});
    return session;
  }

  async submitSession({ sessionId, user, client, logger }) {
    const result = await query(`SELECT s.*, t.*,
      s.id AS session_id,
      t.id AS app_type_id,
      t.name AS application_name
      FROM application_sessions s INNER JOIN application_types t ON t.id = s.application_type_id
      WHERE s.id = $1 AND s.applicant_user_id = $2 AND s.status = 'AWAITING_CONFIRMATION' LIMIT 1`, [sessionId, user.id]);
    const session = result.rows[0];
    if (!session) return { ok: false, reason: 'This application session could not be found or is no longer waiting for confirmation.' };
    const guild = await client.guilds.fetch(session.guild_id).catch(() => null);
    const applicationType = await this.getTypeById(session.guild_id, session.application_type_id);
    const answers = parseJson(session.answers, {});
    const submission = await this.submitApplicationDirect({ guildId: session.guild_id, guild, user, client, logger, applicationType, answers });
    if (!submission.ok) return submission;
    await query(`UPDATE application_sessions SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [sessionId]);
    return { ...submission, applicationType };
  }

  async submitApplicationDirect({ guildId, guild, user, client, logger, applicationType, answers }) {
    const duplicate = await query(`SELECT id FROM application_submissions WHERE guild_id = $1 AND application_type_id = $2 AND applicant_user_id = $3 AND status = 'PENDING' LIMIT 1`, [guildId, applicationType.id, user.id]);
    if (duplicate.rowCount > 0) return { ok: false, reason: 'You already have a pending application for this type.' };
    const next = await query(nextNumberQuery('application_submissions', 'submission_number'), [guildId]);
    const submissionNumber = Number(next.rows[0].next_number);
    const inserted = await query(`INSERT INTO application_submissions (guild_id, submission_number, application_type_id, application_name, applicant_user_id, applicant_user_tag, answers, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING') RETURNING *`, [guildId, submissionNumber, applicationType.id, applicationType.name, user.id, user.tag, safeJson(answers)]);
    const submission = inserted.rows[0];
    if (guild && applicationType.pending_role_id) {
      const member = await guild.members.fetch(user.id).catch(() => null);
      await member?.roles.add(applicationType.pending_role_id, `SlickBot application #${submission.submission_number} pending`).catch(() => {});
    }
    const reviewChannel = await fetchSendableChannel(client, applicationType.review_channel_id);
    if (reviewChannel) {
      const reviewSubmission = {
        ...submission,
        pending_role_id: applicationType.pending_role_id,
        approved_role_id: applicationType.approved_role_id,
        auto_assign_approved_role: applicationType.auto_assign_approved_role
      };
      const sent = await reviewChannel.send(buildApplicationReviewPayload(reviewSubmission)).catch(() => null);
      if (sent) {
        await query(`UPDATE application_submissions SET review_channel_id = $1, review_message_id = $2, updated_at = NOW() WHERE id = $3`, [reviewChannel.id, sent.id, submission.id]).catch(() => {});
        submission.review_channel_id = reviewChannel.id;
        submission.review_message_id = sent.id;
      }
    }
    await logger.log({ guildId, eventKey: 'application-submit', title: 'Application Submitted', body: `${user.tag} submitted ${applicationType.name} application #${submission.submission_number}.`, actorUserId: user.id, metadata: { submissionId: submission.id, applicationTypeId: applicationType.id } }).catch(() => {});
    return { ok: true, submission };
  }

  async submitApplication({ interaction, client, logger, applicationType, answers }) {
    return this.submitApplicationDirect({ guildId: interaction.guildId, guild: interaction.guild, user: interaction.user, client, logger, applicationType, answers });
  }

  async openReviewThread({ interaction, client, logger, submissionId }) {
    const fetchResult = await query(`SELECT s.*, t.pending_role_id, t.approved_role_id, t.auto_assign_approved_role FROM application_submissions s INNER JOIN application_types t ON t.id = s.application_type_id WHERE s.guild_id = $1 AND s.id = $2 LIMIT 1`, [interaction.guildId, submissionId]);
    const submission = fetchResult.rows[0];
    if (!submission) return { ok: false, reason: 'The application could not be found.' };

    if (submission.review_thread_id) {
      const existingThread = await client.channels.fetch(submission.review_thread_id).catch(() => null);
      if (existingThread) {
        if (existingThread.archived && typeof existingThread.setArchived === 'function') await existingThread.setArchived(false, 'SlickBot application review reopened.').catch(() => {});
        await logger.log({ guildId: interaction.guildId, eventKey: 'application-review', title: 'Application Review Thread Opened', body: `${interaction.user.tag} opened the review thread for ${submission.application_name} application #${submission.submission_number}.`, actorUserId: interaction.user.id, metadata: { submissionId: submission.id, threadId: existingThread.id } }).catch(() => {});
        return { ok: true, submission, thread: existingThread, existing: true };
      }
    }

    if (!interaction.message || typeof interaction.message.startThread !== 'function') return { ok: false, reason: 'This review message cannot create a thread.' };
    const thread = await interaction.message.startThread({
      name: buildApplicationThreadName(submission),
      autoArchiveDuration: 1440,
      reason: `SlickBot application #${submission.submission_number} review thread opened by ${interaction.user.tag}`
    }).catch(() => null);
    if (!thread) return { ok: false, reason: 'I could not create a review thread. Check my thread permissions in this channel.' };

    await query(
      `UPDATE application_submissions SET review_channel_id = COALESCE(review_channel_id, $1), review_message_id = COALESCE(review_message_id, $2), review_thread_id = $3, updated_at = NOW() WHERE guild_id = $4 AND id = $5`,
      [interaction.channelId, interaction.message.id, thread.id, interaction.guildId, submission.id]
    ).catch(() => {});
    submission.review_channel_id = submission.review_channel_id || interaction.channelId;
    submission.review_message_id = submission.review_message_id || interaction.message.id;
    submission.review_thread_id = thread.id;

    await thread.send(buildApplicationReviewThreadPayload(submission)).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'application-review', title: 'Application Review Thread Created', body: `${interaction.user.tag} created a review thread for ${submission.application_name} application #${submission.submission_number}.`, actorUserId: interaction.user.id, metadata: { submissionId: submission.id, threadId: thread.id } }).catch(() => {});
    return { ok: true, submission, thread, existing: false };
  }

  async reviewApplication({ interaction, client, logger, submissionId, status, reason = null }) {
    const fetchResult = await query(`SELECT s.*, t.pending_role_id, t.approved_role_id, t.auto_assign_approved_role FROM application_submissions s INNER JOIN application_types t ON t.id = s.application_type_id WHERE s.guild_id = $1 AND s.id = $2 LIMIT 1`, [interaction.guildId, submissionId]);
    const submission = fetchResult.rows[0];
    if (!submission) return null;
    const nextStatus = normalizeStatus(status);
    const result = await query(`UPDATE application_submissions SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW(), review_reason = $3, updated_at = NOW() WHERE id = $4 RETURNING *`, [nextStatus, interaction.user.id, reason || null, submission.id]);
    const updated = result.rows[0];
    const member = await interaction.guild.members.fetch(submission.applicant_user_id).catch(() => null);
    if (member && submission.pending_role_id) await member.roles.remove(submission.pending_role_id).catch(() => {});
    if (member && nextStatus === 'APPROVED' && submission.auto_assign_approved_role && submission.approved_role_id) await member.roles.add(submission.approved_role_id, `SlickBot application #${submission.submission_number} approved`).catch(() => {});
    await this.refreshReviewMessage({ client, submission: { ...submission, ...updated } }).catch(() => {});
    await this.closeReviewThread({ client, submission: { ...submission, ...updated } }).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'application-review', title: 'Application Reviewed', body: `${submission.application_name} application #${submission.submission_number} marked **${nextStatus}** by ${interaction.user.tag}.${reason ? ` Reason: ${reason}` : ''}`, actorUserId: interaction.user.id, metadata: { submissionId: submission.id, status: nextStatus } }).catch(() => {});
    return updated;
  }

  async refreshReviewMessage({ client, submission }) {
    if (!submission?.review_channel_id || !submission?.review_message_id) return false;
    const channel = await fetchSendableChannel(client, submission.review_channel_id);
    if (!channel || !channel.messages?.fetch) return false;
    const message = await channel.messages.fetch(submission.review_message_id).catch(() => null);
    if (!message) return false;
    const payload = buildApplicationReviewPayload(submission);
    if (['APPROVED', 'DENIED'].includes(normalizeStatus(submission.status))) payload.files = [buildApplicationTranscriptAttachment(submission)];
    await message.edit(payload).catch(() => {});
    return true;
  }

  async closeReviewThread({ client, submission }) {
    if (!submission?.review_thread_id) return false;
    const thread = await client.channels.fetch(submission.review_thread_id).catch(() => null);
    if (!thread) return false;
    if (typeof thread.send === 'function') {
      await thread.send({ embeds: [createBaseEmbed({ title: 'Application Review Closed', description: `Application #${submission.submission_number} was marked **${normalizeStatus(submission.status)}**. This review thread will now close.`, color: normalizeStatus(submission.status) === 'APPROVED' ? SlickBotColors.SUCCESS : SlickBotColors.ERROR, footer: 'SlickBot Applications' })] }).catch(() => {});
    }
    if (typeof thread.setLocked === 'function') await thread.setLocked(true, 'SlickBot application review completed.').catch(() => {});
    if (typeof thread.setArchived === 'function') await thread.setArchived(true, 'SlickBot application review completed.').catch(() => {});
    return true;
  }
}

function buildApplicationReviewPayload(submission) {
  const status = normalizeStatus(submission.status || 'PENDING');
  const isClosed = status === 'APPROVED' || status === 'DENIED';
  const reviewedAt = formatTimestamp(submission.reviewed_at);
  const submittedAt = formatTimestamp(submission.created_at);
  const color = supportStatusColor(status, SlickBotColors.WARNING);

  const embed = createBaseEmbed({
    title: `${submission.application_name} Application #${submission.submission_number}`,
    description: [
      `Status: ${formatSupportStatus(status)}`,
      `Applicant: <@${submission.applicant_user_id}>`,
      submittedAt ? `Submitted: ${submittedAt}` : null,
      submission.reviewed_by_user_id ? `Reviewed By: <@${submission.reviewed_by_user_id}>${reviewedAt ? ` on ${reviewedAt}` : ''}` : null,
      submission.review_reason ? `Review Reason: ${truncate(submission.review_reason, 700)}` : null,
      submission.pending_role_id ? `Pending Role: <@&${submission.pending_role_id}>` : null,
      submission.approved_role_id ? `Approved Role: <@&${submission.approved_role_id}>` : null,
      submission.review_thread_id ? `Review Thread: <#${submission.review_thread_id}>` : null,
      '',
      '**Answers**',
      buildQuestionLines(submission.answers)
    ].filter(Boolean).join('\n'),
    color,
    footer: 'SlickBot Applications'
  });

  if (isClosed) return { embeds: [embed], components: [] };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationApprovePrefix}${submission.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationDenyPrefix}${submission.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationReviewThreadPrefix}${submission.id}`).setLabel('Open Review Thread').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

class AppealService {
  async updateConfig(guildId, input) {
    const has = (key) => Object.prototype.hasOwnProperty.call(input, key);
    const result = await query(
      `INSERT INTO appeal_configs (guild_id, review_channel_id, dm_decision_enabled, dm_include_submission, panel_title, panel_description, panel_color, panel_header_image_url, panel_display_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (guild_id) DO UPDATE SET
         review_channel_id = COALESCE(EXCLUDED.review_channel_id, appeal_configs.review_channel_id),
         dm_decision_enabled = COALESCE(EXCLUDED.dm_decision_enabled, appeal_configs.dm_decision_enabled),
         dm_include_submission = COALESCE(EXCLUDED.dm_include_submission, appeal_configs.dm_include_submission),
         panel_title = COALESCE(EXCLUDED.panel_title, appeal_configs.panel_title),
         panel_description = COALESCE(EXCLUDED.panel_description, appeal_configs.panel_description),
         panel_color = COALESCE(EXCLUDED.panel_color, appeal_configs.panel_color),
         panel_header_image_url = COALESCE(EXCLUDED.panel_header_image_url, appeal_configs.panel_header_image_url),
         panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, appeal_configs.panel_display_mode),
         updated_at = NOW() RETURNING *`,
      [
        guildId,
        input.reviewChannelId || null,
        has('dmDecisionEnabled') ? Boolean(input.dmDecisionEnabled) : null,
        has('dmIncludeSubmission') ? Boolean(input.dmIncludeSubmission) : null,
        input.panelTitle || null,
        input.panelDescription || null,
        input.panelColor || null,
        input.panelHeaderImageUrl || null,
        input.panelDisplayMode || null
      ]
    );
    return result.rows[0];
  }

  async getConfig(guildId) {
    const result = await query(`SELECT * FROM appeal_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async submitAppeal({ interaction, client, logger, caseNumber, reason, details }) {
    const next = await query(nextNumberQuery('appeals', 'appeal_number'), [interaction.guildId]);
    const appealNumber = Number(next.rows[0].next_number);
    const inserted = await query(
      `INSERT INTO appeals (guild_id, appeal_number, appellant_user_id, appellant_user_tag, case_number, reason, details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING') RETURNING *`,
      [interaction.guildId, appealNumber, interaction.user.id, interaction.user.tag, caseNumber || null, reason, details || null]
    );
    const appeal = inserted.rows[0];
    const config = await this.getConfig(interaction.guildId);
    const reviewChannel = await fetchSendableChannel(client, config?.review_channel_id);
    if (reviewChannel) {
      const sent = await reviewChannel.send(buildAppealReviewPayload(appeal));
      await query(`UPDATE appeals SET review_channel_id = $1, review_message_id = $2 WHERE id = $3`, [reviewChannel.id, sent.id, appeal.id]).catch(() => {});
      appeal.review_channel_id = reviewChannel.id;
      appeal.review_message_id = sent.id;
    }
    await logger.log({ guildId: interaction.guildId, eventKey: 'appeal-submit', title: 'Appeal Submitted', body: `Appeal #${appeal.appeal_number} submitted by ${interaction.user.tag}${caseNumber ? ` for case #${caseNumber}` : ''}.`, actorUserId: interaction.user.id, metadata: { appealId: appeal.id, caseNumber } }).catch(() => {});
    return appeal;
  }

  async reviewAppeal({ interaction, client, logger, appealId, status, reason = null }) {
    const nextStatus = normalizeStatus(status);
    const result = await query(
      `UPDATE appeals SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW(), decision_reason = $3, updated_at = NOW()
       WHERE guild_id = $4 AND id = $5 RETURNING *`,
      [nextStatus, interaction.user.id, reason || null, interaction.guildId, appealId]
    );
    const appeal = result.rows[0] || null;
    if (!appeal) return null;
    const config = await this.getConfig(interaction.guildId);
    if (config?.dm_decision_enabled) {
      const user = await client.users.fetch(appeal.appellant_user_id).catch(() => null);
      await user?.send(buildAppealDecisionDmPayload(appeal, config)).catch(() => {});
    }
    await this.refreshReviewMessage({ client, appeal }).catch(() => {});
    await logger.log({ guildId: interaction.guildId, eventKey: 'appeal-review', title: 'Appeal Reviewed', body: `Appeal #${appeal.appeal_number} marked **${nextStatus}** by ${interaction.user.tag}.${reason ? ` Reason: ${reason}` : ''}`, actorUserId: interaction.user.id, metadata: { appealId: appeal.id, status: nextStatus } }).catch(() => {});
    return appeal;
  }

  async refreshReviewMessage({ client, appeal }) {
    if (!appeal?.review_channel_id || !appeal?.review_message_id) return false;
    const channel = await fetchSendableChannel(client, appeal.review_channel_id);
    if (!channel || !channel.messages?.fetch) return false;
    const message = await channel.messages.fetch(appeal.review_message_id).catch(() => null);
    if (!message) return false;
    await message.edit(buildAppealReviewPayload(appeal));
    return true;
  }
}
function buildAppealReviewPayload(appeal) {
  const status = normalizeStatus(appeal.status || 'PENDING');
  const isClosed = status === 'APPROVED' || status === 'DENIED';
  const reviewedAt = formatTimestamp(appeal.reviewed_at);
  const color = supportStatusColor(status, SlickBotColors.WARNING);

  const embed = createBaseEmbed({
    title: `Appeal #${appeal.appeal_number}`,
    description: [
      `Status: ${formatSupportStatus(status)}`,
      `Appellant: <@${appeal.appellant_user_id}>`,
      appeal.case_number ? `Case: **#${appeal.case_number}**` : 'Case: Not provided',
      appeal.reviewed_by_user_id ? `Reviewed By: <@${appeal.reviewed_by_user_id}>${reviewedAt ? ` on ${reviewedAt}` : ''}` : null,
      appeal.decision_reason ? `Decision Reason: ${truncate(appeal.decision_reason, 700)}` : null,
      '',
      '**Reason**',
      truncate(appeal.reason || 'No reason provided.', 1200),
      '',
      '**Details**',
      truncate(appeal.details || 'No extra details provided.', 1200)
    ].filter(Boolean).join('\n'),
    color,
    footer: 'SlickBot Appeals'
  });

  if (isClosed) return { embeds: [embed], components: [] };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.AppealApproveReasonPrefix}${appeal.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.AppealDenyReasonPrefix}${appeal.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row] };
}

function buildAppealDecisionDmPayload(appeal, config) {
  const status = normalizeStatus(appeal.status || 'REVIEWED');
  const lines = [
    `Your appeal #${appeal.appeal_number} has been marked **${status}**.`,
    appeal.decision_reason ? `Reason: ${appeal.decision_reason}` : null
  ];

  if (config?.dm_include_submission) {
    lines.push(
      '',
      '**Original Submission**',
      appeal.case_number ? `Case: **#${appeal.case_number}**` : 'Case: Not provided',
      '',
      '**Reason**',
      truncate(appeal.reason || 'No reason provided.', 1000),
      '',
      '**Details**',
      truncate(appeal.details || 'No extra details provided.', 1000)
    );
  }

  return {
    embeds: [createBaseEmbed({
      title: `Appeal #${appeal.appeal_number} Decision`,
      description: lines.filter(Boolean).join('\n'),
      color: status === 'APPROVED' ? SlickBotColors.SUCCESS : status === 'DENIED' ? SlickBotColors.ERROR : SlickBotColors.WARNING,
      footer: 'SlickBot Appeals'
    })]
  };
}

function buildTicketModal(ticketType = null) {
  const questions = parseJson(ticketType?.questions, []);
  const typeId = ticketType?.id || 'default';
  const modal = new ModalBuilder().setCustomId(`${CustomIds.TicketModalPrefix}${typeId}`).setTitle(`${ticketType?.label || ticketType?.name || 'Support'} Ticket`.slice(0, 45));
  const rows = [new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100))];
  const usableQuestions = questions.length ? questions.slice(0, 4) : [{ label: 'How can staff help?', required: true }];
  usableQuestions.forEach((question, index) => {
    rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`q${index}`).setLabel(String(question.label || question.question || `Question ${index + 1}`).slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(question.required !== false).setMaxLength(1500)));
  });
  return modal.addComponents(...rows.slice(0, 5));
}

function buildReportModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.ReportModal)
    .setTitle('Submit Report')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('User ID / Username / Message Link').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('What happened?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800))
    );
}

function buildReportDetailsModal(reportId) {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.ReportDetailsModalPrefix}${reportId}`)
    .setTitle('Add Report Details')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Details to add').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)));
}

function buildReportReviewReasonModal(reportId, status) {
  const isResolve = normalizeStatus(status) === 'RESOLVED';
  return new ModalBuilder()
    .setCustomId(`${CustomIds.ReportReviewReasonModalPrefix}${normalizeStatus(status)}:${reportId}`)
    .setTitle(`${isResolve ? 'Resolve' : 'Dismiss'} Report`)
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel(`${isResolve ? 'Resolution' : 'Dismissal'} reason`).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
}

function buildAppealModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.AppealModal)
    .setTitle('Submit Appeal')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('case_number').setLabel('Case number, if known').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Why should this be reviewed?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Additional context').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))
    );
}

function buildAppealReasonModal(appealId, status) {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.AppealReasonModalPrefix}${status}:${appealId}`)
    .setTitle(`${status === 'APPROVED' ? 'Approve' : 'Deny'} Appeal With Reason`)
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Decision reason').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)));
}

function buildApplicationReviewReasonModal(submissionId, status) {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.ApplicationReviewReasonModalPrefix}${status}:${submissionId}`)
    .setTitle(`${status === 'APPROVED' ? 'Approve' : 'Deny'} Application`)
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Decision reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
}

module.exports = {
  TicketService,
  ReportService,
  ApplicationService,
  AppealService,
  buildTicketModal,
  buildReportModal,
  buildReportDetailsModal,
  buildReportReviewReasonModal,
  buildAppealModal,
  buildAppealReasonModal,
  buildApplicationReviewReasonModal,
  buildReportReviewPayload,
  buildApplicationReviewPayload,
  buildAppealReviewPayload
};
