const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');
const { truncate } = require('../../utils/format');

function nextNumberQuery(table, numberColumn) {
  return `SELECT COALESCE(MAX(${numberColumn}), 0) + 1 AS next_number FROM ${table} WHERE guild_id = $1`;
}

function safeJson(value) {
  return value ? JSON.stringify(value) : null;
}

function normalizeStatus(status) {
  return String(status || '').toUpperCase();
}

async function fetchSendableChannel(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased || !channel.isTextBased()) return null;
  if (typeof channel.send !== 'function') return null;
  return channel;
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
      `INSERT INTO ticket_configs (guild_id, category_id, log_channel_id, staff_role_id, ticket_limit, transcript_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (guild_id)
       DO UPDATE SET
         category_id = COALESCE(EXCLUDED.category_id, ticket_configs.category_id),
         log_channel_id = COALESCE(EXCLUDED.log_channel_id, ticket_configs.log_channel_id),
         staff_role_id = COALESCE(EXCLUDED.staff_role_id, ticket_configs.staff_role_id),
         ticket_limit = COALESCE(EXCLUDED.ticket_limit, ticket_configs.ticket_limit),
         transcript_enabled = COALESCE(EXCLUDED.transcript_enabled, ticket_configs.transcript_enabled),
         updated_at = NOW()
       RETURNING *`,
      [
        guildId,
        input.categoryId || null,
        input.logChannelId || null,
        input.staffRoleId || null,
        input.ticketLimit || null,
        typeof input.transcriptEnabled === 'boolean' ? input.transcriptEnabled : null
      ]
    );
    return result.rows[0];
  }

  async createTicket({ interaction, client, logger, type = 'Admin Support', subject, details }) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    const config = await this.getConfig(guildId);

    const openCount = await query(
      `SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND opener_user_id = $2 AND status = 'OPEN'`,
      [guildId, interaction.user.id]
    );

    const limit = config.ticket_limit || 1;
    if ((openCount.rows[0]?.count || 0) >= limit) {
      return { ok: false, reason: `You already have the maximum number of open tickets allowed (**${limit}**).` };
    }

    const next = await query(nextNumberQuery('tickets', 'ticket_number'), [guildId]);
    const ticketNumber = Number(next.rows[0].next_number);
    const channelName = `ticket-${interaction.user.username}-${String(ticketNumber).padStart(4, '0')}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 90);

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
    ];

    if (botMember) {
      overwrites.push({ id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
    }

    if (config.staff_role_id) {
      overwrites.push({ id: config.staff_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.category_id || null,
      topic: `SlickBot ticket #${ticketNumber} opened by ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: overwrites,
      reason: `SlickBot ticket #${ticketNumber}`
    });

    const insert = await query(
      `INSERT INTO tickets (guild_id, ticket_number, channel_id, opener_user_id, opener_user_tag, type, subject, details, status, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 'NORMAL')
       RETURNING *`,
      [guildId, ticketNumber, channel.id, interaction.user.id, interaction.user.tag, type, subject || 'Support Request', details || null]
    );
    const ticket = insert.rows[0];

    const embed = createBaseEmbed({
      title: `Ticket #${ticket.ticket_number}: ${ticket.subject}`,
      description: [
        `Opened By: <@${ticket.opener_user_id}>`,
        `Type: **${ticket.type}**`,
        `Priority: **${ticket.priority}**`,
        '',
        '**Details**',
        truncate(ticket.details || 'No details provided.', 1800),
        '',
        'Staff can claim or close this ticket using the controls below.'
      ].join('\n'),
      color: SlickBotColors.PRIMARY,
      footer: 'SlickBot Tickets'
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CustomIds.TicketClaim).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
      new ButtonBuilder().setCustomId(CustomIds.TicketClose).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await channel.send({ content: `<@${interaction.user.id}>${config.staff_role_id ? ` <@&${config.staff_role_id}>` : ''}`, embeds: [embed], components: [row] });

    await logger.log({
      guildId,
      eventKey: 'ticket-open',
      title: 'Ticket Opened',
      body: `Ticket #${ticket.ticket_number} opened by ${interaction.user.tag} in <#${channel.id}>.`,
      actorUserId: interaction.user.id,
      metadata: { ticketId: ticket.id, channelId: channel.id }
    }).catch(() => {});

    return { ok: true, ticket, channel };
  }

  async findOpenTicketByChannel(guildId, channelId) {
    const result = await query(
      `SELECT * FROM tickets WHERE guild_id = $1 AND channel_id = $2 AND status = 'OPEN' LIMIT 1`,
      [guildId, channelId]
    );
    return result.rows[0] || null;
  }

  async claimTicket({ interaction, logger }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const result = await query(
      `UPDATE tickets SET claimed_by_user_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [interaction.user.id, ticket.id]
    );

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'ticket-claim',
      title: 'Ticket Claimed',
      body: `Ticket #${ticket.ticket_number} claimed by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id,
      metadata: { ticketId: ticket.id }
    }).catch(() => {});

    return { ok: true, ticket: result.rows[0] };
  }

  async setPriority({ interaction, logger, priority }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const result = await query(
      `UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [priority, ticket.id]
    );

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'ticket-priority',
      title: 'Ticket Priority Updated',
      body: `Ticket #${ticket.ticket_number} priority changed to **${priority}** by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id,
      metadata: { ticketId: ticket.id, priority }
    }).catch(() => {});

    return { ok: true, ticket: result.rows[0] };
  }

  async closeTicket({ interaction, client, logger, reason = 'No reason provided.' }) {
    const ticket = await this.findOpenTicketByChannel(interaction.guildId, interaction.channelId);
    if (!ticket) return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };

    const config = await this.getConfig(interaction.guildId);
    let transcriptSent = false;

    if (config.transcript_enabled !== false && config.log_channel_id) {
      const transcript = await this.buildTranscript(interaction.channel, ticket, reason, interaction.user);
      const logChannel = await fetchSendableChannel(client, config.log_channel_id);
      if (logChannel) {
        const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
          name: `ticket-${ticket.ticket_number}-transcript.txt`
        });
        await logChannel.send({
          embeds: [createBaseEmbed({
            title: `Ticket #${ticket.ticket_number} Transcript`,
            description: [`Closed By: <@${interaction.user.id}>`, `Channel: <#${interaction.channelId}>`, `Reason: ${reason}`].join('\n'),
            color: SlickBotColors.INFO,
            footer: 'SlickBot Ticket Transcript'
          })],
          files: [file]
        });
        transcriptSent = true;
      }
    }

    const result = await query(
      `UPDATE tickets
       SET status = 'CLOSED', closed_by_user_id = $1, closed_at = NOW(), close_reason = $2, transcript_sent = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [interaction.user.id, reason, transcriptSent, ticket.id]
    );

    await interaction.channel.permissionOverwrites.edit(ticket.opener_user_id, {
      SendMessages: false
    }).catch(() => {});
    await interaction.channel.setName(`closed-${interaction.channel.name}`.slice(0, 95)).catch(() => {});

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'ticket-close',
      title: 'Ticket Closed',
      body: `Ticket #${ticket.ticket_number} closed by ${interaction.user.tag}. Transcript sent: **${transcriptSent ? 'Yes' : 'No'}**.`,
      actorUserId: interaction.user.id,
      metadata: { ticketId: ticket.id, transcriptSent }
    }).catch(() => {});

    return { ok: true, ticket: result.rows[0], transcriptSent };
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

    const lines = [
      `SlickBot Ticket Transcript`,
      `Ticket: #${ticket.ticket_number}`,
      `Subject: ${ticket.subject}`,
      `Opened By: ${ticket.opener_user_tag || ticket.opener_user_id} (${ticket.opener_user_id})`,
      `Closed By: ${closedBy.tag} (${closedBy.id})`,
      `Close Reason: ${reason}`,
      `Channel: #${channel.name} (${channel.id})`,
      `Generated At: ${new Date().toISOString()}`,
      '',
      '--- Messages ---',
      ''
    ];

    for (const message of messages.reverse()) {
      const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown Author';
      const timestamp = message.createdAt ? message.createdAt.toISOString() : 'Unknown Time';
      const content = message.content || '[No text content]';
      lines.push(`[${timestamp}] ${author}`);
      lines.push(content);
      if (message.attachments?.size) {
        for (const attachment of message.attachments.values()) {
          lines.push(`Attachment: ${attachment.url}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

class ReportService {
  async updateConfig(guildId, reviewChannelId) {
    const result = await query(
      `INSERT INTO report_configs (guild_id, review_channel_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id)
       DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()
       RETURNING *`,
      [guildId, reviewChannelId]
    );
    return result.rows[0];
  }

  async getConfig(guildId) {
    const result = await query(`SELECT * FROM report_configs WHERE guild_id = $1 LIMIT 1`, [guildId]);
    return result.rows[0] || null;
  }

  async createReport({ interaction, client, logger, type = 'General Report', targetUser = null, details, messageLink = null }) {
    const next = await query(nextNumberQuery('reports', 'report_number'), [interaction.guildId]);
    const reportNumber = Number(next.rows[0].next_number);
    const inserted = await query(
      `INSERT INTO reports (guild_id, report_number, reporter_user_id, reporter_user_tag, target_user_id, target_user_tag, report_type, message_link, details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN')
       RETURNING *`,
      [interaction.guildId, reportNumber, interaction.user.id, interaction.user.tag, targetUser?.id || null, targetUser?.tag || null, type, messageLink, details]
    );
    const report = inserted.rows[0];

    const config = await this.getConfig(interaction.guildId);
    const reviewChannel = await fetchSendableChannel(client, config?.review_channel_id);
    if (reviewChannel) {
      await reviewChannel.send(buildReportReviewPayload(report));
    }

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'report-submit',
      title: 'Report Submitted',
      body: `Report #${report.report_number} submitted by ${interaction.user.tag}.${targetUser ? ` Target: ${targetUser.tag}.` : ''}`,
      actorUserId: interaction.user.id,
      metadata: { reportId: report.id, targetUserId: targetUser?.id || null }
    }).catch(() => {});

    return report;
  }

  async reviewReport({ guildId, reportId, reviewer, status, logger }) {
    const result = await query(
      `UPDATE reports SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE guild_id = $3 AND id = $4
       RETURNING *`,
      [normalizeStatus(status), reviewer.id, guildId, reportId]
    );
    const report = result.rows[0] || null;
    if (!report) return null;

    await logger.log({
      guildId,
      eventKey: 'report-review',
      title: 'Report Reviewed',
      body: `Report #${report.report_number} marked **${report.status}** by ${reviewer.tag}.`,
      actorUserId: reviewer.id,
      metadata: { reportId: report.id, status: report.status }
    }).catch(() => {});

    return report;
  }
}

function buildReportReviewPayload(report) {
  const embed = createBaseEmbed({
    title: `Report #${report.report_number}`,
    description: [
      `Reporter: <@${report.reporter_user_id}>`,
      report.target_user_id ? `Target: <@${report.target_user_id}>` : null,
      report.message_link ? `Message: ${report.message_link}` : null,
      `Type: **${report.report_type}**`,
      '',
      '**Details**',
      truncate(report.details || 'No details provided.', 2500)
    ].filter(Boolean).join('\n'),
    color: SlickBotColors.WARNING,
    footer: 'SlickBot Reports'
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.ReportResolvePrefix}${report.id}`).setLabel('Resolve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.ReportDismissPrefix}${report.id}`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

class ApplicationService {
  async ensureDefaultType(guildId) {
    const result = await query(
      `INSERT INTO application_types (guild_id, name, description, enabled)
       VALUES ($1, 'Moderator', 'Apply to help moderate the SlickPickleNick community.', true)
       ON CONFLICT (guild_id, name) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [guildId]
    );
    return result.rows[0];
  }

  async setupType(guildId, input) {
    const result = await query(
      `INSERT INTO application_types (guild_id, name, description, review_channel_id, pending_role_id, approved_role_id, auto_assign_approved_role, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (guild_id, name)
       DO UPDATE SET
         description = COALESCE(EXCLUDED.description, application_types.description),
         review_channel_id = COALESCE(EXCLUDED.review_channel_id, application_types.review_channel_id),
         pending_role_id = COALESCE(EXCLUDED.pending_role_id, application_types.pending_role_id),
         approved_role_id = COALESCE(EXCLUDED.approved_role_id, application_types.approved_role_id),
         auto_assign_approved_role = EXCLUDED.auto_assign_approved_role,
         enabled = true,
         updated_at = NOW()
       RETURNING *`,
      [guildId, input.name, input.description || null, input.reviewChannelId || null, input.pendingRoleId || null, input.approvedRoleId || null, Boolean(input.autoAssignApprovedRole)]
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

  async submitApplication({ interaction, client, logger, applicationType, answers }) {
    const duplicate = await query(
      `SELECT id FROM application_submissions WHERE guild_id = $1 AND application_type_id = $2 AND applicant_user_id = $3 AND status = 'PENDING' LIMIT 1`,
      [interaction.guildId, applicationType.id, interaction.user.id]
    );
    if (duplicate.rowCount > 0) return { ok: false, reason: 'You already have a pending application for this type.' };

    const next = await query(nextNumberQuery('application_submissions', 'submission_number'), [interaction.guildId]);
    const submissionNumber = Number(next.rows[0].next_number);
    const inserted = await query(
      `INSERT INTO application_submissions (guild_id, submission_number, application_type_id, application_name, applicant_user_id, applicant_user_tag, answers, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING *`,
      [interaction.guildId, submissionNumber, applicationType.id, applicationType.name, interaction.user.id, interaction.user.tag, safeJson(answers)]
    );
    const submission = inserted.rows[0];

    if (applicationType.pending_role_id) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      await member?.roles.add(applicationType.pending_role_id, `SlickBot application #${submission.submission_number} pending`).catch(() => {});
    }

    const reviewChannel = await fetchSendableChannel(client, applicationType.review_channel_id);
    if (reviewChannel) await reviewChannel.send(buildApplicationReviewPayload(submission, applicationType));

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'application-submit',
      title: 'Application Submitted',
      body: `${interaction.user.tag} submitted ${applicationType.name} application #${submission.submission_number}.`,
      actorUserId: interaction.user.id,
      metadata: { submissionId: submission.id, applicationTypeId: applicationType.id }
    }).catch(() => {});

    return { ok: true, submission };
  }

  async reviewApplication({ interaction, client, logger, submissionId, status }) {
    const fetchResult = await query(
      `SELECT s.*, t.pending_role_id, t.approved_role_id, t.auto_assign_approved_role
       FROM application_submissions s
       INNER JOIN application_types t ON t.id = s.application_type_id
       WHERE s.guild_id = $1 AND s.id = $2
       LIMIT 1`,
      [interaction.guildId, submissionId]
    );
    const submission = fetchResult.rows[0];
    if (!submission) return null;

    const nextStatus = normalizeStatus(status);
    const result = await query(
      `UPDATE application_submissions
       SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [nextStatus, interaction.user.id, submission.id]
    );
    const updated = result.rows[0];

    const member = await interaction.guild.members.fetch(submission.applicant_user_id).catch(() => null);
    if (member && submission.pending_role_id) await member.roles.remove(submission.pending_role_id).catch(() => {});
    if (member && nextStatus === 'APPROVED' && submission.auto_assign_approved_role && submission.approved_role_id) {
      await member.roles.add(submission.approved_role_id, `SlickBot application #${submission.submission_number} approved`).catch(() => {});
    }

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'application-review',
      title: 'Application Reviewed',
      body: `${submission.application_name} application #${submission.submission_number} marked **${nextStatus}** by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id,
      metadata: { submissionId: submission.id, status: nextStatus }
    }).catch(() => {});

    return updated;
  }
}

function buildApplicationReviewPayload(submission, applicationType) {
  let answers = submission.answers;
  if (typeof answers === 'string') {
    try { answers = JSON.parse(answers); } catch { answers = {}; }
  }
  answers = answers || {};
  const embed = createBaseEmbed({
    title: `${submission.application_name} Application #${submission.submission_number}`,
    description: [
      `Applicant: <@${submission.applicant_user_id}>`,
      `Pending Role: ${applicationType.pending_role_id ? `<@&${applicationType.pending_role_id}>` : 'None'}`,
      `Approved Role: ${applicationType.approved_role_id ? `<@&${applicationType.approved_role_id}>` : 'None'}`,
      '',
      '**Why are they applying?**',
      truncate(answers.why || 'No answer provided.', 1000),
      '',
      '**Experience**',
      truncate(answers.experience || 'No answer provided.', 1000),
      '',
      '**Availability / Notes**',
      truncate(answers.availability || 'No answer provided.', 1000)
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Applications'
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationApprovePrefix}${submission.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.ApplicationDenyPrefix}${submission.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row] };
}

class AppealService {
  async updateConfig(guildId, reviewChannelId) {
    const result = await query(
      `INSERT INTO appeal_configs (guild_id, review_channel_id)
       VALUES ($1, $2)
       ON CONFLICT (guild_id)
       DO UPDATE SET review_channel_id = EXCLUDED.review_channel_id, updated_at = NOW()
       RETURNING *`,
      [guildId, reviewChannelId]
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING *`,
      [interaction.guildId, appealNumber, interaction.user.id, interaction.user.tag, caseNumber || null, reason, details || null]
    );
    const appeal = inserted.rows[0];

    const config = await this.getConfig(interaction.guildId);
    const reviewChannel = await fetchSendableChannel(client, config?.review_channel_id);
    if (reviewChannel) await reviewChannel.send(buildAppealReviewPayload(appeal));

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'appeal-submit',
      title: 'Appeal Submitted',
      body: `Appeal #${appeal.appeal_number} submitted by ${interaction.user.tag}${caseNumber ? ` for case #${caseNumber}` : ''}.`,
      actorUserId: interaction.user.id,
      metadata: { appealId: appeal.id, caseNumber }
    }).catch(() => {});

    return appeal;
  }

  async reviewAppeal({ interaction, logger, appealId, status }) {
    const nextStatus = normalizeStatus(status);
    const result = await query(
      `UPDATE appeals
       SET status = $1, reviewed_by_user_id = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE guild_id = $3 AND id = $4
       RETURNING *`,
      [nextStatus, interaction.user.id, interaction.guildId, appealId]
    );
    const appeal = result.rows[0] || null;
    if (!appeal) return null;

    await logger.log({
      guildId: interaction.guildId,
      eventKey: 'appeal-review',
      title: 'Appeal Reviewed',
      body: `Appeal #${appeal.appeal_number} marked **${nextStatus}** by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id,
      metadata: { appealId: appeal.id, status: nextStatus }
    }).catch(() => {});

    return appeal;
  }
}

function buildAppealReviewPayload(appeal) {
  const embed = createBaseEmbed({
    title: `Appeal #${appeal.appeal_number}`,
    description: [
      `Appellant: <@${appeal.appellant_user_id}>`,
      appeal.case_number ? `Case: **#${appeal.case_number}**` : 'Case: Not provided',
      '',
      '**Reason**',
      truncate(appeal.reason || 'No reason provided.', 1200),
      '',
      '**Details**',
      truncate(appeal.details || 'No extra details provided.', 1200)
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Appeals'
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CustomIds.AppealApprovePrefix}${appeal.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${CustomIds.AppealDenyPrefix}${appeal.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row] };
}

function buildTicketModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.TicketModal)
    .setTitle('Open Support Ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('How can staff help?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500))
    );
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

function buildApplicationModal(applicationTypeId, title = 'Application') {
  return new ModalBuilder()
    .setCustomId(`${CustomIds.ApplicationModalPrefix}${applicationTypeId}`)
    .setTitle(title.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('why').setLabel('Why are you applying?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('experience').setLabel('Relevant experience').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('availability').setLabel('Availability / extra notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))
    );
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

module.exports = {
  TicketService,
  ReportService,
  ApplicationService,
  AppealService,
  buildTicketModal,
  buildReportModal,
  buildApplicationModal,
  buildAppealModal,
  buildReportReviewPayload,
  buildApplicationReviewPayload,
  buildAppealReviewPayload
};
