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
const { LockdownService } = require('../safety/lockdownService');
const lockdown = new LockdownService();

async function buildModerationPanel(guildId) {
  const cases = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_day
     FROM moderation_cases
     WHERE guild_id = $1`,
    [guildId]
  );

  const lockdownStatus = await lockdown.getStatus(guildId).catch(() => ({ active: null, presets: [] }));

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

  const logConfig = await query(
    `SELECT channel_id, enabled, delivery_mode
     FROM log_module_settings
     WHERE guild_id = $1 AND module_key = 'moderation'
     LIMIT 1`,
    [guildId]
  ).catch(() => ({ rows: [] }));

  const stats = cases.rows[0] || { total: 0, open_count: 0, last_day: 0 };
  const recentLines = recent.rowCount
    ? recent.rows.map(formatCaseLine).join('\n\n')
    : 'No moderation cases have been created yet.';

  const moderationLog = logConfig.rows[0];
  const logReady = Boolean(moderationLog?.channel_id && moderationLog.enabled !== false && moderationLog.delivery_mode !== 'DISABLED');

  const embed = createBaseEmbed({
    title: 'SlickBot Core Setup',
    description: [
      '**Viewing:** Moderation Center',
      '',
      '**Configured Items**',
      '✅ Moderation commands are available through `/mod`.',
      '✅ Case tracking is active. Every moderation action creates or updates a case.',
      '✅ User notes are active through `/note`.',
      `${logReady ? '✅' : '🟠'} Moderation Logs: ${logReady ? `<#${moderationLog.channel_id}>` : 'Not configured'}`,
      '',
      '**Lockdown / Safety**',
      lockdownStatus.active ? `⚠️ Active lockdown: **${lockdownStatus.active.preset_name}**` : `✅ No active lockdown. Presets configured: **${lockdownStatus.presets.length || 0}**`,
      'Use `/lockdown manager` to configure emergency presets and restore controls.',
      '',
      '**Setup Checklist**',
      logReady ? '• Logging is configured for moderation events.' : '• Set moderation logs with `/logging set-channel module:moderation channel:#logs`.',
      '• Review staff command access in `/permissions panel`.',
      '• Use `/case panel` to review recent cases and `/note add` for private staff notes.',
      '',
      '**Case Snapshot**',
      `Total Cases: **${stats.total || 0}**`,
      `Open Cases: **${stats.open_count || 0}**`,
      `Last 24 Hours: **${stats.last_day || 0}**`,
      `Active User Notes: **${notes.rows[0]?.total || 0}**`,
      '',
      '**Recent Cases**',
      truncate(recentLines, 1800),
      '',
      'Reverse actions are available through `/mod untimeout` and `/mod unban`.'
    ].join('\n'),
    color: logReady ? SlickBotColors.PRIMARY : SlickBotColors.WARNING
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.ModerationRefresh, 'Refresh', ButtonStyle.Primary, '🔄'),
    createPanelButton(CustomIds.CasesRefresh, 'Recent Cases', ButtonStyle.Secondary, '🗂️'),
    createPanelButton(CustomIds.LockdownRefresh, 'Lockdown', ButtonStyle.Secondary),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Secondary, '↩️')
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
    title: 'SlickBot Core Setup',
    description: [
      '**Viewing:** Recent Moderation Cases',
      '',
      recent.rowCount
        ? truncate(recent.rows.map(formatCaseLine).join('\n\n'), 3400)
        : 'No cases found.'
    ].join('\n'),
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
