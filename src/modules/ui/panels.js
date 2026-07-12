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
const { BirthdayService } = require('../community/birthdayService');
const { ScheduledMessageService } = require('../automation/scheduledMessageService');
const { ServerStatsService } = require('../community/serverStatsService');
const { LevelingService } = require('../community/levelingService');
const { CustomCommandService } = require('../custom/customCommandService');
const { JoinCreateService } = require('../voice/joinCreateService');
const giveaways = new GiveawayService();
const birthdays = new BirthdayService();
const scheduledMessages = new ScheduledMessageService();
const serverStats = new ServerStatsService();
const leveling = new LevelingService();
const customCommands = new CustomCommandService();
const joinCreate = new JoinCreateService();

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
    createPanelButton(CustomIds.ScheduledMessagesRefresh, 'Schedule', ButtonStyle.Secondary, '🗓️'),
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

  if (row.module_key === 'BIRTHDAYS') {
    const [cfg, profiles] = await Promise.all([
      query(`SELECT channel_id, birthday_role_id, enabled FROM birthday_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM birthday_profiles WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const configured = Boolean(cfg.rows[0]?.channel_id || cfg.rows[0]?.birthday_role_id);
    if (configured && cfg.rows[0]?.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${profiles.rows[0]?.count || 0} birthday(s)` };
    if ((profiles.rows[0]?.count || 0) > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${profiles.rows[0]?.count || 0} birthday(s), setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /birthday setup' };
  }


  if (row.module_key === 'SCHEDULED_MESSAGES') {
    const [cfg, active] = await Promise.all([
      query(`SELECT default_channel_id, enabled FROM scheduled_message_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM scheduled_messages WHERE guild_id = $1 AND status = 'SCHEDULED'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    if (cfg.rows[0]?.default_channel_id && cfg.rows[0]?.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${active.rows[0]?.count || 0} scheduled` };
    if ((active.rows[0]?.count || 0) > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${active.rows[0]?.count || 0} scheduled, setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /schedule setup' };
  }


  if (row.module_key === 'LEVELING') {
    const [cfg, profiles, rewards] = await Promise.all([
      query(`SELECT enabled, level_up_channel_id FROM leveling_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM leveling_profiles WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM leveling_role_rewards WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0];
    if (!config) return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /level setup' };
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '🔴', label: 'Disabled', note: 'XP awards off' };
    const rewardCount = rewards.rows[0]?.count || 0;
    const profileCount = profiles.rows[0]?.count || 0;
    if (config.level_up_channel_id || rewardCount > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${profileCount} profile(s)` };
    return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: 'XP active; no rewards/announcement' };
  }

  if (row.module_key === 'SERVER_STATS') {
    const cfg = await query(`SELECT enabled, member_channel_id, human_channel_id, bot_channel_id, voice_channel_id FROM server_stats_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const config = cfg.rows[0] || {};
    const configured = [config.member_channel_id, config.human_channel_id, config.bot_channel_id, config.voice_channel_id].filter(Boolean).length;
    if (configured >= 4 && config.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: '4/4 counters' };
    if (configured > 0 && config.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${configured}/4 counters` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /stats setup' };
  }


  if (row.module_key === 'BOT_UPDATES') {
    const [cfg, roles, announced] = await Promise.all([
      query(`SELECT enabled, channel_id, ping_roles_enabled FROM bot_update_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM bot_update_ping_roles WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM bot_update_announcements WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0] || {};
    const roleCount = roles.rows[0]?.count || 0;
    const announcementCount = announced.rows[0]?.count || 0;
    if (config.channel_id && config.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${roleCount} ping role(s), ${announcementCount} sent` };
    if (announcementCount > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${announcementCount} sent, setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /bot-updates setup' };
  }

  if (row.module_key === 'CUSTOM_COMMANDS') {
    const [cfg, commands, enabled] = await Promise.all([
      query(`SELECT enabled, prefix FROM custom_command_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM custom_commands WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM custom_commands WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0] || {};
    const total = commands.rows[0]?.count || 0;
    const active = enabled.rows[0]?.count || 0;
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '🔴', label: 'Disabled', note: 'Listener off' };
    if (active > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${active}/${total} command(s)` };
    if (total > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${total} disabled command(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /custom-command create' };
  }


  if (row.module_key === 'JOIN_TO_CREATE') {
    const [hubs, active] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM join_create_hubs WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM join_create_temp_channels WHERE guild_id = $1 AND status = 'ACTIVE'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const hubCount = hubs.rows[0]?.count || 0;
    const activeCount = active.rows[0]?.count || 0;
    if (hubCount > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '🟢', label: 'Fully enabled', note: `${hubCount} hub(s), ${activeCount} active` };
    if (activeCount > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially enabled', note: `${activeCount} active, setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs configuration', note: 'Run /join-create setup' };
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


function compactCommunityText(payload, fallback) {
  const value = payload?.embeds?.[0]?.data?.description || fallback;
  return String(value).length > 520 ? `${String(value).slice(0, 517)}...` : String(value);
}

async function buildCommunityPanel(guildId) {
  const welcomePayload = await buildWelcomePanel(guildId);
  const rolePayload = await buildRoleManagerPanel(guildId);
  const giveawayPayload = await giveaways.buildManagerPanel(guildId);
  const birthdayPayload = await birthdays.buildManagerPanel(guildId);
  const statsPayload = await serverStats.buildManagerPanel({ id: guildId, memberCount: 0, members: { fetch: async () => null, cache: { size: 0, filter: () => ({ size: 0 }) } }, channels: { cache: { filter: () => ({ reduce: () => 0 }) } } }).catch(() => ({ embeds: [{ data: { description: 'Server stats not configured.' } }] }));
  const levelingPayload = await leveling.buildManagerPanel(guildId).catch(() => ({ embeds: [{ data: { description: 'Leveling not configured.' } }] }));
  const embed = createBaseEmbed({
    title: 'SlickBot Community Center',
    description: [
      '**Welcome / Auto Roles**',
      compactCommunityText(welcomePayload, 'No welcome status available.'),
      '',
      '**Reaction / Button Roles**',
      compactCommunityText(rolePayload, 'No role panel status available.'),
      '',
      '**Giveaways**',
      compactCommunityText(giveawayPayload, 'No giveaway status available.'),
      '',
      '**Birthdays**',
      compactCommunityText(birthdayPayload, 'No birthday status available.'),
      '',
      '**Leveling / XP**',
      compactCommunityText(levelingPayload, 'No leveling status available.'),
      '',
      '**Server Stats**',
      compactCommunityText(statsPayload, 'No server stats status available.'),
      '',
      '**Custom Commands**',
      compactCommunityText(await customCommands.buildManagerPanel(guildId).catch(() => ({ embeds: [{ data: { description: 'Custom commands not configured.' } }] })), 'No custom command status available.'),
      '',
      'Use `/welcome manager`, `/roles manager`, `/giveaway manager`, `/birthday manager`, `/level manager`, `/stats manager`, or `/custom-command panel` for focused setup controls.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });
  const rowOne = createButtonRow([
    createPanelButton(CustomIds.WelcomeRefresh, 'Welcome', ButtonStyle.Secondary, '👋'),
    createPanelButton(CustomIds.RolePanelsRefresh, 'Role Panels', ButtonStyle.Secondary, '🎛️'),
    createPanelButton(CustomIds.GiveawaysRefresh, 'Giveaways', ButtonStyle.Secondary, '🎉'),
    createPanelButton(CustomIds.BirthdaysRefresh, 'Birthdays', ButtonStyle.Secondary, '🎂'),
    createPanelButton(CustomIds.LevelingRefresh, 'Leveling', ButtonStyle.Secondary, '📈')
  ]);
  const rowTwo = createButtonRow([
    createPanelButton(CustomIds.ServerStatsRefresh, 'Stats', ButtonStyle.Secondary, '📊'),
    createPanelButton(CustomIds.SetupRefresh, 'Back', ButtonStyle.Primary, '↩️')
  ]);
  return { embeds: [embed], components: [rowOne, rowTwo] };
}

module.exports = {
  ensureDefaultModules,
  buildSetupPanel,
  buildModulesPanel,
  buildLoggingPanel,
  buildTeamsPanel,
  buildPermissionsPanel,
  buildCommunityPanel,
  getModuleStatus
};
