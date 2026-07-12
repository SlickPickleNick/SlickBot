const { ModuleKeys, defaultModules, isCoreModule, isImplementedModule } = require('../moduleRegistry');
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

const STATUS_META = Object.freeze({
  READY: { emoji: '✅', label: 'Ready', color: SlickBotColors.SUCCESS },
  PARTIAL: { emoji: '🟠', label: 'Partially Configured', color: SlickBotColors.WARNING },
  NEEDS_CONFIG: { emoji: '🟣', label: 'Needs Setup', color: SlickBotColors.PRIMARY },
  DISABLED: { emoji: '⏸️', label: 'Disabled', color: SlickBotColors.MUTED },
  WARNING: { emoji: '⚠️', label: 'Warning', color: SlickBotColors.WARNING },
  ERROR: { emoji: '⛔', label: 'Error', color: SlickBotColors.ERROR },
  COMING_SOON: { emoji: '🕒', label: 'Coming Soon', color: SlickBotColors.MUTED }
});

const MODULE_CATEGORIES = Object.freeze([
  { key: 'CORE', label: 'Core Setup', modules: [ModuleKeys.PERMISSIONS, ModuleKeys.LOGGING, ModuleKeys.STATUS] },
  { key: 'SUPPORT', label: 'Support Systems', modules: [ModuleKeys.TICKETS, ModuleKeys.REPORTS, ModuleKeys.APPLICATIONS, ModuleKeys.APPEALS] },
  { key: 'COMMUNITY', label: 'Community Systems', modules: [ModuleKeys.WELCOME, ModuleKeys.REACTION_ROLES, ModuleKeys.GIVEAWAYS, ModuleKeys.BIRTHDAYS, ModuleKeys.LEVELING, ModuleKeys.SERVER_STATS, ModuleKeys.CUSTOM_COMMANDS, ModuleKeys.JOIN_TO_CREATE] },
  { key: 'AUTOMATION', label: 'Automation Systems', modules: [ModuleKeys.SCHEDULED_MESSAGES, ModuleKeys.BOT_UPDATES] },
  { key: 'BACKLOG', label: 'Coming Soon', modules: [ModuleKeys.UTILITY] }
]);

