const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const support = require('./supportService');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, SlickBotColors } = require('../ui/uiService');
const { truncate } = require('../../utils/format');

const BaseTicketService = support.TicketService;

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

function buildQuestionLines(answers) {
  const parsed = parseJson(answers, {});
  const entries = Object.entries(parsed);
  if (!entries.length) return 'No answers provided.';
  return entries
    .map(([question, answer]) => `**${question}**\n${truncate(String(answer || 'No answer provided.'), 700)}`)
    .join('\n\n');
}

function parseRoleIds(value) {
  const parsed = parseJson(value, []);
  return [...new Set((Array.isArray(parsed) ? parsed : []).map(String).filter(Boolean))];
}

async function getTeamRoleIds(teamId) {
  if (!teamId) return [];
  const result = await query(
    `SELECT role_id FROM permission_team_roles WHERE team_id = $1`,
    [teamId]
  ).catch(() => ({ rows: [] }));
  return result.rows.map((row) => row.role_id);
}

async function resolveTeamId(guildId, teamName) {
  if (!teamName) return null;
  const result = await query(
    `SELECT id FROM permission_teams WHERE guild_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [guildId, teamName]
  ).catch(() => ({ rows: [] }));
  return result.rows[0]?.id || null;
}

function buildTicketControlEmbed(ticket, ticketType) {
  return createBaseEmbed({
    title: `Ticket #${ticket.ticket_number}: ${ticket.subject}`,
    description: [
      `Opened By: <@${ticket.opener_user_id}>`,
      `Type: **${ticket.type}**`,
      `Priority: **${ticket.priority}**`,
      ticketType?.escalated_role_id || ticketType?.escalated_team_id
        ? 'Escalation: **Configured**'
        : 'Escalation: Not configured',
      '',
      '**Details**',
      truncate(ticket.details || 'No details provided.', 2200),
      '',
      'Staff can claim, escalate, or close this ticket using the controls below.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Tickets'
  });
}

async function updateConfig(guildId, input) {
  const staffTeamId = input.staffTeamName
    ? await resolveTeamId(guildId, input.staffTeamName)
    : null;
  const escalatedTeamId = input.escalatedTeamName
    ? await resolveTeamId(guildId, input.escalatedTeamName)
    : null;

  const result = await query(
    `INSERT INTO ticket_configs (
       guild_id, category_id, log_channel_id, staff_role_id, staff_team_id,
       escalated_role_id, escalated_team_id, ticket_limit, transcript_enabled,
       naming_format, panel_title, panel_description, panel_color,
       close_delete_seconds, panel_display_mode
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (guild_id) DO UPDATE SET
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
       close_delete_seconds = COALESCE(EXCLUDED.close_delete_seconds, ticket_configs.close_delete_seconds),
       panel_display_mode = COALESCE(EXCLUDED.panel_display_mode, ticket_configs.panel_display_mode),
       updated_at = NOW()
     RETURNING *`,
    [
      guildId,
      input.categoryId || null,
      input.logChannelId || null,
      input.staffRoleId || null,
      staffTeamId,
      input.escalatedRoleId || null,
      escalatedTeamId,
      input.ticketLimit || null,
      typeof input.transcriptEnabled === 'boolean' ? input.transcriptEnabled : null,
      input.namingFormat || null,
      input.panelTitle || null,
      input.panelDescription || null,
      input.panelColor || null,
      input.closeDeleteSeconds || null,
      input.panelDisplayMode || null
    ]
  );

  await this.ensureDefaultType(guildId);

  // Keep the built-in Admin Support type aligned with any default values that
  // were explicitly supplied in this setup command.
  await query(
    `UPDATE ticket_types SET
       category_id = COALESCE($2, category_id),
       log_channel_id = COALESCE($3, log_channel_id),
       staff_role_id = COALESCE($4, staff_role_id),
       staff_team_id = COALESCE($5, staff_team_id),
       escalated_role_id = COALESCE($6, escalated_role_id),
       escalated_team_id = COALESCE($7, escalated_team_id),
       ticket_limit = COALESCE($8, ticket_limit),
       transcript_enabled = COALESCE($9, transcript_enabled),
       naming_format = COALESCE($10, naming_format),
       updated_at = NOW()
     WHERE guild_id = $1 AND LOWER(name) = LOWER('Admin Support')`,
    [
      guildId,
      input.categoryId || null,
      input.logChannelId || null,
      input.staffRoleId || null,
      staffTeamId,
      input.escalatedRoleId || null,
      escalatedTeamId,
      input.ticketLimit || null,
      typeof input.transcriptEnabled === 'boolean' ? input.transcriptEnabled : null,
      input.namingFormat || null
    ]
  );

  return result.rows[0];
}

