const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  createSelectRow,
  ButtonStyle,
  SlickBotColors,
  withPanelHeaderImage
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { query } = require('../../services/db');

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseHexColor(value, fallback = SlickBotColors.PRIMARY) {
  if (!value) return fallback;
  const normalized = String(value).replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return Number.parseInt(normalized, 16);
}

function getPanelDisplayMode(value) {
  return String(value || 'BUTTONS').toUpperCase() === 'DROPDOWN' ? 'DROPDOWN' : 'BUTTONS';
}

async function buildSupportPanel(guildId) {
  const [tickets, reports, apps, appeals] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND status = 'OPEN'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM reports WHERE guild_id = $1 AND status IN ('OPEN','CLAIMED')`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM application_submissions WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM appeals WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  const embed = createBaseEmbed({
    title: 'SlickBot Support Center',
    description: [
      '**Support Workflow Snapshot**',
      `Open Tickets: **${tickets.rows[0]?.count || 0}**`,
      `Active Reports: **${reports.rows[0]?.count || 0}**`,
      `Pending Applications: **${apps.rows[0]?.count || 0}**`,
      `Pending Appeals: **${appeals.rows[0]?.count || 0}**`,
      '',
      'Use the controls below to open workflow panels. Public panels can be posted with `/ticket panel`, `/report panel`, `/application panel`, and `/appeal panel`.'
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
  const counts = await query(`SELECT status, COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 GROUP BY status`, [guildId]).catch(() => ({ rows: [] }));
  const types = await query(`SELECT * FROM ticket_types WHERE guild_id = $1 ORDER BY name ASC`, [guildId]).catch(() => ({ rows: [] }));
  const byStatus = Object.fromEntries(counts.rows.map((row) => [row.status, row.count]));
  const cfg = config.rows[0];

  const typeLines = types.rows.length
    ? types.rows.map((type) => {
      const questions = parseJson(type.questions, []);
      return `• **${type.name}** — ${type.enabled ? 'Enabled' : 'Disabled'} · Questions: **${questions.length || 0}** · Review: ${type.staff_role_id ? `<@&${type.staff_role_id}>` : type.staff_team_id ? 'Team' : 'Default'}`;
    }).join('\n')
    : 'No ticket types configured yet. Use `/ticket type-setup`.';

  const embed = createBaseEmbed({
    title: 'Ticket Manager',
    description: [
      `Open Tickets: **${byStatus.OPEN || 0}**`,
      `Closed Tickets: **${byStatus.CLOSED || 0}**`,
      '',
      '**Default Configuration**',
      `Category: ${cfg?.category_id ? `<#${cfg.category_id}>` : 'Not set'}`,
      `Support Role: ${cfg?.staff_role_id ? `<@&${cfg.staff_role_id}>` : 'Not set'}`,
      `Support Team: ${cfg?.staff_team_id ? 'Configured' : 'Not set'}`,
      `Escalated Role: ${cfg?.escalated_role_id ? `<@&${cfg.escalated_role_id}>` : 'Not set'}`,
      `Escalated Team: ${cfg?.escalated_team_id ? 'Configured' : 'Not set'}`,
      `Ticket Log: ${cfg?.log_channel_id ? `<#${cfg.log_channel_id}>` : 'Not set'}`,
      `Naming: \`${cfg?.naming_format || 'ticket-{username}-{number}'}\``,
      `Panel Header Image: ${cfg?.panel_header_image_url ? 'Configured' : 'Not set'}`,
      '',
      '**Ticket Types**',
      typeLines,
      '',
      'Use `/ticket type-setup` and `/ticket question-add` to customize ticket buttons and intake questions.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.TicketOpen, 'Open Default', ButtonStyle.Primary, '🎟️'),
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
      `Claimed Reports: **${byStatus.CLAIMED || 0}**`,
      `Resolved Reports: **${byStatus.RESOLVED || 0}**`,
      `Dismissed Reports: **${byStatus.DISMISSED || 0}**`,
      '',
      `Review Channel: ${cfg?.review_channel_id ? `<#${cfg.review_channel_id}>` : 'Not set'}`,
      `Ping Role: ${cfg?.ping_role_id ? `<@&${cfg.ping_role_id}>` : 'Not set'}`,
      `Ping Team: ${cfg?.ping_team_id ? 'Configured' : 'Not set'}`,
      '',
      'Reports can be claimed, resolved, dismissed, or converted into a follow-up ticket.'
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
    ? await Promise.all(types.rows.map(async (type) => {
      const questions = await query(`SELECT COUNT(*)::int AS count FROM application_questions WHERE application_type_id = $1`, [type.id]).catch(() => ({ rows: [{ count: 0 }] }));
      return `• **${type.name}** — ${type.enabled ? 'Enabled' : 'Disabled'} · Questions: **${questions.rows[0]?.count || 0}** · Review: ${type.review_channel_id ? `<#${type.review_channel_id}>` : 'Not set'}`;
    })).then((lines) => lines.join('\n'))
    : 'No application types configured yet. Use `/application setup`. A default Moderator type is created during setup.';

  const embed = createBaseEmbed({
    title: 'Application Manager',
    description: [
      `Pending Applications: **${pending.rows[0]?.count || 0}**`,
      '',
      '**Application Types**',
      typeLines,
      '',
      'Applications now run through DM. SlickBot asks custom questions one at a time, records each response, then submits the completed application to the review channel.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const buttons = [createPanelButton(CustomIds.ApplicationsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄')];
  if (types.rows[0]) buttons.unshift(createPanelButton(`${CustomIds.ApplicationApplyPrefix}${types.rows[0].id}`, `Apply: ${types.rows[0].name}`.slice(0, 80), ButtonStyle.Primary, '📝'));
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
      `DM Decisions: **${cfg?.dm_decision_enabled ? 'Enabled' : 'Disabled'}**`,
      '',
      'Appeal reviewers can approve/deny immediately or open a decision reason modal.'
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

async function buildPublicTicketPanel(types = [], config = null) {
  const enabledTypes = types.filter((type) => type.enabled !== false).slice(0, 25);
  const embed = createBaseEmbed({
    title: config?.panel_title || 'Open a Ticket',
    description: config?.panel_description || (enabledTypes.length
      ? 'Select the ticket type that best matches what you need. SlickBot will ask the configured questions and create a private support channel.'
      : 'Need help? Select **Open Ticket** below and SlickBot will create a private support channel for you.'),
    color: parseHexColor(config?.panel_color, SlickBotColors.PRIMARY),
    footer: `SlickBot Tickets · ${getPanelDisplayMode(config?.panel_display_mode)}`
  });

  if (getPanelDisplayMode(config?.panel_display_mode) === 'DROPDOWN' && enabledTypes.length) {
    const select = createSelectRow(CustomIds.TicketTypeSelect, 'Select a ticket type...', enabledTypes.map((type) => ({
      label: String(type.label || type.name).slice(0, 100),
      value: type.id,
      description: String(type.description || 'Open this ticket type.').slice(0, 100),
      emoji: '🎟️'
    })));
    return withPanelHeaderImage({ embeds: [embed], components: [select] }, config?.panel_header_image_url);
  }

  const buttons = enabledTypes.length
    ? enabledTypes.slice(0, 5).map((type) => createPanelButton(`${CustomIds.TicketOpenTypePrefix}${type.id}`, type.label || type.name, ButtonStyle.Primary, '🎟️'))
    : [createPanelButton(CustomIds.TicketOpen, 'Open Ticket', ButtonStyle.Primary, '🎟️')];
  return withPanelHeaderImage({ embeds: [embed], components: [createButtonRow(buttons)] }, config?.panel_header_image_url);
}

function buildPublicReportPanel(config = null) {
  const embed = createBaseEmbed({ title: config?.panel_title || 'Submit a Report', description: config?.panel_description || 'Use this panel to privately report a concern to the staff team.', color: parseHexColor(config?.panel_color, SlickBotColors.WARNING), footer: `SlickBot Reports · ${getPanelDisplayMode(config?.panel_display_mode)}` });
  if (getPanelDisplayMode(config?.panel_display_mode) === 'DROPDOWN') {
    return withPanelHeaderImage({ embeds: [embed], components: [createSelectRow(CustomIds.ReportSelect, 'Choose an action...', [{ label: 'Submit Report', value: 'open', description: 'Privately report a concern to staff.', emoji: '🚩' }])] }, config?.panel_header_image_url);
  }
  return withPanelHeaderImage({ embeds: [embed], components: [createButtonRow([createPanelButton(CustomIds.ReportOpen, 'Submit Report', ButtonStyle.Danger, '🚩')])] }, config?.panel_header_image_url);
}

function buildPublicApplicationPanel(type) {
  const embed = createBaseEmbed({ title: type.panel_title || `${type.name} Application`, description: type.panel_description || type.description || 'Use this panel to start a DM-based application.', color: parseHexColor(type.panel_color, SlickBotColors.PRIMARY), footer: `SlickBot Applications · ${getPanelDisplayMode(type.panel_display_mode)}` });
  const customId = `${CustomIds.ApplicationApplyPrefix}${type.id}`;
  if (getPanelDisplayMode(type.panel_display_mode) === 'DROPDOWN') {
    return withPanelHeaderImage({ embeds: [embed], components: [createSelectRow(`${CustomIds.ApplicationSelectPrefix}${type.id}`, 'Choose an action...', [{ label: `Start ${type.name}`.slice(0, 100), value: type.id, description: 'Start this DM-based application.', emoji: '📝' }])] }, type.panel_header_image_url);
  }
  return withPanelHeaderImage({ embeds: [embed], components: [createButtonRow([createPanelButton(customId, 'Start Application', ButtonStyle.Primary, '📝')])] }, type.panel_header_image_url);
}

function buildPublicAppealPanel(config = null) {
  const embed = createBaseEmbed({ title: config?.panel_title || 'Submit an Appeal', description: config?.panel_description || 'Use this panel to submit an appeal for staff review.', color: parseHexColor(config?.panel_color, SlickBotColors.INFO), footer: `SlickBot Appeals · ${getPanelDisplayMode(config?.panel_display_mode)}` });
  if (getPanelDisplayMode(config?.panel_display_mode) === 'DROPDOWN') {
    return withPanelHeaderImage({ embeds: [embed], components: [createSelectRow(CustomIds.AppealSelect, 'Choose an action...', [{ label: 'Submit Appeal', value: 'open', description: 'Submit an appeal for staff review.', emoji: '⚖️' }])] }, config?.panel_header_image_url);
  }
  return withPanelHeaderImage({ embeds: [embed], components: [createButtonRow([createPanelButton(CustomIds.AppealOpen, 'Submit Appeal', ButtonStyle.Primary, '⚖️')])] }, config?.panel_header_image_url);
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
