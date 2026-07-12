const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { query } = require('../../services/db');
const { CustomIds } = require('../ui/customIds');
const { createBaseEmbed, createSuccessEmbed, SlickBotColors } = require('../ui/uiService');

const SUPPORT_RESET_MODULES = Object.freeze({
  tickets: {
    key: 'tickets',
    label: 'Tickets',
    panelType: 'ticket',
    moduleKey: 'TICKETS',
    actionKey: 'tickets.reset',
    warning: 'This clears ticket setup, ticket types/questions, ticket records, added-user records, and tracked ticket panel posts. It does not delete Discord ticket channels that already exist.'
  },
  reports: {
    key: 'reports',
    label: 'Reports',
    panelType: 'report',
    moduleKey: 'REPORTS',
    actionKey: 'reports.reset',
    warning: 'This clears report setup, report submissions/review records, and tracked report panel posts. It does not delete Discord review messages that already exist.'
  },
  applications: {
    key: 'applications',
    label: 'Applications',
    panelType: 'application',
    moduleKey: 'APPLICATIONS',
    actionKey: 'applications.reset',
    warning: 'This clears application types, questions, active DM sessions, submissions/review records, and tracked application panel posts. It does not delete Discord review messages or threads that already exist.'
  },
  appeals: {
    key: 'appeals',
    label: 'Appeals',
    panelType: 'appeal',
    moduleKey: 'APPEALS',
    actionKey: 'appeals.reset',
    warning: 'This clears appeal setup, appeal submissions/review records, and tracked appeal panel posts. It does not delete Discord review messages that already exist.'
  }
});

function getSupportResetModule(moduleKey) {
  return SUPPORT_RESET_MODULES[String(moduleKey || '').toLowerCase()] || null;
}

async function countRows(sql, params) {
  const result = await query(sql, params).catch(() => ({ rows: [{ count: 0 }] }));
  return Number(result.rows[0]?.count || 0);
}

