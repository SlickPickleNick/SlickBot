const { defaultModules, isCoreModule } = require('../moduleRegistry');
const { query } = require('../../services/db');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  createSelectRow,
  ButtonStyle,
  SlickBotColors,
  formatEnabled
} = require('./uiService');
const { CustomIds } = require('./customIds');

async function ensureDefaultModules(guildId) {
  for (const moduleConfig of defaultModules) {
    await query(
      `INSERT INTO module_configs (guild_id, module_key, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, module_key) DO NOTHING`,
      [guildId, moduleConfig.key, moduleConfig.enabled]
    );
  }
}

async function buildSetupPanel(guildId, guildName = null) {
  await ensureDefaultModules(guildId);

  const guildConfig = await query(
    `SELECT * FROM guild_configs WHERE guild_id = $1 LIMIT 1`,
    [guildId]
  );
  const modules = await query(
    `SELECT module_key, enabled FROM module_configs WHERE guild_id = $1 ORDER BY module_key ASC`,
    [guildId]
  );
  const teams = await query(
    `SELECT COUNT(*)::int AS count FROM permission_teams WHERE guild_id = $1`,
    [guildId]
  );

  const enabledCount = modules.rows.filter((row) => row.enabled).length;
  const logChannelId = guildConfig.rows[0]?.default_log_channel_id || null;

  const embed = createBaseEmbed({
    title: 'SlickBot Setup Center',
    description: [
      `Server: **${guildName || 'Current Server'}**`,
      '',
      '**System Snapshot**',
      `Log Channel: ${logChannelId ? `<#${logChannelId}>` : '**Not Set**'}`,
      `Modules Enabled: **${enabledCount}/${modules.rowCount}**`,
      `Permission Teams: **${teams.rows[0]?.count || 0}**`,
      '',
      'Use the controls below to review setup areas. Detailed configuration still uses slash commands in this version.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.SetupModules, 'Modules', ButtonStyle.Primary, '🧩'),
    createPanelButton(CustomIds.SetupLogging, 'Logging', ButtonStyle.Secondary, '📋'),
    createPanelButton(CustomIds.SetupStatus, 'Status', ButtonStyle.Secondary, '🟣'),
    createPanelButton(CustomIds.SetupTeams, 'Teams', ButtonStyle.Secondary, '🛡️'),
    createPanelButton(CustomIds.SetupRefresh, 'Refresh', ButtonStyle.Secondary, '🔄')
  ]);

  return { embeds: [embed], components: [row] };
}

async function buildModulesPanel(guildId) {
  await ensureDefaultModules(guildId);
  const modules = await query(
    `SELECT module_key, enabled FROM module_configs WHERE guild_id = $1 ORDER BY module_key ASC`,
    [guildId]
  );

  const enabled = modules.rows.filter((row) => row.enabled);
  const disabled = modules.rows.filter((row) => !row.enabled);

  const embed = createBaseEmbed({
    title: 'SlickBot Module Manager',
    description: [
      '**Enabled Modules**',
      enabled.length ? enabled.map((row) => `• **${row.module_key}**${isCoreModule(row.module_key) ? ' — Core' : ''}`).join('\n') : 'None',
      '',
      '**Disabled Modules**',
      disabled.length ? disabled.map((row) => `• ${row.module_key}`).join('\n') : 'None',
      '',
      'Use the menu below to toggle non-core modules.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const options = modules.rows.map((row) => ({
    label: row.module_key,
    value: row.module_key,
    description: isCoreModule(row.module_key)
      ? 'Core module; cannot be disabled.'
      : `${formatEnabled(row.enabled)}. Select to toggle.`,
    emoji: row.enabled ? '✅' : '⬜'
  }));

  const select = createSelectRow(CustomIds.ModulesSelect, 'Toggle a module...', options.slice(0, 25));
  const buttons = createButtonRow([
    createPanelButton(CustomIds.ModulesRefresh, 'Refresh Modules', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Primary, '↩️')
  ]);

  return { embeds: [embed], components: [select, buttons] };
}

async function buildLoggingPanel(guildId) {
  const config = await query(
    `SELECT default_log_channel_id FROM guild_configs WHERE guild_id = $1 LIMIT 1`,
    [guildId]
  );
  const settings = await query(
    `SELECT event_key, delivery_mode, channel_id, enabled, batch_interval_seconds
     FROM log_settings
     WHERE guild_id = $1
     ORDER BY event_key ASC`,
    [guildId]
  );
  const queued = await query(
    `SELECT COUNT(*)::int AS count FROM log_queue_items WHERE guild_id = $1 AND flushed_at IS NULL`,
    [guildId]
  );

  const defaultChannelId = config.rows[0]?.default_log_channel_id || null;
  const settingLines = settings.rowCount
    ? settings.rows.map((row) => `• **${row.event_key}** — ${row.enabled ? row.delivery_mode : 'DISABLED'}${row.channel_id ? ` → <#${row.channel_id}>` : ''}`).join('\n')
    : 'No event-specific log settings yet. Default behavior is batched.';

  const embed = createBaseEmbed({
    title: 'SlickBot Logging Center',
    description: [
      `Default Log Channel: ${defaultChannelId ? `<#${defaultChannelId}>` : '**Not Set**'}`,
      `Queued Batched Logs: **${queued.rows[0]?.count || 0}**`,
      '',
      '**Configured Log Events**',
      settingLines,
      '',
      'Use `/logging set-channel`, `/logging mode`, and the controls below to manage logs.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.LoggingTest, 'Send Test', ButtonStyle.Primary, '🧪'),
    createPanelButton(CustomIds.LoggingFlush, 'Flush Queue', ButtonStyle.Success, '📤'),
    createPanelButton(CustomIds.LoggingRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Secondary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

async function buildTeamsPanel(guildId) {
  const teams = await query(
    `SELECT pt.id, pt.name, pt.description,
            COALESCE(COUNT(DISTINCT ptr.role_id), 0)::int AS role_count,
            COALESCE(COUNT(DISTINCT ptu.user_id), 0)::int AS user_count
     FROM permission_teams pt
     LEFT JOIN permission_team_roles ptr ON ptr.team_id = pt.id
     LEFT JOIN permission_team_users ptu ON ptu.team_id = pt.id
     WHERE pt.guild_id = $1
     GROUP BY pt.id, pt.name, pt.description
     ORDER BY pt.name ASC`,
    [guildId]
  );

  const lines = teams.rowCount
    ? teams.rows.map((team) => `• **${team.name}** — ${team.role_count} role(s), ${team.user_count} user(s)${team.description ? `\n  ${team.description}` : ''}`).join('\n')
    : 'No teams found. Run `/setup` first.';

  const embed = createBaseEmbed({
    title: 'SlickBot Permission Teams',
    description: [
      lines,
      '',
      'Use `/team create`, `/team add-role`, `/team remove-role`, and `/team allow` to edit teams.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Primary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

module.exports = {
  ensureDefaultModules,
  buildSetupPanel,
  buildModulesPanel,
  buildLoggingPanel,
  buildTeamsPanel
};