async function ensureDefaultType(guildId) {
  const config = await this.getConfig(guildId);
  const result = await query(
    `INSERT INTO ticket_types (
       guild_id, name, label, description, category_id, log_channel_id,
       staff_role_id, staff_team_id, escalated_role_id, escalated_team_id,
       ticket_limit, transcript_enabled, naming_format, questions, enabled
     )
     VALUES (
       $1, 'Admin Support', 'Admin Support',
       'General server support and administrative help.',
       $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true
     )
     ON CONFLICT (guild_id, name) DO UPDATE SET
       category_id = COALESCE(ticket_types.category_id, EXCLUDED.category_id),
       log_channel_id = COALESCE(ticket_types.log_channel_id, EXCLUDED.log_channel_id),
       staff_role_id = COALESCE(ticket_types.staff_role_id, EXCLUDED.staff_role_id),
       staff_team_id = COALESCE(ticket_types.staff_team_id, EXCLUDED.staff_team_id),
       escalated_role_id = COALESCE(ticket_types.escalated_role_id, EXCLUDED.escalated_role_id),
       escalated_team_id = COALESCE(ticket_types.escalated_team_id, EXCLUDED.escalated_team_id),
       updated_at = NOW()
     RETURNING *`,
    [
      guildId,
      config.category_id || null,
      config.log_channel_id || null,
      config.staff_role_id || null,
      config.staff_team_id || null,
      config.escalated_role_id || null,
      config.escalated_team_id || null,
      config.ticket_limit || 1,
      config.transcript_enabled !== false,
      config.naming_format || 'ticket-{username}-{number}',
      JSON.stringify([{ label: 'How can staff help?', required: true }])
    ]
  );
  return result.rows[0];
}

