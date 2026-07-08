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
const { buildSupportPanel } = require('../support/supportUi');
const { LogModuleCatalog, LogEventCatalog, getEventsForModule } = require('../logging/logEventCatalog');
const { defaultTeamPermissions } = require('../permissions/actionKeys');

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

  const modules = await query(
    `SELECT module_key, enabled FROM module_configs WHERE guild_id = $1 ORDER BY module_key ASC`,
    [guildId]
  );
  const teams = await query(
    `SELECT COUNT(*)::int AS count FROM permission_teams WHERE guild_id = $1`,
    [guildId]
  );
  const configuredLogs = await query(
    `SELECT COUNT(*)::int AS count FROM log_module_settings WHERE guild_id = $1 AND enabled = true AND channel_id IS NOT NULL`,
    [guildId]
  );
  const cases = await query(
    `SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id = $1`,
    [guildId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  const enabledCount = modules.rows.filter((row) => row.enabled).length;

  const embed = createBaseEmbed({
    title: 'SlickBot Setup Center',
    description: [
      `Server: **${guildName || 'Current Server'}**`,
      '',
      '**System Snapshot**',
      `Modules Enabled: **${enabledCount}/${modules.rowCount}**`,
      `Permission Teams: **${teams.rows[0]?.count || 0}**`,
      `Configured Log Modules: **${configuredLogs.rows[0]?.count || 0}**`,
      `Moderation Cases: **${cases.rows[0]?.count || 0}**`,
      '',
      'Use the controls below to open setup panels. Logs only post when the related log module or event override has a configured channel.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY
  });

  const rowOne = createButtonRow([
    createPanelButton(CustomIds.SetupModules, 'Modules', ButtonStyle.Primary, '🧩'),
    createPanelButton(CustomIds.SetupLogging, 'Logging', ButtonStyle.Secondary, '📋'),
    createPanelButton(CustomIds.SetupModeration, 'Moderation', ButtonStyle.Secondary, '🛡️'),
    createPanelButton(CustomIds.SetupSupport, 'Support', ButtonStyle.Secondary, '🎟️'),
    createPanelButton(CustomIds.SetupStatus, 'Status', ButtonStyle.Secondary, '🟣')
  ]);

  const rowTwo = createButtonRow([
    createPanelButton(CustomIds.SetupTeams, 'Teams', ButtonStyle.Secondary, '👥'),
    createPanelButton(CustomIds.SetupPermissions, 'Permissions', ButtonStyle.Secondary, '🔐'),
    createPanelButton(CustomIds.SetupRefresh, 'Refresh', ButtonStyle.Secondary, '🔄')
  ]);

  return { embeds: [embed], components: [rowOne, rowTwo] };
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
  const moduleSettings = await query(
    `SELECT module_key, delivery_mode, channel_id, enabled, batch_interval_seconds
     FROM log_module_settings
     WHERE guild_id = $1
     ORDER BY module_key ASC`,
    [guildId]
  );
  const eventSettings = await query(
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

  const moduleSettingsByKey = new Map(moduleSettings.rows.map((row) => [row.module_key, row]));
  const eventSettingsByKey = new Map(eventSettings.rows.map((row) => [row.event_key, row]));

  const moduleLines = LogModuleCatalog.map((logModule) => {
    const row = moduleSettingsByKey.get(logModule.key);
    const eventCount = getEventsForModule(logModule.key).length;
    if (!row || !row.channel_id || row.enabled === false) {
      return `• **${logModule.label}** ` + '`' + logModule.key + '`' + ` — Not configured · ${eventCount} event(s)`;
    }
    return `• **${logModule.label}** ` + '`' + logModule.key + '`' + ` — ${row.delivery_mode || 'IMMEDIATE'} → <#${row.channel_id}> · ${eventCount} event(s)`;
  }).join('\n');

  const overrides = eventSettings.rows.filter((row) => row.channel_id || row.delivery_mode || row.enabled === false);
  const overrideLines = overrides.length
    ? overrides.slice(0, 10).map((row) => {
      const event = LogEventCatalog.find((item) => item.key === row.event_key);
      const parts = [];
      if (row.enabled === false) parts.push('Disabled');
      if (row.delivery_mode) parts.push(row.delivery_mode);
      if (row.channel_id) parts.push(`→ <#${row.channel_id}>`);
      return `• **${event?.label || row.event_key}** ` + '`' + row.event_key + '`' + ` — ${parts.join(' ') || 'Override saved'}`;
    }).join('\n')
    : 'No event overrides configured. Events currently follow their module settings.';

  const embed = createBaseEmbed({
    title: 'SlickBot Logging Center',
    description: [
      `Queued Batched Logs: **${queued.rows[0]?.count || 0}**`,
      '',
      '**Log Modules**',
      moduleLines,
      '',
      '**Event Overrides**',
      overrideLines,
      '',
      'Configure the main groups with `/logging set-channel`. Use `/logging event-mode` or `/logging event-channel` only when one event needs different behavior.'
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


async function buildPermissionsPanel(guildId) {
  const [teams, moduleTargets, publicActions, roleActions, ignored] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM permission_teams WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT module_key, COUNT(*)::int AS count FROM module_permission_targets WHERE guild_id = $1 AND allow = true GROUP BY module_key ORDER BY module_key ASC`, [guildId]).catch(() => ({ rows: [] })),
    query(`SELECT action_key FROM public_action_permissions WHERE guild_id = $1 AND enabled = true ORDER BY action_key ASC LIMIT 12`, [guildId]).catch(() => ({ rows: [] })),
    query(`SELECT COUNT(*)::int AS count FROM role_action_permissions WHERE guild_id = $1 AND allow = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM permission_ignored_users WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  const moduleLines = moduleTargets.rows.length
    ? moduleTargets.rows.map((row) => `• **${row.module_key}** — ${row.count} target(s)`).join('\n')
    : 'No module-level locks configured. Commands currently use action-level permissions and public command settings.';

  const publicLines = publicActions.rows.length
    ? publicActions.rows.map((row) => `• \`${row.action_key}\``).join('\n')
    : 'No command/action keys are explicitly public.';

  const embed = createBaseEmbed({
    title: 'SlickBot Permission Center',
    description: [
      '**Permission Snapshot**',
      `Teams: **${teams.rows[0]?.count || 0}**`,
      `Role Command Grants: **${roleActions.rows[0]?.count || 0}**`,
      `Ignored Users: **${ignored.rows[0]?.count || 0}**`,
      '',
      '**Module Access Rules**',
      moduleLines,
      '',
      '**Public Commands**',
      publicLines,
      '',
      'Use `/permissions module-allow-team`, `/permissions module-allow-role`, `/permissions command-allow-team`, `/permissions command-allow-role`, and `/permissions command-public` to configure access. Ignored users cannot interact with SlickBot.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.PermissionsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupTeams, 'Teams', ButtonStyle.Secondary, '👥'),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Primary, '↩️')
  ]);

  return { embeds: [embed], components: [row] };
}

module.exports = {
  ensureDefaultModules,
  buildSetupPanel,
  buildModulesPanel,
  buildLoggingPanel,
  buildTeamsPanel,
  buildPermissionsPanel
};