const MODULE_SETUP_CATALOG = Object.freeze({
  [ModuleKeys.PERMISSIONS]: {
    name: 'Permissions', category: 'Core Setup', description: 'Controls SlickBot command access, permission levels, teams, public actions, and ignored users.',
    managerCommand: '/permissions panel', setupCommand: '/permissions panel',
    nextSteps: ['Run `/permissions apply-defaults` after new releases.', 'Use `/team create` and `/team add-role` for staff permission groups.', 'Use `/permissions panel` to review module and command locks.'],
    usefulCommands: ['/permissions panel', '/permissions apply-defaults', '/team create', '/team add-role', '/team allow']
  },
  [ModuleKeys.LOGGING]: {
    name: 'Logging', category: 'Core Setup', description: 'Routes SlickBot event logs to configured channels by log module or individual event override.',
    managerCommand: '/logging panel', setupCommand: '/logging set-channel',
    nextSteps: ['Set at least one log group with `/logging set-channel`.', 'Use `/logging test` to verify delivery.', 'Use event overrides only when a specific event needs special routing.'],
    usefulCommands: ['/logging panel', '/logging set-channel', '/logging test', '/logging flush']
  },
  [ModuleKeys.STATUS]: {
    name: 'Bot Status', category: 'Core Setup', description: 'Controls SlickBot presence, activity text, diagnostics, version checks, and bot-level tools.',
    managerCommand: '/status panel', setupCommand: '/status set',
    nextSteps: ['Use `/bot version` after Railway deploys.', 'Use `/bot test` after major setup changes.', 'Use `/status set` only if you want a custom presence.'],
    usefulCommands: ['/status panel', '/status set', '/status clear', '/bot version', '/bot test']
  },
  [ModuleKeys.MODERATION]: {
    name: 'Moderation', category: 'Core Setup', description: 'Provides moderation actions, cases, and user notes.',
    managerCommand: '/mod panel', setupCommand: '/logging set-channel',
    nextSteps: ['Configure moderation/case log channels in `/logging panel`.', 'Review staff access in `/permissions panel`.', 'Use `/case panel` to review recent cases.'],
    usefulCommands: ['/mod panel', '/mod warn', '/mod timeout', '/case panel', '/note add']
  },
  [ModuleKeys.TICKETS]: {
    name: 'Tickets', category: 'Support Systems', description: 'Creates private support channels with ticket types, questions, staff assignment, escalation, transcripts, and panels.',
    managerCommand: '/ticket manager', setupCommand: '/ticket setup',
    nextSteps: ['Run `/ticket setup` for category, log channel, and staff/escalation teams.', 'Create ticket types with `/ticket type-setup`.', 'Add questions with `/ticket question-add` if needed.', 'Post the public panel with `/ticket panel`.'],
    usefulCommands: ['/ticket manager', '/ticket setup', '/ticket type-setup', '/ticket question-add', '/ticket panel']
  },
  [ModuleKeys.REPORTS]: {
    name: 'Reports', category: 'Support Systems', description: 'Allows private user reports, staff review actions, follow-up tickets, and review-channel embeds.',
    managerCommand: '/report manager', setupCommand: '/report setup',
    nextSteps: ['Run `/report setup` and set a review channel.', 'Post a report panel with `/report panel`.', 'Review report notification and ping settings.'],
    usefulCommands: ['/report manager', '/report setup', '/report panel']
  },
  [ModuleKeys.APPLICATIONS]: {
    name: 'Applications', category: 'Support Systems', description: 'Runs custom application types through DMs, records answers, and sends review embeds with transcripts.',
    managerCommand: '/application manager', setupCommand: '/application setup',
    nextSteps: ['Create an application type with `/application setup`.', 'Add custom questions with `/application question-add`.', 'Post the public application panel with `/application panel`.', 'Test the application flow from a non-staff account if possible.'],
    usefulCommands: ['/application manager', '/application setup', '/application question-add', '/application question-list', '/application panel']
  },
  [ModuleKeys.APPEALS]: {
    name: 'Appeals', category: 'Support Systems', description: 'Collects appeals, sends them to a review channel, and manages approve/deny decisions and DMs.',
    managerCommand: '/appeal manager', setupCommand: '/appeal setup',
    nextSteps: ['Run `/appeal setup` for the initial review channel and panel settings.', 'Use `/appeal edit` for partial changes later.', 'Post the public panel with `/appeal panel`.'],
    usefulCommands: ['/appeal manager', '/appeal setup', '/appeal edit', '/appeal panel']
  },
  [ModuleKeys.WELCOME]: {
    name: 'Welcome / Auto Roles', category: 'Community Systems', description: 'Sends welcome messages and grants configured roles when members join.',
    managerCommand: '/welcome manager', setupCommand: '/welcome setup',
    nextSteps: ['Run `/welcome setup` to configure welcome behavior.', 'Add auto roles with `/welcome auto-role-add` if needed.', 'Use `/welcome test` to preview.'],
    usefulCommands: ['/welcome manager', '/welcome setup', '/welcome auto-role-add', '/welcome test']
  },
  [ModuleKeys.REACTION_ROLES]: {
    name: 'Role Panels', category: 'Community Systems', description: 'Creates button, dropdown, or native reaction role panels with standalone roles and bundles.',
    managerCommand: '/roles manager', setupCommand: '/roles panel-wizard',
    nextSteps: ['Create a panel with `/roles panel-wizard` or `/roles create-panel`.', 'Add options with `/roles add-option`, `/roles add-bundle`, or `/roles bulk-add-wizard`.', 'Customize panel design with `/panel setup` if needed.', 'Publish with `/roles post-panel`.'],
    usefulCommands: ['/roles manager', '/roles panel-wizard', '/roles bulk-add-wizard', '/roles post-panel', '/panel setup']
  },
  [ModuleKeys.GIVEAWAYS]: {
    name: 'Giveaways', category: 'Community Systems', description: 'Runs giveaways with entry panels, winners, rerolls, and default channel settings.',
    managerCommand: '/giveaway manager', setupCommand: '/giveaway setup',
    nextSteps: ['Run `/giveaway setup` for default channel/ping settings.', 'Start a giveaway with `/giveaway start`.', 'Use `/giveaway list` to monitor active giveaways.'],
    usefulCommands: ['/giveaway manager', '/giveaway setup', '/giveaway start', '/giveaway list', '/giveaway reroll']
  },
  [ModuleKeys.BIRTHDAYS]: {
    name: 'Birthdays', category: 'Community Systems', description: 'Lets members save birthdays and supports announcements, birthday roles, and public setup panels.',
    managerCommand: '/birthday manager', setupCommand: '/birthday setup',
    nextSteps: ['Run `/birthday setup` for announcement/role settings.', 'Post a public birthday panel with `/birthday panel`.', 'Use `/birthday test` to verify announcements.'],
    usefulCommands: ['/birthday manager', '/birthday setup', '/birthday panel', '/birthday test', '/birthday list']
  },
  [ModuleKeys.LEVELING]: {
    name: 'Leveling / XP', category: 'Community Systems', description: 'Awards XP from messages, manages level roles, multiplier roles, ignored channels/roles, and public level info.',
    managerCommand: '/level manager', setupCommand: '/level setup',
    nextSteps: ['Run `/level setup` to review XP and announcement behavior.', 'Add rewards with `/level role-add` if desired.', 'Add multiplier roles with `/level multiplier-add` if desired.', 'Post member-facing info with `/level info`.'],
    usefulCommands: ['/level manager', '/level setup', '/level role-add', '/level multiplier-add', '/level info']
  },
  [ModuleKeys.SERVER_STATS]: {
    name: 'Server Stats', category: 'Community Systems', description: 'Maintains optional member/human/bot/voice count channels.',
    managerCommand: '/stats manager', setupCommand: '/stats setup',
    nextSteps: ['Configure only the counters you want with `/stats setup`.', 'Run `/stats refresh` after changes.', 'Verify SlickBot can rename the configured counter channels.'],
    usefulCommands: ['/stats manager', '/stats setup', '/stats refresh']
  },
  [ModuleKeys.CUSTOM_COMMANDS]: {
    name: 'Custom Commands', category: 'Community Systems', description: 'Allows staff-created text triggers that members can run with the configured prefix.',
    managerCommand: '/custom-command panel', setupCommand: '/custom-command create',
    nextSteps: ['Create a command with `/custom-command create`.', 'Use `/custom-command prefix` if you want a prefix other than `!`.', 'Test with `/custom-command test` before announcing.'],
    usefulCommands: ['/custom-command panel', '/custom-command create', '/custom-command edit', '/custom-command test', '/custom-command prefix']
  },
  [ModuleKeys.JOIN_TO_CREATE]: {
    name: 'Join-to-Create Voice', category: 'Community Systems', description: 'Creates temporary voice rooms when members join configured hub channels.',
    managerCommand: '/join-create panel', setupCommand: '/join-create create-hub',
    nextSteps: ['Create a hub with `/join-create create-hub` or register an existing channel with `/join-create setup`.', 'Test by joining the hub channel.', 'Use `/join-create cleanup` if stale temporary channels remain after testing.'],
    usefulCommands: ['/join-create panel', '/join-create create-hub', '/join-create setup', '/join-create list', '/join-create cleanup']
  },
  [ModuleKeys.SCHEDULED_MESSAGES]: {
    name: 'Scheduled Messages', category: 'Automation Systems', description: 'Sends one-time, daily, or weekly scheduled messages in configured channels.',
    managerCommand: '/schedule manager', setupCommand: '/schedule setup',
    nextSteps: ['Run `/schedule setup` for a default channel.', 'Create messages with `/schedule create`.', 'Use `/schedule list` to review active scheduled messages.'],
    usefulCommands: ['/schedule manager', '/schedule setup', '/schedule create', '/schedule list', '/schedule cancel']
  },
  [ModuleKeys.BOT_UPDATES]: {
    name: 'Bot Updates', category: 'Automation Systems', description: 'Announces new SlickBot versions with patch notes and optional role pings.',
    managerCommand: '/bot-updates panel', setupCommand: '/bot-updates setup',
    nextSteps: ['Run `/bot-updates setup` and set an update channel.', 'Add optional ping roles with `/bot-updates role-add`.', 'Use `/bot-updates preview` before sending.'],
    usefulCommands: ['/bot-updates panel', '/bot-updates setup', '/bot-updates role-add', '/bot-updates preview', '/bot-updates send']
  },
  [ModuleKeys.UTILITY]: {
    name: 'Utility', category: 'Coming Soon', description: 'Future utility tools module. This module is not implemented yet.',
    managerCommand: null, setupCommand: null,
    nextSteps: ['No setup is available yet.'], usefulCommands: []
  }
});

