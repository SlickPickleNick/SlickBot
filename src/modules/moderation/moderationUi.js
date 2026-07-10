const { query } = require('../../services/db');
const { formatCaseLine, formatNoteLine } = require('./moderationService');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  ButtonStyle,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { truncate } = require('../../utils/format');

async function buildModerationPanel(guildId) {
  const cases = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_day
     FROM moderation_cases
     WHERE guild_id = $1`,
    [guildId]
  );

  const notes = await query(
    `SELECT COUNT(*)::int AS total FROM user_notes WHERE guild_id = $1 AND is_active = true`,
    [guildId]
  );

  const recent = await query(
    `SELECT * FROM moderation_cases
     WHERE guild_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [guildId]
  );

  const stats = cases.rows[0] || { total: 0, open_count: 0, last_day: 0 };
  const recentLines = recent.rowCount
    ? recent.rows.map(formatCaseLine).join('\n\n')
    : 'No moderation cases have been created yet.';

  const embed = createBaseEmbed({
    title: 'SlickBot Moderation Center',
    description: [
      '**Case Snapshot**',
      `Total Cases: **${stats.total || 0}**`,
      `Open Cases: **${stats.open_count || 0}**`,
      `Last 24 Hours: **${stats.last_day || 0}**`,
      `Active User Notes: **${notes.rows[0]?.total || 0}**`,
      '',
      '**Recent Cases**',
      truncate(recentLines, 2200),
      '',
      'Use `/mod`, `/case`, and `/note` for moderation actions and lookups. Reverse actions are available through `/mod untimeout` and `/mod unban`.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.ModerationRefresh, 'Refresh', ButtonStyle.Primary, '🔄'),
    createPanelButton(CustomIds.CasesRefresh, 'Recent Cases', ButtonStyle.Secondary, '🗂️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup', ButtonStyle.Secondary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

async function buildRecentCasesPanel(guildId) {
  const recent = await query(
    `SELECT * FROM moderation_cases
     WHERE guild_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [guildId]
  );

  const embed = createBaseEmbed({
    title: 'Recent Moderation Cases',
    description: recent.rowCount
      ? truncate(recent.rows.map(formatCaseLine).join('\n\n'), 3500)
      : 'No cases found.',
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.ModerationRefresh, 'Back to Moderation', ButtonStyle.Primary, '↩️'),
    createPanelButton(CustomIds.CasesRefresh, 'Refresh Cases', ButtonStyle.Secondary, '🔄')
  ]);

  return { embeds: [embed], components: [row] };
}

function buildCaseEmbed(caseRecord, title = null) {
  return createBaseEmbed({
    title: title || `Moderation Case #${caseRecord.case_number}`,
    description: [
      `Target: <@${caseRecord.target_user_id}> \`${caseRecord.target_user_id}\``,
      `Action: **${caseRecord.action_type}**`,
      `Status: **${caseRecord.status}**`,
      `Moderator: ${caseRecord.actor_user_id ? `<@${caseRecord.actor_user_id}>` : 'Unknown'}`,
      caseRecord.duration_seconds ? `Duration: **${Math.round(caseRecord.duration_seconds / 60)} minute(s)**` : null,
      caseRecord.expires_at ? `Expires: **${new Date(caseRecord.expires_at).toISOString()}**` : null,
      '',
      '**Reason**',
      truncate(caseRecord.reason || 'No reason provided.', 1000),
      caseRecord.evidence ? `\n**Evidence**\n${truncate(caseRecord.evidence, 700)}` : null
    ].filter(Boolean).join('\n'),
    color: SlickBotColors.INFO
  });
}

function buildNotesEmbed(targetUser, notes) {
  const description = notes.length
    ? truncate(notes.map(formatNoteLine).join('\n\n'), 3500)
    : 'No active notes found for this user.';

  return createBaseEmbed({
    title: `User Notes • ${targetUser.tag || targetUser.id}`,
    description,
    color: SlickBotColors.INFO
  });
}

module.exports = {
  buildModerationPanel,
  buildRecentCasesPanel,
  buildCaseEmbed,
  buildNotesEmbed
};