async function getSupportResetSummary(guildId, moduleKey) {
  const mod = getSupportResetModule(moduleKey);
  if (!mod) throw new Error('Unknown support reset module.');

  if (mod.key === 'tickets') {
    const [configs, types, tickets, activeTickets, addedUsers, trackedPanels] = await Promise.all([
      countRows(`SELECT COUNT(*) FROM ticket_configs WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM ticket_types WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM tickets WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM tickets WHERE guild_id = $1 AND status <> 'CLOSED'`, [guildId]),
      countRows(`SELECT COUNT(*) FROM ticket_added_users WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM panel_messages WHERE guild_id = $1 AND panel_type = 'ticket' AND active = true`, [guildId])
    ]);
    return { mod, counts: { configs, types, tickets, activeTickets, addedUsers, trackedPanels } };
  }

  if (mod.key === 'reports') {
    const [configs, reports, openReports, trackedPanels] = await Promise.all([
      countRows(`SELECT COUNT(*) FROM report_configs WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM reports WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM reports WHERE guild_id = $1 AND status NOT IN ('RESOLVED', 'DISMISSED')`, [guildId]),
      countRows(`SELECT COUNT(*) FROM panel_messages WHERE guild_id = $1 AND panel_type = 'report' AND active = true`, [guildId])
    ]);
    return { mod, counts: { configs, reports, openReports, trackedPanels } };
  }

  if (mod.key === 'applications') {
    const [types, questions, sessions, submissions, pendingSubmissions, reviewIndexes, trackedPanels] = await Promise.all([
      countRows(`SELECT COUNT(*) FROM application_types WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM application_questions q INNER JOIN application_types t ON q.application_type_id = t.id WHERE t.guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM application_sessions WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM application_submissions WHERE guild_id = $1`, [guildId]),
      countRows(`SELECT COUNT(*) FROM application_submissions WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]),
      countRows(`SELECT COUNT(*) FROM application_review_indexes WHERE guild_id = $1 AND active = true`, [guildId]),
      countRows(`SELECT COUNT(*) FROM panel_messages WHERE guild_id = $1 AND panel_type = 'application' AND active = true`, [guildId])
    ]);
    return { mod, counts: { types, questions, sessions, submissions, pendingSubmissions, reviewIndexes, trackedPanels } };
  }

  const [configs, appeals, pendingAppeals, trackedPanels] = await Promise.all([
    countRows(`SELECT COUNT(*) FROM appeal_configs WHERE guild_id = $1`, [guildId]),
    countRows(`SELECT COUNT(*) FROM appeals WHERE guild_id = $1`, [guildId]),
    countRows(`SELECT COUNT(*) FROM appeals WHERE guild_id = $1 AND status = 'PENDING'`, [guildId]),
    countRows(`SELECT COUNT(*) FROM panel_messages WHERE guild_id = $1 AND panel_type = 'appeal' AND active = true`, [guildId])
  ]);
  return { mod, counts: { configs, appeals, pendingAppeals, trackedPanels } };
}

function formatCounts(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `• ${key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}: **${value}**`)
    .join('\n');
}

async function buildSupportResetConfirmationPayload({ guildId, moduleKey, requestedByUserId }) {
  const summary = await getSupportResetSummary(guildId, moduleKey);
  const { mod, counts } = summary;
  const confirmId = `${CustomIds.SupportResetConfirmPrefix}${mod.key}:${requestedByUserId}`;
  const cancelId = `${CustomIds.SupportResetCancelPrefix}${mod.key}:${requestedByUserId}`;

  return {
    embeds: [createBaseEmbed({
      title: `Confirm ${mod.label} Reset`,
      description: [
        `This will reset only the **${mod.label}** support module for this server.`,
        '',
        '**What will be cleared**',
        mod.warning,
        '',
        '**Current records found**',
        formatCounts(counts),
        '',
        'This action cannot be undone from SlickBot. Confirm only if you are intentionally restarting this module setup/testing data.'
      ].join('\n'),
      color: SlickBotColors.ERROR,
      footer: 'SlickBot Support Reset'
    })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel(`Confirm ${mod.label} Reset`).setStyle(ButtonStyle.Danger).setEmoji('⚠️'),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    )]
  };
}

async function resetSupportModule(guildId, moduleKey) {
  const mod = getSupportResetModule(moduleKey);
  if (!mod) throw new Error('Unknown support reset module.');
  const before = await getSupportResetSummary(guildId, mod.key);

  if (mod.key === 'tickets') {
    await query(`DELETE FROM ticket_added_users WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM tickets WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM ticket_types WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM ticket_configs WHERE guild_id = $1`, [guildId]);
    await query(`UPDATE panel_messages SET active = false, updated_at = NOW() WHERE guild_id = $1 AND panel_type = 'ticket'`, [guildId]);
  } else if (mod.key === 'reports') {
    await query(`DELETE FROM reports WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM report_configs WHERE guild_id = $1`, [guildId]);
    await query(`UPDATE panel_messages SET active = false, updated_at = NOW() WHERE guild_id = $1 AND panel_type = 'report'`, [guildId]);
  } else if (mod.key === 'applications') {
    await query(`DELETE FROM application_sessions WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM application_submissions WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM application_review_indexes WHERE guild_id = $1`, [guildId]).catch(() => {});
    await query(`DELETE FROM application_types WHERE guild_id = $1`, [guildId]);
    await query(`UPDATE panel_messages SET active = false, updated_at = NOW() WHERE guild_id = $1 AND panel_type = 'application'`, [guildId]);
  } else if (mod.key === 'appeals') {
    await query(`DELETE FROM appeals WHERE guild_id = $1`, [guildId]);
    await query(`DELETE FROM appeal_configs WHERE guild_id = $1`, [guildId]);
    await query(`UPDATE panel_messages SET active = false, updated_at = NOW() WHERE guild_id = $1 AND panel_type = 'appeal'`, [guildId]);
  }

  return { mod, before: before.counts };
}

function buildSupportResetCompletePayload(result) {
  return {
    embeds: [createSuccessEmbed(
      `${result.mod.label} Reset Complete`,
      [
        `The **${result.mod.label}** support module was reset for this server.`,
        '',
        '**Cleared records**',
        formatCounts(result.before),
        '',
        'Run that module setup command again when you are ready to rebuild it.'
      ].join('\n')
    )],
    components: []
  };
}

module.exports = {
  SUPPORT_RESET_MODULES,
  getSupportResetModule,
  getSupportResetSummary,
  buildSupportResetConfirmationPayload,
  resetSupportModule,
  buildSupportResetCompletePayload
};