async function setupType(guildId, input) {
  const staffTeamId = input.staffTeamName
    ? await resolveTeamId(guildId, input.staffTeamName)
    : null;
  const escalatedTeamId = input.escalatedTeamName
    ? await resolveTeamId(guildId, input.escalatedTeamName)
    : null;

  const result = await query(
    `INSERT INTO ticket_types (
       guild_id, name, label, description, category_id, log_channel_id,
       staff_role_id, staff_team_id, escalated_role_id, escalated_team_id,
       ticket_limit, transcript_enabled, naming_format, enabled
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
     ON CONFLICT (guild_id, name) DO UPDATE SET
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
    [
      guildId,
      input.name,
      input.label || input.name,
      input.description || null,
      input.categoryId || null,
      input.logChannelId || null,
      input.staffRoleId || null,
      staffTeamId,
      input.escalatedRoleId || null,
      escalatedTeamId,
      input.ticketLimit || null,
      typeof input.transcriptEnabled === 'boolean' ? input.transcriptEnabled : null,
      input.namingFormat || null
    ]
  );
  return result.rows[0];
}

async function createTicket({
  interaction,
  client,
  logger,
  type = 'Admin Support',
  ticketType = null,
  openerUser = null,
  actorUser = null,
  subject,
  details,
  answers = null,
  reviewerRoleIdsOverride = null,
  skipTicketLimit = false
}) {
  const guild = interaction.guild;
  const guildId = interaction.guildId;
  const config = await this.getConfig(guildId);
  const opener = openerUser || interaction.user;
  const actor = actorUser || interaction.user;
  const selectedType = ticketType
    || await this.getTypeByName(guildId, type)
    || await this.ensureDefaultType(guildId);

  const openCount = skipTicketLimit
    ? { rows: [{ count: 0 }] }
    : await query(
        `SELECT COUNT(*)::int AS count
         FROM tickets
         WHERE guild_id = $1 AND opener_user_id = $2 AND status = 'OPEN'`,
        [guildId, opener.id]
      );
  const limit = selectedType.ticket_limit || config.ticket_limit || 1;
  if (!skipTicketLimit && (openCount.rows[0]?.count || 0) >= limit) {
    return {
      ok: false,
      reason: `This user already has the maximum number of open tickets allowed (**${limit}**).`
    };
  }

  const next = await query(
    `SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next_number
     FROM tickets
     WHERE guild_id = $1`,
    [guildId]
  );
  const ticketNumber = Number(next.rows[0].next_number);
  const channelName = formatTicketChannelName(
    selectedType.naming_format || config.naming_format,
    { username: opener.username, number: ticketNumber, type: selectedType.name }
  );

  // Ticket creation intentionally uses assignment access only. Escalation roles
  // and teams are not granted access until the ticket is explicitly escalated.
  const assignmentTeamRoleIds = await getTeamRoleIds(
    selectedType.staff_team_id || config.staff_team_id
  );
  const assignmentRoleIds = Array.isArray(reviewerRoleIdsOverride)
    ? [...new Set(reviewerRoleIdsOverride.map(String).filter(Boolean))]
    : [...new Set([
        selectedType.staff_role_id || config.staff_role_id,
        ...assignmentTeamRoleIds
      ].filter(Boolean))];

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    }
  ];

  if (botMember) {
    overwrites.push({
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }

  for (const roleId of assignmentRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
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
    `INSERT INTO tickets (
       guild_id, ticket_number, channel_id, opener_user_id, opener_user_tag,
       type, subject, details, status, priority, ticket_type_id,
       reviewer_role_id, reviewer_role_ids
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OPEN','NORMAL',$9,$10,$11::jsonb)
     RETURNING *`,
    [
      guildId,
      ticketNumber,
      channel.id,
      opener.id,
      opener.tag,
      selectedType.name,
      subject || 'Support Request',
      readableDetails,
      selectedType.id,
      assignmentRoleIds[0] || null,
      JSON.stringify(assignmentRoleIds)
    ]
  );
  const ticket = insert.rows[0];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CustomIds.TicketClaim)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🙋'),
    new ButtonBuilder()
      .setCustomId(CustomIds.TicketEscalate)
      .setLabel('Escalate')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬆️'),
    new ButtonBuilder()
      .setCustomId(CustomIds.TicketCloseReason)
      .setLabel('Close With Reason')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );

  const reviewerMentions = assignmentRoleIds
    .map((roleId) => `<@&${roleId}>`)
    .join(' ');
  await channel.send({
    content: `<@${opener.id}>${reviewerMentions ? ` ${reviewerMentions}` : ''}`,
    embeds: [buildTicketControlEmbed(ticket, selectedType)],
    components: [row]
  });

  await logger.log({
    guildId,
    eventKey: 'ticket-open',
    title: 'Ticket Opened',
    body: `Ticket #${ticket.ticket_number} opened by ${opener.tag} in <#${channel.id}>.${actor.id !== opener.id ? ` Created by ${actor.tag}.` : ''}`,
    actorUserId: actor.id,
    metadata: {
      ticketId: ticket.id,
      channelId: channel.id,
      openerUserId: opener.id,
      reviewerRoleIds: assignmentRoleIds
    }
  }).catch(() => {});

  return { ok: true, ticket, channel };
}