function statusMeta(state) {
  return STATUS_META[state] || STATUS_META.WARNING;
}

function moduleLabel(moduleKey) {
  return MODULE_SETUP_CATALOG[moduleKey]?.name || moduleKey;
}

function compactLine(text, maxLength = 94) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function normalizeStatusPayload(payload) {
  const meta = statusMeta(payload.state);
  return {
    ...payload,
    emoji: payload.emoji || meta.emoji,
    label: payload.label || meta.label
  };
}

function summarizeStateCounts(statuses) {
  return statuses.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});
}

function formatStateCounts(counts) {
  return `✅ ${counts.READY || 0} · 🟠 ${counts.PARTIAL || 0} · 🟣 ${counts.NEEDS_CONFIG || 0} · ⏸️ ${counts.DISABLED || 0} · ⚠️ ${counts.WARNING || 0} · ⛔ ${counts.ERROR || 0} · 🕒 ${counts.COMING_SOON || 0}`;
}

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

async function fetchModuleRows(guildId) {
  await ensureDefaultModules(guildId);
  const modules = await query(
    `SELECT module_key, enabled FROM module_configs WHERE guild_id = $1 ORDER BY module_key ASC`,
    [guildId]
  );
  return modules.rows;
}

async function getAllModuleStatuses(guildId) {
  const rows = await fetchModuleRows(guildId);
  const statuses = await Promise.all(rows.map((row) => getModuleStatus(guildId, row).catch((error) => normalizeStatusPayload({
    moduleKey: row.module_key,
    core: isCoreModule(row.module_key),
    state: 'ERROR',
    note: error instanceof Error ? compactLine(error.message, 80) : 'Status check failed'
  }))));
  return statuses;
}

