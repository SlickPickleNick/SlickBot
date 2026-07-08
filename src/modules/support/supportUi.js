const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  ButtonStyle,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { query } = require('../../services/db');

async function buildSupportPanel(guildId) {
  const [tickets, reports, apps, appeals] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND status = 'OPEN'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM reports WHERE guild_id = $1 AND status = 'OPEN'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM application_submissions WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM appeals WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  const embed = createBaseEmbed({
    title: 'SlickBot Support Center',
    description: [
      '**Support Workflow Snapshot**',
      `Open Tickets: **${tickets.rows[0]?.count || 0}**`,
      `Open Reports: **${reports.rows[0]?.count || 0}**`,
      `Pending Applications: **${apps.rows[0]?.count || 0}**`,
      `Pending Appeals: **${appeals.rows[0]?.count || 0}**`,
      '',
      'Use the controls below to open support workflow panels. Public panels can be posted with `/ticket panel`, `/report panel`, `/application panel`, and `/appeal panel`.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.TicketsRefresh, 'Tickets', ButtonStyle.Primary, '🎟️'),
    createPanelButton(CustomIds.ReportsRefresh, 'Reports', ButtonStyle.Secondary, '🚩'),
    createPanelButton(CustomIds.ApplicationsRefresh, 'Applications', ButtonStyle.Secondary, '📝'),
    createPanelButton(CustomIds.AppealsRefresh, 'Appeals', ButtonStyle.Secondary, '⚖️'),
    createPanelButton(CustomIds.SetupRefresh, 'Back', ButtonStyle.Secondary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

async function buildTicketsPanel(guildId) {
  const config = await query(`SELECT * FROM ticket_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
  const counts = await query(
    `SELECT status, COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 GROUP BY status`,
    [guildId]
  ).catch(() => ({ rows: [] }));
  const byStatus = Object.fromEntries(counts.rows.map((row) => [row.status, row.count]));
  const cfg = config.rows[0];

  const embed = createBaseEmbed({
    title: 'Ticket Manager',
    description: [
      `Open Tickets: **${byStatus.OPEN || 0}**`,
      `Closed Tickets: **${byStatus.CLOSED || 0}**`,
      '',
      '**Configuration**',
      `Category: ${cfg?.category_id ? `<#${cfg.category_id}>` : 'Not set'}`,
      `Staff Role: ${cfg?.staff_role_id ? `<@&${cfg.staff_role_id}>` : 'Not set'}`,
      `Ticket Log: ${cfg?.log_channel_id ? `<#${cfg.log_channel_id}>` : 'Not set'}`,
      `User Limit: **${cfg?.ticket_limit || 1}** open ticket(s)`,
      `Transcripts: **${cfg?.transcript_enabled === false ? 'Disabled' : 'Enabled'}**`,
      '',
      'Use `/ticket setup` to configure this module and `/ticket panel` to post a public ticket launcher.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.TicketOpen, 'Open Ticket', ButtonStyle.Primary, '🎟️'),
    createPanelButton(CustomIds.TicketsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SupportRefresh, 'Back', ButtonStyle.Secondary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

async function buildReportsPanel(guildId) {
  const config = await query(`SELECT * FROM report_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
  const counts = await query(`SELECT status, COUNT(*)::int AS count FROM reports WHERE guild_id = $1 GROUP BY status`, [guildId]).catch(() => ({ rows: [] }));
  const byStatus = Object.fromEntries(counts.rows.map((row) => [row.status, row.count]));
  const cfg = config.rows[0];

  const embed = createBaseEmbed({
    title: 'Report Manager',
    description: [
      `Open Reports: **${byStatus.OPEN || 0}**`,
      `Resolved Reports: **${byStatus.RESOLVED || 0}**`,
      `Dismissed Reports: **${byStatus.DISMISSED || 0}**`,
      '',
      `Review Channel: ${cfg?.review_channel_id ? `<#${cfg.review_channel_id}>` : 'Not set'}`,
      '',
      'Use `/report setup` to set the review channel and `/report panel` to post a public report launcher.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.ReportOpen, 'Submit Report', ButtonStyle.Danger, '🚩'),
    createPanelButton(CustomIds.ReportsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SupportRefresh, 'Back', ButtonStyle.Secondary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

async function buildApplicationsPanel(guildId) {
  const types = await query(`SELECT * FROM application_types WHERE guild_id = $1 ORDER BY name ASC`, [guildId]).catch(() => ({ rows: [] }));
  const pending = await query(`SELECT COUNT(*)::int AS count FROM application_submissions WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));

  const typeLines = types.rowCount
    ? types.rows.map((type) => `• **${type.name}** — ${type.enabled ? 'Enabled' : 'Disabled'} · Review: ${type.review_channel_id ? `<#${type.review_channel_id}>` : 'Not set'}`).join('\n')
    : 'No application types configured yet. Use `/application setup`. A default Moderator type is created during setup.';

  const embed = createBaseEmbed({
    title: 'Application Manager',
    description: [
      `Pending Applications: **${pending.rows[0]?.count || 0}**`,
      '',
      '**Application Types**',
      typeLines,
      '',
      'Use `/application setup` to configure roles and review channels. Use `/application panel` to post a public application launcher.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const buttons = [createPanelButton(CustomIds.ApplicationsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄')];
  if (types.rows[0]) {
    buttons.unshift(createPanelButton(`${CustomIds.ApplicationApplyPrefix}${types.rows[0].id}`, `Apply: ${types.rows[0].name}`.slice(0, 80), ButtonStyle.Primary, '📝'));
  }
  buttons.push(createPanelButton(CustomIds.SupportRefresh, 'Back', ButtonStyle.Secondary, '↩️'));

  return { embeds: [embed], components: [createButtonRow(buttons.slice(0, 5))] };
}

async function buildAppealsPanel(guildId) {
  const config = await query(`SELECT * FROM appeal_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
  const counts = await query(`SELECT status, COUNT(*)::int AS count FROM appeals WHERE guild_id = $1 GROUP BY status`, [guildId]).catch(() => ({ rows: [] }));
  const byStatus = Object.fromEntries(counts.rows.map((row) => [row.status, row.count]));
  const cfg = config.rows[0];

  const embed = createBaseEmbed({
    title: 'Appeal Manager',
    description: [
      `Pending Appeals: **${byStatus.PENDING || 0}**`,
      `Approved Appeals: **${byStatus.APPROVED || 0}**`,
      `Denied Appeals: **${byStatus.DENIED || 0}**`,
      '',
      `Review Channel: ${cfg?.review_channel_id ? `<#${cfg.review_channel_id}>` : 'Not set'}`,
      '',
      'Use `/appeal setup` to set the review channel and `/appeal panel` to post a public appeal launcher.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.AppealOpen, 'Submit Appeal', ButtonStyle.Primary, '⚖️'),
    createPanelButton(CustomIds.AppealsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SupportRefresh, 'Back', ButtonStyle.Secondary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

function buildPublicTicketPanel(type = 'Admin Support') {
  const embed = createBaseEmbed({
    title: `${type} Tickets`,
    description: 'Need help? Select **Open Ticket** below and SlickBot will create a private support channel for you.',
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Tickets'
  });
  return { embeds: [embed], components: [createButtonRow([createPanelButton(CustomIds.TicketOpen, 'Open Ticket', ButtonStyle.Primary, '🎟️')])] };
}

function buildPublicReportPanel() {
  const embed = createBaseEmbed({
    title: 'Submit a Report',
    description: 'Use this panel to privately report a concern to the staff team.',
    color: SlickBotColors.WARNING,
    footer: 'SlickBot Reports'
  });
  return { embeds: [embed], components: [createButtonRow([createPanelButton(CustomIds.ReportOpen, 'Submit Report', ButtonStyle.Danger, '🚩')])] };
}

function buildPublicApplicationPanel(type) {
  const embed = createBaseEmbed({
    title: `${type.name} Application`,
    description: type.description || 'Use this panel to submit an application for review.',
    color: SlickBotColors.PRIMARY,
    footer: 'SlickBot Applications'
  });
  return { embeds: [embed], components: [createButtonRow([createPanelButton(`${CustomIds.ApplicationApplyPrefix}${type.id}`, 'Start Application', ButtonStyle.Primary, '📝')])] };
}

function buildPublicAppealPanel() {
  const embed = createBaseEmbed({
    title: 'Submit an Appeal',
    description: 'Use this panel to submit an appeal for staff review. Include the case number if you have one.',
    color: SlickBotColors.INFO,
    footer: 'SlickBot Appeals'
  });
  return { embeds: [embed], components: [createButtonRow([createPanelButton(CustomIds.AppealOpen, 'Submit Appeal', ButtonStyle.Primary, '⚖️')])] };
}

module.exports = {
  buildSupportPanel,
  buildTicketsPanel,
  buildReportsPanel,
  buildApplicationsPanel,
  buildAppealsPanel,
  buildPublicTicketPanel,
  buildPublicReportPanel,
  buildPublicApplicationPanel,
  buildPublicAppealPanel
};
