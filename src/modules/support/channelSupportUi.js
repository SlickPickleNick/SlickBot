const supportUi = require('./supportUi');
const { query } = require('../../services/db');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  ButtonStyle,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function buildTicketsPanel(guildId) {
  const config = await query(
    `SELECT * FROM ticket_configs WHERE guild_id = $1 LIMIT 1`,
    [guildId]
  ).catch(() => ({ rows: [] }));
  const counts = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM tickets
     WHERE guild_id = $1
     GROUP BY status`,
    [guildId]
  ).catch(() => ({ rows: [] }));
  const types = await query(
    `SELECT * FROM ticket_types WHERE guild_id = $1 ORDER BY name ASC`,
    [guildId]
  ).catch(() => ({ rows: [] }));

  const byStatus = Object.fromEntries(
    counts.rows.map((row) => [row.status, row.count])
  );
  const cfg = config.rows[0];
  const typeLines = types.rows.length
    ? types.rows.map((type) => {
        const questions = parseJson(type.questions, []);
        const assignment = type.staff_role_id
          ? `<@&${type.staff_role_id}>`
          : type.staff_team_id
            ? 'Permission Team'
            : 'Server default';
        const escalation = type.escalated_role_id
          ? `<@&${type.escalated_role_id}>`
          : type.escalated_team_id
            ? 'Permission Team'
            : 'Server default';
        return `• **${type.name}** — ${type.enabled ? 'Enabled' : 'Disabled'} · Questions: **${questions.length || 0}**\n  Assignment: ${assignment} · Escalation: ${escalation}`;
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
      `Assignment Role: ${cfg?.staff_role_id ? `<@&${cfg.staff_role_id}>` : 'Not set'}`,
      `Assignment Team: ${cfg?.staff_team_id ? 'Configured' : 'Not set'}`,
      `Escalation Role: ${cfg?.escalated_role_id ? `<@&${cfg.escalated_role_id}>` : 'Not set'}`,
      `Escalation Team: ${cfg?.escalated_team_id ? 'Configured' : 'Not set'}`,
      `Ticket Log: ${cfg?.log_channel_id ? `<#${cfg.log_channel_id}>` : 'Not set'}`,
      `Naming: \`${cfg?.naming_format || 'ticket-{username}-{number}'}\``,
      '',
      '**Ticket Types**',
      typeLines,
      '',
      'Use `/ticket setup` for server defaults, then `/ticket type-setup` and `/ticket question-add` to customize each workflow.'
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

supportUi.buildTicketsPanel = buildTicketsPanel;

module.exports = supportUi;