async function escalateTicket({ interaction, logger, reason = 'No escalation reason provided.' }) {
  const ticket = await this.findOpenTicketByChannel(
    interaction.guildId,
    interaction.channelId
  );
  if (!ticket) {
    return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };
  }

  const config = await this.getConfig(interaction.guildId);
  const type = ticket.ticket_type_id
    ? await this.getTypeById(interaction.guildId, ticket.ticket_type_id)
    : null;

  const escalationTeamRoleIds = await getTeamRoleIds(
    type?.escalated_team_id || config.escalated_team_id
  );
  const escalatedRoleIds = [...new Set([
    type?.escalated_role_id || config.escalated_role_id,
    ...escalationTeamRoleIds
  ].filter(Boolean))];

  if (!escalatedRoleIds.length) {
    return {
      ok: false,
      reason: 'This ticket does not have an escalation role or team configured.'
    };
  }

  // Derive current assignment access from both the ticket record and its
  // configuration. This also cleans up tickets created before reviewer_role_ids
  // began tracking every assignment role.
  const configuredAssignmentTeamRoles = await getTeamRoleIds(
    type?.staff_team_id || config.staff_team_id
  );
  const currentAssignmentRoleIds = [...new Set([
    ...parseRoleIds(ticket.reviewer_role_ids),
    ticket.reviewer_role_id,
    type?.staff_role_id || config.staff_role_id,
    ...configuredAssignmentTeamRoles
  ].filter(Boolean))];

  const escalatedSet = new Set(escalatedRoleIds);
  const roleIdsToRemove = currentAssignmentRoleIds.filter(
    (roleId) => !escalatedSet.has(roleId)
  );

  const botPermissions = interaction.channel.permissionsFor(interaction.guild.members.me);
  if (!botPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    return {
      ok: false,
      reason: 'SlickBot needs the **Manage Channels** permission to update ticket access.'
    };
  }

  try {
    // Grant escalation access before removing assignment access so the ticket
    // always retains an active reviewer group during the transition.
    for (const roleId of escalatedRoleIds) {
      await interaction.channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        ManageMessages: true
      });
    }
    for (const roleId of roleIdsToRemove) {
      await interaction.channel.permissionOverwrites.delete(roleId);
    }
  } catch (error) {
    console.error('Failed to update ticket escalation permissions:', error);
    return {
      ok: false,
      reason: 'SlickBot could not update the ticket permission overwrites. Check its role position and **Manage Channels** permission.'
    };
  }

  const result = await query(
    `UPDATE tickets SET
       priority = 'ESCALATED',
       reviewer_role_id = $1,
       reviewer_role_ids = $2::jsonb,
       escalated_to_role_id = $1,
       escalated_by_user_id = $3,
       escalated_at = NOW(),
       updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      escalatedRoleIds[0],
      JSON.stringify(escalatedRoleIds),
      interaction.user.id,
      ticket.id
    ]
  );

  await logger.log({
    guildId: interaction.guildId,
    eventKey: 'ticket-escalate',
    title: 'Ticket Escalated',
    body: [
      `Ticket #${ticket.ticket_number} escalated by ${interaction.user.tag}.`,
      `Removed Assignment Roles: ${roleIdsToRemove.map((id) => `<@&${id}>`).join(', ') || 'None'}`,
      `Escalation Roles: ${escalatedRoleIds.map((id) => `<@&${id}>`).join(', ')}`,
      `Reason: ${reason}`
    ].join('\n'),
    actorUserId: interaction.user.id,
    metadata: {
      ticketId: ticket.id,
      removedRoleIds: roleIdsToRemove,
      escalatedRoleIds
    }
  }).catch(() => {});

  return {
    ok: true,
    ticket: result.rows[0],
    roleIds: escalatedRoleIds,
    removedRoleIds: roleIdsToRemove
  };
}

async function addUserToTicket({ interaction, user, logger }) {
  const ticket = await this.findOpenTicketByChannel(
    interaction.guildId,
    interaction.channelId
  );
  if (!ticket) {
    return { ok: false, reason: 'This channel is not an open SlickBot ticket.' };
  }

  const updated = await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true
  }).then(() => true).catch((error) => {
    console.error('Failed to add a user to a ticket:', error);
    return false;
  });

  if (!updated) {
    return {
      ok: false,
      reason: 'SlickBot could not add that user. Check its **Manage Channels** permission and role position.'
    };
  }

  await logger.log({
    guildId: interaction.guildId,
    eventKey: 'ticket-user-add',
    title: 'User Added to Ticket',
    body: `User <@${user.id}> was added to ticket #${ticket.ticket_number} by ${interaction.user.tag}.`,
    actorUserId: interaction.user.id,
    metadata: { ticketId: ticket.id, userId: user.id }
  }).catch(() => {});

  return { ok: true, ticket };
}

Object.assign(BaseTicketService.prototype, {
  updateConfig,
  ensureDefaultType,
  setupType,
  createTicket,
  escalateTicket,
  addUserToTicket
});

module.exports = {
  ...support,
  TicketService: BaseTicketService
};
