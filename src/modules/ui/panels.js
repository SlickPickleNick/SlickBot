const { defaultModules, isCoreModule, isImplementedModule } = require('../moduleRegistry');
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
const { buildWelcomePanel } = require('../community/welcomeService');
const { buildRoleManagerPanel } = require('../community/rolePanelService');
const { GiveawayService } = require('../community/giveawayService');
const giveaways = new GiveawayService();

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
    createPanelButton(CustomIds.SetupCommunity, 'Community', ButtonStyle.Secondary, '✨'),
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

  const statuses = await Promise.all(modules.rows.map((row) => getModuleStatus(guildId, row)));
  const byStatus = statuses.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});

  const lines = statuses.map((item) => `${item.emoji} **${item.moduleKey}**${item.core ? ' — Core' : ''} · ${item.label}${item.note ? ` · ${item.note}` : ''}`).join('\n');

  const embed = createBaseEmbed({
    title: 'SlickBot Module Manager',
    description: [
      '**Status Legend**',
      '🟢 Fully enabled · 🟠 Partially enabled · 🟣 Needs configuration · 🔴 Disabled · 🕒 Coming Soon',
      '',
      `🟢 ${byStatus.READY || 0} · 🟠 ${byStatus.PARTIAL || 0} · 🟣 ${byStatus.NEEDS_CONFIG || 0} · 🔴 ${byStatus.DISABLED || 0} · 🕒 ${byStatus.COMING_SOON || 0}`,
      '',
      '**Modules**',
      lines || 'No modules found.',
      '',
      'Use the menu below to toggle non-core modules. Configure module settings from the related manager panel.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const options = statuses.map((item) => ({
    label: item.moduleKey,
    value: item.moduleKey,
    description: isCoreModule(item.moduleKey)
      ? 'Core module; cannot be disabled.'
      : `${item.label}. Select to toggle.`,
    emoji: item.emoji
  }));

  const select = createSelectRow(CustomIds.ModulesSelect, 'Toggle a module...', options.slice(0, 25));
  const buttons = createButtonRow([
    createPanelButton(CustomIds.ModulesRefresh, 'Refresh Modules', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Primary, '↩️')
  ]);

  return { embeds: [embed], components: [select, buttons] };
}

async function getModuleStatus(guildId, row) {
  if (!isImplementedModule(row.module_key)) {
    return { moduleKey: row.module_key, core: false, state: 'COMING_SOON', emoji: '🕒', label: 'Coming Soon', note: 'Not built yet' };
  }

  if (!row.enabled) return { moduleKey: row.module_key, core: isCoreModule(row.module_key), state: 'DISABLED', emoji: '🔴', label: 'Disabled', note: 'Off' };

  if (row.module_key === 'LOGGING') {
    const totalRequired = LogModuleCatalog.length;
    const logs = await query(
      `SELECT COUNT(*)::int AS count
       FROM log_module_settings
       WHERE guild_id = $1 AND enabled = true AND channel_id IS NOT NULL`,
      [guildId]
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const configured = logs.rows[0]?.count || 0;
    if (configured <= 0) return { moduleKey: row.module_key, core: true, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'No log channels' };
    if (configured < totalRequired) return { moduleKey: row.module_key, core: true, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${configured}/${totalRequired} log groups` };
    return { moduleKey: row.module_key, core: true, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${configured}/${totalRequired} log groups` };
  }

  if (isCoreModule(row.module_key)) return { moduleKey: row.module_key, core: true, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: 'Core' };

  if (row.module_key === 'TICKETS') {
    const cfg = await query(`SELECT category_id, staff_role_id FROM ticket_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const types = await query(`SELECT COUNT(*)::int AS count FROM ticket_types WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    const ready = Boolean(cfg.rows[0]?.category_id) && (Boolean(cfg.rows[0]?.staff_role_id) || (types.rows[0]?.count || 0) > 0);
    return ready ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${types.rows[0]?.count || 0} type(s)` } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /ticket setup' };
  }

  if (row.module_key === 'REPORTS') {
    const cfg = await query(`SELECT review_channel_id FROM report_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    return cfg.rows[0]?.review_channel_id ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: 'Review channel set' } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /report setup' };
  }

  if (row.module_key === 'APPLICATIONS') {
    const types = await query(`SELECT COUNT(*)::int AS count FROM application_types WHERE guild_id = $1 AND enabled = true AND review_channel_id IS NOT NULL`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    return (types.rows[0]?.count || 0) > 0 ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${types.rows[0].count} type(s)` } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /application setup' };
  }

  if (row.module_key === 'APPEALS') {
    const cfg = await query(`SELECT review_channel_id FROM appeal_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    return cfg.rows[0]?.review_channel_id ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: 'Review channel set' } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /appeal setup' };
  }

  if (row.module_key === 'WELCOME') {
    const [cfg, roles] = await Promise.all([
      query(`SELECT channel_id, enabled FROM welcome_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM welcome_auto_roles WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const hasChannel = Boolean(cfg.rows[0]?.channel_id && cfg.rows[0]?.enabled !== false);
    const autoRoles = roles.rows[0]?.count || 0;
    if (hasChannel && autoRoles > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: 'Welcome + auto roles' };
    if (hasChannel || autoRoles > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: hasChannel ? 'Welcome channel set' : `${autoRoles} auto role(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /welcome setup' };
  }

  if (row.module_key === 'REACTION_ROLES') {
    const panels = await query(`SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    return (panels.rows[0]?.count || 0) > 0
      ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${panels.rows[0].count} panel(s)` }
      : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /roles create-panel' };
  }


  if (row.module_key === 'GIVEAWAYS') {
    const cfg = await query(`SELECT default_channel_id, ping_role_id FROM giveaway_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const active = await query(`SELECT COUNT(*)::int AS count FROM giveaways WHERE guild_id = $1 AND status = 'OPEN'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    if (cfg.rows[0]?.default_channel_id) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${active.rows[0]?.count || 0} active` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /giveaway setup' };
  }

  return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: 'Module shell only' };
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


async function buildCommunityPanel(guildId) {
  const welcomePayload = await buildWelcomePanel(guildId);
  const rolePayload = await buildRoleManagerPanel(guildId);
  const giveawayPayload = await giveaways.buildManagerPanel(guildId);
  const embed = createBaseEmbed({
    title: 'SlickBot Community Center',
    description: [
      '**Welcome / Auto Roles**',
      welcomePayload.embeds[0].data.description || 'No welcome status available.',
      '',
      '**Reaction / Button Roles**',
      rolePayload.embeds[0].data.description || 'No role panel status available.',
      '',
      '**Giveaways**',
      giveawayPayload.embeds[0].data.description || 'No giveaway status available.',
      '',
      'Use `/welcome manager`, `/roles manager`, or `/giveaway manager` for focused setup controls.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });
  const row = createButtonRow([
    createPanelButton(CustomIds.WelcomeRefresh, 'Welcome', ButtonStyle.Secondary, '👋'),
    createPanelButton(CustomIds.RolePanelsRefresh, 'Role Panels', ButtonStyle.Secondary, '🎛️'),
    createPanelButton(CustomIds.GiveawaysRefresh, 'Giveaways', ButtonStyle.Secondary, '🎉'),
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
  buildPermissionsPanel,
  buildCommunityPanel
};