function statusLine(item, includeCategory = false) {
  const catalog = MODULE_SETUP_CATALOG[item.moduleKey] || {};
  const category = includeCategory && catalog.category ? ` · ${catalog.category}` : '';
  return `${item.emoji} **${moduleLabel(item.moduleKey)}** \`${item.moduleKey}\`${item.core ? ' · Core' : ''}${category} — ${item.label}${item.note ? ` · ${item.note}` : ''}`;
}

function categorySummary(statuses, category) {
  const items = statuses.filter((item) => category.modules.includes(item.moduleKey));
  const counts = summarizeStateCounts(items);
  const needs = items.filter((item) => ['ERROR', 'NEEDS_CONFIG', 'PARTIAL', 'WARNING'].includes(item.state));
  const ready = items.filter((item) => item.state === 'READY').length;
  const disabled = items.filter((item) => item.state === 'DISABLED').length;
  const next = needs[0]
    ? `${needs[0].emoji} ${moduleLabel(needs[0].moduleKey)}: ${needs[0].note || needs[0].label}`
    : disabled > 0
      ? `${disabled} disabled`
      : 'All configured';
  return `**${category.label}** — ${ready}/${items.length} ready · ${formatStateCounts(counts)}\n${compactLine(next, 110)}`;
}

async function buildSetupPanel(guildId, guildName = null) {
  const statuses = await getAllModuleStatuses(guildId);
  const teams = await query(
    `SELECT COUNT(*)::int AS count FROM permission_teams WHERE guild_id = $1`,
    [guildId]
  ).catch(() => ({ rows: [{ count: 0 }] }));
  const configuredLogs = await query(
    `SELECT COUNT(*)::int AS count FROM log_module_settings WHERE guild_id = $1 AND enabled = true AND channel_id IS NOT NULL`,
    [guildId]
  ).catch(() => ({ rows: [{ count: 0 }] }));
  const cases = await query(
    `SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id = $1`,
    [guildId]
  ).catch(() => ({ rows: [{ count: 0 }] }));

  const counts = summarizeStateCounts(statuses);
  const needs = statuses.filter((item) => ['ERROR', 'NEEDS_CONFIG', 'PARTIAL', 'WARNING'].includes(item.state));
  const categoryLines = MODULE_CATEGORIES.map((category) => categorySummary(statuses, category));
  const priorityLines = needs.length
    ? needs.slice(0, 5).map((item) => `• ${item.emoji} **${moduleLabel(item.moduleKey)}** — ${item.note || item.label}${MODULE_SETUP_CATALOG[item.moduleKey]?.setupCommand ? ` · ${MODULE_SETUP_CATALOG[item.moduleKey].setupCommand}` : ''}`)
    : ['• ✅ No immediate setup issues detected. Use `/bot test` for deeper diagnostics.'];

  const embed = createBaseEmbed({
    title: 'SlickBot Setup Center',
    description: [
      `Server: **${guildName || 'Current Server'}**`,
      '',
      '**System Snapshot**',
      `Module Health: ${formatStateCounts(counts)}`,
      `Permission Teams: **${teams.rows[0]?.count || 0}**`,
      `Configured Log Modules: **${configuredLogs.rows[0]?.count || 0}**`,
      `Moderation Cases: **${cases.rows[0]?.count || 0}**`,
      '',
      '**Setup Categories**',
      ...categoryLines,
      '',
      '**Recommended Next Actions**',
      ...priorityLines,
      '',
      'Open **Modules** for detailed module checklists. Use `/bot test` when something looks unhealthy or after Railway deploys.'
    ].join('\n'),
    color: needs.some((item) => item.state === 'ERROR') ? SlickBotColors.ERROR : needs.length ? SlickBotColors.WARNING : SlickBotColors.PRIMARY
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
  const statuses = await getAllModuleStatuses(guildId);
  const byStatus = summarizeStateCounts(statuses);

  const categoryLines = MODULE_CATEGORIES.map((category) => {
    const items = statuses.filter((item) => category.modules.includes(item.moduleKey));
    if (!items.length) return null;
    const moduleSummary = items.map((item) => `${item.emoji} ${moduleLabel(item.moduleKey)}`).join(' · ');
    return `**${category.label}**\n${moduleSummary}`;
  }).filter(Boolean);

  const setupNeeded = statuses.filter((item) => ['ERROR', 'NEEDS_CONFIG', 'PARTIAL', 'WARNING'].includes(item.state));
  const setupLines = setupNeeded.length
    ? setupNeeded.slice(0, 8).map((item) => `• ${item.emoji} **${moduleLabel(item.moduleKey)}** — ${item.note || item.label}`)
    : ['• ✅ All enabled/implemented modules are ready or intentionally disabled.'];

  const embed = createBaseEmbed({
    title: 'SlickBot Module Manager',
    description: [
      '**Status Legend**',
      '✅ Ready · 🟠 Partially Configured · 🟣 Needs Setup · ⏸️ Disabled · ⚠️ Warning · ⛔ Error · 🕒 Coming Soon',
      '',
      `**Health Summary:** ${formatStateCounts(byStatus)}`,
      '',
      '**Module Groups**',
      ...categoryLines,
      '',
      '**Setup Needed / Review**',
      ...setupLines,
      '',
      'Use the first menu for detailed setup guidance. Use the second menu only when you intentionally want to toggle a non-core module.'
    ].join('\n'),
    color: (byStatus.ERROR || 0) > 0 ? SlickBotColors.ERROR : setupNeeded.length ? SlickBotColors.WARNING : SlickBotColors.INFO
  });

  const detailOptions = statuses.map((item) => ({
    label: moduleLabel(item.moduleKey).slice(0, 100),
    value: item.moduleKey,
    description: compactLine(`${item.label}${item.note ? ` · ${item.note}` : ''}`, 100),
    emoji: item.emoji
  }));

  const toggleOptions = statuses.map((item) => ({
    label: moduleLabel(item.moduleKey).slice(0, 100),
    value: item.moduleKey,
    description: isCoreModule(item.moduleKey)
      ? 'Core module; cannot be disabled.'
      : `${item.label}. Select to toggle on/off.`,
    emoji: item.emoji
  }));

  const detailSelect = createSelectRow(CustomIds.ModulesDetailSelect, 'View module setup details...', detailOptions.slice(0, 25));
  const toggleSelect = createSelectRow(CustomIds.ModulesSelect, 'Toggle a non-core module...', toggleOptions.slice(0, 25));
  const buttons = createButtonRow([
    createPanelButton(CustomIds.ModulesRefresh, 'Refresh Modules', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupRefresh, 'Back to Setup', ButtonStyle.Primary, '↩️')
  ]);

  return { embeds: [embed], components: [detailSelect, toggleSelect, buttons] };
}

async function buildModuleDetailPanel(guildId, moduleKey) {
  const rows = await fetchModuleRows(guildId);
  const row = rows.find((item) => item.module_key === moduleKey) || { module_key: moduleKey, enabled: false };
  const status = await getModuleStatus(guildId, row).catch((error) => normalizeStatusPayload({
    moduleKey,
    core: isCoreModule(moduleKey),
    state: 'ERROR',
    note: error instanceof Error ? compactLine(error.message, 100) : 'Status check failed'
  }));
  const catalog = MODULE_SETUP_CATALOG[moduleKey] || {
    name: moduleKey,
    category: 'Other',
    description: 'No setup guidance is registered for this module yet.',
    managerCommand: null,
    setupCommand: null,
    nextSteps: [],
    usefulCommands: []
  };

  const nextSteps = catalog.nextSteps?.length
    ? catalog.nextSteps.map((step) => `• ${step}`)
    : ['• No setup checklist is registered for this module yet.'];
  const usefulCommands = catalog.usefulCommands?.length
    ? catalog.usefulCommands.map((command) => `• ${command}`)
    : ['• No module-specific commands available.'];

  const embed = createBaseEmbed({
    title: `${status.emoji} ${catalog.name}`,
    description: [
      `Module Key: \`${moduleKey}\``,
      `Category: **${catalog.category || 'Other'}**`,
      `Status: ${status.emoji} **${status.label}**${status.note ? ` — ${status.note}` : ''}`,
      isCoreModule(moduleKey) ? 'Core Module: **Yes**' : 'Core Module: **No**',
      '',
      '**Purpose**',
      catalog.description,
      '',
      '**Recommended Setup / Review Steps**',
      ...nextSteps,
      '',
      '**Useful Commands**',
      ...usefulCommands,
      '',
      catalog.managerCommand ? `Focused panel: ${catalog.managerCommand}` : 'Focused panel: Not available yet.',
      catalog.setupCommand ? `Primary setup: ${catalog.setupCommand}` : 'Primary setup: Not available yet.'
    ].join('\n'),
    color: statusMeta(status.state).color
  });

  const buttons = createButtonRow([
    createPanelButton(CustomIds.ModulesRefresh, 'Back to Modules', ButtonStyle.Primary, '↩️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '🏠')
  ]);

  return { embeds: [embed], components: [buttons] };
}

async function getModuleStatus(guildId, row) {
  if (!isImplementedModule(row.module_key)) {
    return { moduleKey: row.module_key, core: false, state: 'COMING_SOON', emoji: '🕒', label: 'Coming Soon', note: 'Not built yet' };
  }

  if (!row.enabled) return { moduleKey: row.module_key, core: isCoreModule(row.module_key), state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Off' };

  if (row.module_key === 'LOGGING') {
    const totalRequired = LogModuleCatalog.length;
    const logs = await query(
      `SELECT COUNT(*)::int AS count
       FROM log_module_settings
       WHERE guild_id = $1 AND enabled = true AND channel_id IS NOT NULL`,
      [guildId]
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const configured = logs.rows[0]?.count || 0;
    if (configured <= 0) return { moduleKey: row.module_key, core: true, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'No log channels' };
    if (configured < totalRequired) return { moduleKey: row.module_key, core: true, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${configured}/${totalRequired} log groups` };
    return { moduleKey: row.module_key, core: true, state: 'READY', emoji: '✅', label: 'Ready', note: `${configured}/${totalRequired} log groups` };
  }

  if (isCoreModule(row.module_key)) return { moduleKey: row.module_key, core: true, state: 'READY', emoji: '✅', label: 'Ready', note: 'Core' };

  if (row.module_key === 'TICKETS') {
    const cfg = await query(`SELECT category_id, staff_role_id FROM ticket_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const types = await query(`SELECT COUNT(*)::int AS count FROM ticket_types WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    const ready = Boolean(cfg.rows[0]?.category_id) && (Boolean(cfg.rows[0]?.staff_role_id) || (types.rows[0]?.count || 0) > 0);
    return ready ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${types.rows[0]?.count || 0} type(s)` } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /ticket setup' };
  }

  if (row.module_key === 'REPORTS') {
    const cfg = await query(`SELECT review_channel_id FROM report_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    return cfg.rows[0]?.review_channel_id ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Review channel set' } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /report setup' };
  }

  if (row.module_key === 'APPLICATIONS') {
    const types = await query(`SELECT COUNT(*)::int AS count FROM application_types WHERE guild_id = $1 AND enabled = true AND review_channel_id IS NOT NULL`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    return (types.rows[0]?.count || 0) > 0 ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${types.rows[0].count} type(s)` } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /application setup' };
  }

  if (row.module_key === 'APPEALS') {
    const cfg = await query(`SELECT review_channel_id FROM appeal_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    return cfg.rows[0]?.review_channel_id ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Review channel set' } : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /appeal setup' };
  }

  if (row.module_key === 'WELCOME') {
    const [cfg, roles] = await Promise.all([
      query(`SELECT channel_id, enabled FROM welcome_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM welcome_auto_roles WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const hasChannel = Boolean(cfg.rows[0]?.channel_id && cfg.rows[0]?.enabled !== false);
    const autoRoles = roles.rows[0]?.count || 0;
    if (hasChannel && autoRoles > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Welcome + auto roles' };
    if (hasChannel || autoRoles > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: hasChannel ? 'Welcome channel set' : `${autoRoles} auto role(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /welcome setup' };
  }

  if (row.module_key === 'REACTION_ROLES') {
    const panels = await query(`SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    return (panels.rows[0]?.count || 0) > 0
      ? { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${panels.rows[0].count} panel(s)` }
      : { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /roles create-panel' };
  }


  if (row.module_key === 'GIVEAWAYS') {
    const cfg = await query(`SELECT default_channel_id, ping_role_id FROM giveaway_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const active = await query(`SELECT COUNT(*)::int AS count FROM giveaways WHERE guild_id = $1 AND status = 'OPEN'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    if (cfg.rows[0]?.default_channel_id) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${active.rows[0]?.count || 0} active` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /giveaway setup' };
  }

  if (row.module_key === 'BIRTHDAYS') {
    const [cfg, profiles] = await Promise.all([
      query(`SELECT channel_id, birthday_role_id, enabled FROM birthday_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM birthday_profiles WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const configured = Boolean(cfg.rows[0]?.channel_id || cfg.rows[0]?.birthday_role_id);
    if (configured && cfg.rows[0]?.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${profiles.rows[0]?.count || 0} birthday(s)` };
    if ((profiles.rows[0]?.count || 0) > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${profiles.rows[0]?.count || 0} birthday(s), setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /birthday setup' };
  }


  if (row.module_key === 'SCHEDULED_MESSAGES') {
    const [cfg, active] = await Promise.all([
      query(`SELECT default_channel_id, enabled FROM scheduled_message_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM scheduled_messages WHERE guild_id = $1 AND status = 'SCHEDULED'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    if (cfg.rows[0]?.default_channel_id && cfg.rows[0]?.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${active.rows[0]?.count || 0} scheduled` };
    if ((active.rows[0]?.count || 0) > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${active.rows[0]?.count || 0} scheduled, setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /schedule setup' };
  }


  if (row.module_key === 'LEVELING') {
    const [cfg, profiles, rewards] = await Promise.all([
      query(`SELECT enabled, level_up_channel_id FROM leveling_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM leveling_profiles WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM leveling_role_rewards WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0];
    if (!config) return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /level setup' };
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'XP awards off' };
    const rewardCount = rewards.rows[0]?.count || 0;
    const profileCount = profiles.rows[0]?.count || 0;
    if (config.level_up_channel_id || rewardCount > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${profileCount} profile(s)` };
    return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'XP active; no rewards/announcement' };
  }

  if (row.module_key === 'SERVER_STATS') {
    const cfg = await query(`SELECT enabled, member_channel_id, human_channel_id, bot_channel_id, voice_channel_id FROM server_stats_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const config = cfg.rows[0] || {};
    const configured = [config.member_channel_id, config.human_channel_id, config.bot_channel_id, config.voice_channel_id].filter(Boolean).length;
    if (configured > 0 && config.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${configured}/4 configured counter(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /stats setup' };
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
    if (config.channel_id && config.enabled !== false) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${roleCount} ping role(s), ${announcementCount} sent` };
    if (announcementCount > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${announcementCount} sent, setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /bot-updates setup' };
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
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Listener off' };
    if (active > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${active}/${total} command(s)` };
    if (total > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${total} disabled command(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /custom-command create' };
  }


  if (row.module_key === 'JOIN_TO_CREATE') {
    const [hubs, active] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM join_create_hubs WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM join_create_temp_channels WHERE guild_id = $1 AND status = 'ACTIVE'`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const hubCount = hubs.rows[0]?.count || 0;
    const activeCount = active.rows[0]?.count || 0;
    if (hubCount > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${hubCount} hub(s), ${activeCount} active` };
    if (activeCount > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${activeCount} active, setup needed` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /join-create setup' };
  }

  return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Module shell only' };
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
  return String(value).length > 320 ? `${String(value).slice(0, 317)}...` : String(value);
}

async function buildCommunityPanel(guildId) {
  const welcomePayload = await buildWelcomePanel(guildId);
  const rolePayload = await buildRoleManagerPanel(guildId);
  const giveawayPayload = await giveaways.buildManagerPanel(guildId);
  const birthdayPayload = await birthdays.buildManagerPanel(guildId);
  const statsPayload = await serverStats.buildManagerPanel({ id: guildId, memberCount: 0, members: { fetch: async () => null, cache: { size: 0, filter: () => ({ size: 0 }) } }, channels: { cache: { filter: () => ({ reduce: () => 0 }) } } }).catch(() => ({ embeds: [{ data: { description: 'Server stats not configured.' } }] }));
  const levelingPayload = await leveling.buildManagerPanel(guildId).catch(() => ({ embeds: [{ data: { description: 'Leveling not configured.' } }] }));
  const customPayload = await customCommands.buildManagerPanel(guildId).catch(() => ({ embeds: [{ data: { description: 'Custom commands not configured.' } }] }));
  const joinCreatePayload = await joinCreate.buildManagerPanel({ id: guildId }).catch(() => ({ embeds: [{ data: { description: 'Join-to-create not configured.' } }] }));
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
      compactCommunityText(customPayload, 'No custom command status available.'),
      '',
      '**Join-to-Create Voice**',
      compactCommunityText(joinCreatePayload, 'No join-to-create status available.'),
      '',
      'Use the focused module panel commands for detailed setup. Newer modules may use `/custom-command panel` or `/join-create panel` instead of `manager`.'
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
    createPanelButton(CustomIds.CustomCommandsRefresh, 'Custom Commands', ButtonStyle.Secondary, '💬'),
    createPanelButton(CustomIds.JoinCreateRefresh, 'Join Voice', ButtonStyle.Secondary, '🔊'),
    createPanelButton(CustomIds.SetupRefresh, 'Back', ButtonStyle.Primary, '↩️')
  ]);
  return { embeds: [embed], components: [rowOne, rowTwo] };
}

module.exports = {
  ensureDefaultModules,
  buildSetupPanel,
  buildModulesPanel,
  buildModuleDetailPanel,
  buildLoggingPanel,
  buildTeamsPanel,
  buildPermissionsPanel,
  buildCommunityPanel,
  getModuleStatus
};
