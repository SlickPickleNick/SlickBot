const { ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
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
const { TemporaryRoleService } = require('./tempRoleService');
const lockdown = new LockdownService();
const tempRoles = new TemporaryRoleService();

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
  const tempRoleStats = await tempRoles.stats(guildId).catch(() => ({ active: 0, inactive: 0 }));

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

  const timeoutCfg = await query(`SELECT timeout_role_id, timeout_role_mode FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
  const timeoutRoleId = timeoutCfg.rows[0]?.timeout_role_id;

  const escalationRes = await query(
    `SELECT * FROM moderation_escalation_rules WHERE guild_id = $1 AND active = true ORDER BY warning_count ASC`,
    [guildId]
  ).catch(() => ({ rows: [] }));
  const escalationRules = escalationRes.rows || [];
  const escalationLines = escalationRules.length
    ? escalationRules.map((r) => `• **${r.warning_count} Warnings** ➔ **${r.punishment}**${r.duration_seconds ? ` (${Math.round(r.duration_seconds / 60)}m)` : ''}`).join('\n')
    : '*No auto-escalation rules configured (use `/mod escalation-set`).*';

  const embed = createBaseEmbed({
    title: 'SlickBot Core Setup',
    description: [
      '**Viewing:** Moderation Center',
      '',
      '**Configured Items**',
      '✅ Moderation commands are available through `/mod`.',
      '✅ Case tracking is active. Every moderation action creates or updates a case.',
      '✅ User notes are active through `/note`.',
      `${timeoutRoleId ? '✅' : '🟠'} Timeout Role: ${timeoutRoleId ? `<@&${timeoutRoleId}>` : 'Not configured'}`,
      `${logReady ? '✅' : '🟠'} Moderation Logs: ${logReady ? `<#${moderationLog.channel_id}>` : 'Not configured'}`,
      '',
      '**⚠️ Infraction Auto-Escalation Matrix**',
      escalationLines,
      '',
      '**Lockdown / Safety**',
      lockdownStatus.active ? `⚠️ Active lockdown: **${lockdownStatus.active.preset_name}**` : `✅ No active lockdown. Presets configured: **${lockdownStatus.presets.length || 0}**`,
      'Use `/lockdown manager` to configure emergency presets and restore controls.',
      '',
      '**Temporary Roles**',
      `Active temporary role assignments: **${tempRoleStats.active || 0}**`,
      'Use `/temp-role add` to assign a role for a fixed duration.',
      '',
      '**Setup Checklist**',
      logReady ? '• Logging is configured for moderation events.' : '• Select a channel below to assign your moderation log hub.',
      timeoutRoleId ? '• Timeout role is configured with server channel restrictions.' : '• Configure a timeout role using Quick Setup or the Auto-Mod panel.',
      '• Review staff command access in `/permissions panel`.',
      '• Use `/case panel` to review recent cases and `/note add` for private staff notes.',
      '',
      '**Case Snapshot**',
      `Total Cases: **${stats.total || 0}**`,
      `Open Cases: **${stats.open_count || 0}**`,
      `Last 24 Hours: **${stats.last_day || 0}**`,
      `Active User Notes: **${notes.rows[0]?.total || 0}**`,
      `Escalation Rules: **${escalationRules.length} configured**`,
      '',
      '**Recent Cases**',
      truncate(recentLines, 1800),
      '',
      'Reverse actions are available through `/mod untimeout` and `/mod unban`.'
    ].join('\n'),
    color: logReady && timeoutRoleId ? SlickBotColors.PRIMARY : SlickBotColors.WARNING
  });

  const channelSelect = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(CustomIds.ModerationSetLogChannel)
      .setPlaceholder('📜 Select Moderation Log Channel...')
      .setChannelTypes([ChannelType.GuildText])
  );

  const row1 = createButtonRow([
    createPanelButton(`${CustomIds.OnboardingModulePrefix}MODERATION`, 'Quick Setup', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.AutoModRefresh, 'Auto-Mod & Timeouts', ButtonStyle.Primary, '🛡️'),
    createPanelButton(CustomIds.CasesRefresh, 'Cases', ButtonStyle.Secondary, '🗂️'),
    createPanelButton(CustomIds.LockdownRefresh, 'Lockdown', ButtonStyle.Secondary, '🔒'),
    createPanelButton(CustomIds.TempRolesRefresh, 'Temp Roles', ButtonStyle.Secondary, '⏳')
  ]);

  const modConfig = await query(`SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = 'MODERATION' LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
  const enabled = modConfig.rows[0]?.enabled ?? true;

  const row2 = createButtonRow([
    createPanelButton(`${CustomIds.ModuleTogglePrefix}MODERATION`, enabled ? 'Disable Mod' : 'Enable Mod', enabled ? ButtonStyle.Danger : ButtonStyle.Success, enabled ? '⏸️' : '▶️'),
    createPanelButton(CustomIds.ModerationRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupCategoryCore, 'Core & Safety', ButtonStyle.Primary, '🛡️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ]);

  return { embeds: [embed], components: [channelSelect, row1, row2] };
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
