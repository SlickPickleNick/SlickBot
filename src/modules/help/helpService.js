const { ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { ModuleKeys, implementedModules } = require('../moduleRegistry');
const { ActionKeys, PermissionLevels, permissionLevelRank } = require('../permissions/actionKeys');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  createSelectRow,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');
const { query } = require('../../services/db');

const MODULE_LABELS = Object.freeze({
  [ModuleKeys.PERMISSIONS]: 'Permissions & Setup',
  [ModuleKeys.LOGGING]: 'Logging',
  [ModuleKeys.STATUS]: 'Bot Status',
  [ModuleKeys.MODERATION]: 'Moderation',
  [ModuleKeys.TICKETS]: 'Tickets',
  [ModuleKeys.REPORTS]: 'Reports',
  [ModuleKeys.APPLICATIONS]: 'Applications',
  [ModuleKeys.APPEALS]: 'Appeals',
  [ModuleKeys.SCHEDULED_MESSAGES]: 'Scheduled Messages',
  [ModuleKeys.WELCOME]: 'Welcome & Auto Roles',
  [ModuleKeys.REACTION_ROLES]: 'Role Panels',
  [ModuleKeys.GIVEAWAYS]: 'Giveaways',
  [ModuleKeys.BIRTHDAYS]: 'Birthdays',
  [ModuleKeys.LEVELING]: 'Leveling',
  [ModuleKeys.COMMUNITY_GAMES]: 'Community Games',
  [ModuleKeys.FAQ]: 'Knowledge Base / FAQ',
  [ModuleKeys.SERVER_STATS]: 'Server Stats',
  [ModuleKeys.BOT_UPDATES]: 'Bot Updates',
  [ModuleKeys.CUSTOM_COMMANDS]: 'Custom Commands',
  [ModuleKeys.JOIN_TO_CREATE]: 'Join-to-Create Voice'
});

const HELP_CATALOG = Object.freeze([
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.BotPing, command: '/ping', description: 'Check whether SlickBot is online.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.Help, command: '/help', description: 'Open the interactive SlickBot help menu.' },
  { moduleKey: ModuleKeys.STATUS, actionKey: ActionKeys.BotVersion, command: '/bot version', description: 'Show the running SlickBot version.' },
  { moduleKey: ModuleKeys.STATUS, actionKey: ActionKeys.BotTest, command: '/bot test', description: 'Run diagnostics for SlickBot modules and setup.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.Setup, command: '/setup', description: 'Open the main setup center.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.ModulesManage, command: '/modules panel', description: 'Open the module manager.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.ModulesManage, command: '/modules enable|disable', description: 'Enable or disable non-core modules.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.PermissionsPanel, command: '/permissions panel', description: 'Open the permission center.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.PermissionsManage, command: '/permissions apply-defaults', description: 'Reapply the current default permission map.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.PermissionsManage, command: '/permissions command-level', description: 'Set required permission levels for actions.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.PermissionsManage, command: '/permissions module-level', description: 'Set required permission levels for modules.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.PermissionsIgnore, command: '/permissions ignore-add|ignore-remove|ignore-list', description: 'Manage users blocked from SlickBot interactions.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.TeamsManage, command: '/team create|add-role|remove-role|allow|delete|list', description: 'Manage SlickBot permission teams.' },
  { moduleKey: ModuleKeys.PERMISSIONS, actionKey: ActionKeys.ServerReset, command: '/reset', description: 'Reset SlickBot data for this server.' },

  { moduleKey: ModuleKeys.LOGGING, actionKey: ActionKeys.LoggingView, command: '/logging panel', description: 'Open the logging center.' },
  { moduleKey: ModuleKeys.LOGGING, actionKey: ActionKeys.LoggingConfigure, command: '/logging set-channel|clear-channel', description: 'Configure log module channels.' },
  { moduleKey: ModuleKeys.LOGGING, actionKey: ActionKeys.LoggingConfigure, command: '/logging module-mode|event-mode|event-channel', description: 'Configure instant log delivery or event channel overrides.' },
  { moduleKey: ModuleKeys.LOGGING, actionKey: ActionKeys.LoggingConfigure, command: '/logging test', description: 'Send a test log to verify the configured route.' },

  { moduleKey: ModuleKeys.STATUS, actionKey: ActionKeys.StatusView, command: '/status view', description: 'View the current bot presence.' },
  { moduleKey: ModuleKeys.STATUS, actionKey: ActionKeys.StatusManage, command: '/status set|stream-url|clear', description: 'Configure bot presence text/status.' },

  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationPanel, command: '/mod panel', description: 'Open the moderation panel.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationWarn, command: '/mod warn', description: 'Warn a member and create a case.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationTimeout, command: '/mod timeout', description: 'Timeout a member.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationUntimeout, command: '/mod untimeout', description: 'Remove a timeout.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationKick, command: '/mod kick', description: 'Kick a member.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationBan, command: '/mod ban', description: 'Ban a member.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationUnban, command: '/mod unban', description: 'Unban by user ID.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.ModerationMassBan, command: '/mod massban', description: 'Ban multiple user IDs.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.CasesView, command: '/case panel|view|user', description: 'View cases.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.CasesManage, command: '/case close|reopen', description: 'Close or reopen moderation cases.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.UserNotesView, command: '/note list', description: 'View user notes.' },
  { moduleKey: ModuleKeys.MODERATION, actionKey: ActionKeys.UserNotesManage, command: '/note add|remove', description: 'Manage user notes.' },

  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsOpen, command: '/ticket open', description: 'Open a support ticket.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsPanel, command: '/ticket manager', description: 'Open the ticket manager.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsConfigure, command: '/ticket setup|type-setup|question-add|question-clear|type-delete', description: 'Configure ticket categories, teams, and questions.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsPostPanel, command: '/ticket panel', description: 'Post a public ticket panel.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsReview, command: '/ticket review-index', description: 'Post or refresh the staff ticket review index.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsClaim, command: '/ticket claim', description: 'Claim the current ticket.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsManage, command: '/ticket priority|escalate|add-user|remove-user', description: 'Manage a ticket channel.' },
  { moduleKey: ModuleKeys.TICKETS, actionKey: ActionKeys.TicketsClose, command: '/ticket close', description: 'Close a ticket with transcript handling.' },

  { moduleKey: ModuleKeys.REPORTS, actionKey: ActionKeys.ReportsSubmit, command: '/report user|message', description: 'Submit a private report to staff.' },
  { moduleKey: ModuleKeys.REPORTS, actionKey: ActionKeys.ReportsPanel, command: '/report manager', description: 'Open the report manager.' },
  { moduleKey: ModuleKeys.REPORTS, actionKey: ActionKeys.ReportsConfigure, command: '/report setup', description: 'Configure report review settings.' },
  { moduleKey: ModuleKeys.REPORTS, actionKey: ActionKeys.ReportsPostPanel, command: '/report panel', description: 'Post the public report panel.' },
  { moduleKey: ModuleKeys.REPORTS, actionKey: ActionKeys.ReportsReview, command: '/report review-index', description: 'Post or refresh the report review index.' },

  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsApply, command: '/application apply', description: 'Start an application through DM.' },
  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsPanel, command: '/application manager', description: 'Open the application manager.' },
  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsConfigure, command: '/application setup|question-add|question-list|question-clear|close|reopen|delete', description: 'Configure custom application types/questions.' },
  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsPostPanel, command: '/application panel', description: 'Post a public application panel.' },
  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsReview, command: '/application review-index and review buttons', description: 'Post review indexes, open review threads, and inspect submissions.' },
  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsApprove, command: 'Approve application', description: 'Approve an application with a reason.' },
  { moduleKey: ModuleKeys.APPLICATIONS, actionKey: ActionKeys.ApplicationsDeny, command: 'Deny application', description: 'Deny an application with a reason.' },

  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsSubmit, command: '/appeal submit', description: 'Submit an appeal.' },
  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsPanel, command: '/appeal manager', description: 'Open the appeal manager.' },
  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsConfigure, command: '/appeal setup|edit', description: 'Configure or update appeal settings.' },
  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsPostPanel, command: '/appeal panel', description: 'Post a public appeal panel.' },
  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsReview, command: '/appeal review-index', description: 'Post or refresh the appeal review index.' },
  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsApprove, command: 'Approve appeal', description: 'Approve an appeal with a reason.' },
  { moduleKey: ModuleKeys.APPEALS, actionKey: ActionKeys.AppealsDeny, command: 'Deny appeal', description: 'Deny an appeal with a reason.' },

  { moduleKey: ModuleKeys.WELCOME, actionKey: ActionKeys.WelcomeView, command: '/welcome manager', description: 'Open the welcome manager.' },
  { moduleKey: ModuleKeys.WELCOME, actionKey: ActionKeys.WelcomeConfigure, command: '/welcome setup|auto-role-add|auto-role-remove', description: 'Configure welcome messages and auto roles.' },
  { moduleKey: ModuleKeys.WELCOME, actionKey: ActionKeys.WelcomeTest, command: '/welcome test', description: 'Send a welcome test.' },

  { moduleKey: ModuleKeys.REACTION_ROLES, actionKey: ActionKeys.RolePanelsUse, command: 'Role panel controls', description: 'Use public button/dropdown/reaction role panels.' },
  { moduleKey: ModuleKeys.REACTION_ROLES, actionKey: ActionKeys.RolePanelsView, command: '/roles manager|list', description: 'View role panel configuration.' },
  { moduleKey: ModuleKeys.REACTION_ROLES, actionKey: ActionKeys.RolePanelsConfigure, command: '/roles create-panel|add-option|add-bundle|bulk-add|remove-option', description: 'Configure role panels and bundles.' },
  { moduleKey: ModuleKeys.REACTION_ROLES, actionKey: ActionKeys.RolePanelsPost, command: '/roles post-panel', description: 'Post a role panel.' },

  { moduleKey: ModuleKeys.GIVEAWAYS, actionKey: ActionKeys.GiveawaysEnter, command: 'Giveaway entry button', description: 'Enter active giveaways.' },
  { moduleKey: ModuleKeys.GIVEAWAYS, actionKey: ActionKeys.GiveawaysView, command: '/giveaway manager|list', description: 'View giveaway status.' },
  { moduleKey: ModuleKeys.GIVEAWAYS, actionKey: ActionKeys.GiveawaysConfigure, command: '/giveaway setup', description: 'Configure giveaway defaults.' },
  { moduleKey: ModuleKeys.GIVEAWAYS, actionKey: ActionKeys.GiveawaysCreate, command: '/giveaway start', description: 'Start a giveaway.' },
  { moduleKey: ModuleKeys.GIVEAWAYS, actionKey: ActionKeys.GiveawaysEnd, command: '/giveaway end', description: 'End a giveaway.' },
  { moduleKey: ModuleKeys.GIVEAWAYS, actionKey: ActionKeys.GiveawaysReroll, command: '/giveaway reroll', description: 'Reroll giveaway winners.' },

  { moduleKey: ModuleKeys.BIRTHDAYS, actionKey: ActionKeys.BirthdaysUse, command: '/birthday set|view|remove', description: 'Manage your birthday profile.' },
  { moduleKey: ModuleKeys.BIRTHDAYS, actionKey: ActionKeys.BirthdaysView, command: '/birthday manager|list', description: 'View birthday module details.' },
  { moduleKey: ModuleKeys.BIRTHDAYS, actionKey: ActionKeys.BirthdaysConfigure, command: '/birthday setup|test', description: 'Configure and test birthday announcements.' },

  { moduleKey: ModuleKeys.LEVELING, actionKey: ActionKeys.LevelingUse, command: '/level rank|leaderboard|info', description: 'View XP, ranks, leaderboard, and server XP rules.' },
  { moduleKey: ModuleKeys.LEVELING, actionKey: ActionKeys.LevelingView, command: '/level manager|multiplier-list|analyze', description: 'View leveling configuration and XP analysis.' },
  { moduleKey: ModuleKeys.LEVELING, actionKey: ActionKeys.LevelingConfigure, command: '/level setup|role-add|role-remove|multiplier-add|ignored-channel-add', description: 'Configure XP, rewards, multipliers, and ignored targets.' },
  { moduleKey: ModuleKeys.LEVELING, actionKey: ActionKeys.LevelingAdjust, command: '/level set-xp|reset', description: 'Adjust or reset user XP.' },

  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesPlay, command: '/games counting leaderboard', description: 'View the counting contribution leaderboard.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesPlay, command: '/games tic-tac-toe challenge|stats', description: 'Challenge a member to Tic-Tac-Toe or view player statistics.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesPlay, command: '/games connect-four challenge|stats', description: 'Challenge a member to Connect Four or view player statistics.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesView, command: '/games manager and /games counting status', description: 'Review all Community Games configuration and counting state.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesConfigure, command: '/games panel post|edit|refresh', description: 'Post or update a public launcher panel for available Community Games.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesConfigure, command: '/games counting setup|enable|disable|reset|set-number', description: 'Configure Counting rules, reactions, failure embeds, and staff controls.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesConfigure, command: '/games tic-tac-toe setup|enable|disable', description: 'Configure or toggle Tic-Tac-Toe, including win XP.' },
  { moduleKey: ModuleKeys.COMMUNITY_GAMES, actionKey: ActionKeys.GamesConfigure, command: '/games connect-four setup|enable|disable', description: 'Configure or toggle Connect Four, including win XP.' },

  { moduleKey: ModuleKeys.FAQ, actionKey: ActionKeys.FaqAnswer, command: '/faq answer', description: 'Send a linked FAQ response to a member or message.' },
  { moduleKey: ModuleKeys.FAQ, actionKey: ActionKeys.FaqAnswer, command: 'FAQ Reply message command', description: 'Right-click a message and use Apps → FAQ Reply for a direct FAQ response.' },
  { moduleKey: ModuleKeys.FAQ, actionKey: ActionKeys.FaqView, command: '/faq status|panel', description: 'View Knowledge Base / FAQ setup status.' },
  { moduleKey: ModuleKeys.FAQ, actionKey: ActionKeys.FaqConfigure, command: '/faq setup|edit|refresh', description: 'Configure the FAQ forum and refresh the master index post.' },

  { moduleKey: ModuleKeys.SCHEDULED_MESSAGES, actionKey: ActionKeys.ScheduledMessagesView, command: '/schedule manager|list', description: 'View scheduled messages.' },
  { moduleKey: ModuleKeys.SCHEDULED_MESSAGES, actionKey: ActionKeys.ScheduledMessagesConfigure, command: '/schedule setup', description: 'Configure schedule defaults.' },
  { moduleKey: ModuleKeys.SCHEDULED_MESSAGES, actionKey: ActionKeys.ScheduledMessagesCreate, command: '/schedule create', description: 'Create a scheduled message.' },
  { moduleKey: ModuleKeys.SCHEDULED_MESSAGES, actionKey: ActionKeys.ScheduledMessagesCancel, command: '/schedule cancel', description: 'Cancel a scheduled message.' },
  { moduleKey: ModuleKeys.SCHEDULED_MESSAGES, actionKey: ActionKeys.ScheduledMessagesSendNow, command: '/schedule send-now', description: 'Send a scheduled message immediately.' },

  { moduleKey: ModuleKeys.SERVER_STATS, actionKey: ActionKeys.ServerStatsView, command: '/stats manager', description: 'View server stat counter setup.' },
  { moduleKey: ModuleKeys.SERVER_STATS, actionKey: ActionKeys.ServerStatsConfigure, command: '/stats setup', description: 'Configure server stat counter channels/templates.' },
  { moduleKey: ModuleKeys.SERVER_STATS, actionKey: ActionKeys.ServerStatsRefresh, command: '/stats refresh', description: 'Refresh stat counter channels.' },

  { moduleKey: ModuleKeys.BOT_UPDATES, actionKey: ActionKeys.BotUpdatesView, command: '/bot-updates panel|roles|preview', description: 'View bot update announcement settings.' },
  { moduleKey: ModuleKeys.BOT_UPDATES, actionKey: ActionKeys.BotUpdatesConfigure, command: '/bot-updates setup|channel|role-add|role-remove|enable|disable', description: 'Configure bot update announcements.' },
  { moduleKey: ModuleKeys.BOT_UPDATES, actionKey: ActionKeys.BotUpdatesSend, command: '/bot-updates send', description: 'Manually send update patch notes.' },

  { moduleKey: ModuleKeys.CUSTOM_COMMANDS, actionKey: ActionKeys.CustomCommandsUse, command: '!custom-command', description: 'Run enabled custom commands using the configured prefix.' },
  { moduleKey: ModuleKeys.CUSTOM_COMMANDS, actionKey: ActionKeys.CustomCommandsView, command: '/custom-command panel|list|view', description: 'View custom commands.' },
  { moduleKey: ModuleKeys.CUSTOM_COMMANDS, actionKey: ActionKeys.CustomCommandsCreate, command: '/custom-command create', description: 'Create a custom command.' },
  { moduleKey: ModuleKeys.CUSTOM_COMMANDS, actionKey: ActionKeys.CustomCommandsEdit, command: '/custom-command edit', description: 'Edit a custom command.' },
  { moduleKey: ModuleKeys.CUSTOM_COMMANDS, actionKey: ActionKeys.CustomCommandsDelete, command: '/custom-command delete', description: 'Delete a custom command.' },
  { moduleKey: ModuleKeys.CUSTOM_COMMANDS, actionKey: ActionKeys.CustomCommandsEnable, command: '/custom-command enable|disable|prefix', description: 'Enable, disable, or change custom-command behavior.' },

  { moduleKey: ModuleKeys.JOIN_TO_CREATE, actionKey: ActionKeys.TempVoiceManage, command: 'Temporary voice control panel', description: 'Manage your temporary voice channel with buttons and selectors.' },
  { moduleKey: ModuleKeys.JOIN_TO_CREATE, actionKey: ActionKeys.JoinCreateView, command: '/join-create panel|list|view', description: 'View join-to-create configuration.' },
  { moduleKey: ModuleKeys.JOIN_TO_CREATE, actionKey: ActionKeys.JoinCreateSetup, command: '/join-create setup|create-hub', description: 'Configure join-to-create hubs.' },
  { moduleKey: ModuleKeys.JOIN_TO_CREATE, actionKey: ActionKeys.JoinCreateEdit, command: '/join-create enable|disable|rename|limit|lock|unlock|permit|remove|transfer|claim', description: 'Manage hubs or temporary voice channels.' },
  { moduleKey: ModuleKeys.JOIN_TO_CREATE, actionKey: ActionKeys.JoinCreateDelete, command: '/join-create delete', description: 'Delete a join-to-create hub.' },
  { moduleKey: ModuleKeys.JOIN_TO_CREATE, actionKey: ActionKeys.JoinCreateCleanup, command: '/join-create cleanup', description: 'Clean up tracked temporary channels.' },

  { moduleKey: ModuleKeys.PANELS || ModuleKeys.PERMISSIONS, actionKey: ActionKeys.PanelsConfigure, command: '/panel setup|edit|delete|design|help', description: 'Configure shared panel design and live panel posts.' }
]);

function moduleLabel(moduleKey) {
  return MODULE_LABELS[moduleKey] || moduleKey;
}

function accessSection(level) {
  if (level === PermissionLevels.EVERYONE) return 'Member Commands';
  if (level === PermissionLevels.OWNER) return 'Owner / Admin Commands';
  return 'Staff Commands';
}

function shortCommandText(item) {
  return `• \`${item.command}\` — ${item.description}`;
}

async function getModuleRows(guildId) {
  for (const moduleKey of implementedModules) {
    await query(
      `INSERT INTO module_configs (guild_id, module_key, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (guild_id, module_key) DO NOTHING`,
      [guildId, moduleKey]
    ).catch(() => {});
  }
  const result = await query(`SELECT module_key, enabled FROM module_configs WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [] }));
  return new Map(result.rows.map((row) => [row.module_key, Boolean(row.enabled)]));
}

async function buildVisibleCatalog(interaction, ctx, mode = 'enabled') {
  await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
  const moduleRows = await getModuleRows(interaction.guildId);
  const roleIds = ctx.permissions.getInteractionRoleIds(interaction);
  const userLevel = await ctx.permissions.getUserPermissionLevel(interaction, roleIds);
  const visible = [];
  const moduleAccessCache = new Map();

  for (const item of HELP_CATALOG) {
    const moduleEnabled = item.moduleKey === ModuleKeys.PERMISSIONS || item.moduleKey === ModuleKeys.LOGGING || item.moduleKey === ModuleKeys.STATUS
      ? true
      : moduleRows.get(item.moduleKey) !== false;

    if (mode === 'enabled' && !moduleEnabled) continue;
    if (mode === 'disabled' && moduleEnabled) continue;

    if (!moduleAccessCache.has(item.moduleKey)) {
      moduleAccessCache.set(item.moduleKey, await ctx.permissions.hasModuleTargetAccess(interaction, item.moduleKey, roleIds).catch(() => ({ locked: false, allowed: true })));
    }
    const moduleAccess = moduleAccessCache.get(item.moduleKey);
    if (moduleAccess.locked && !moduleAccess.allowed) continue;

    const publicSetting = await ctx.permissions.getPublicActionSetting(interaction.guildId, item.actionKey).catch(() => null);
    const required = publicSetting === true
      ? PermissionLevels.EVERYONE
      : await ctx.permissions.getRequiredLevel(interaction.guildId, item.actionKey, item.moduleKey).catch(() => PermissionLevels.SENIOR_MODERATOR);
    const allowed = publicSetting === true || (permissionLevelRank[userLevel] || 0) >= (permissionLevelRank[required] || 0);
    if (!allowed) continue;
    visible.push({ ...item, required, moduleEnabled });
  }

  return { visible, userLevel, moduleRows };
}

function buildModeButtons(mode) {
  return createButtonRow([
    createPanelButton(CustomIds.HelpEnabled, 'Enabled Modules', mode === 'enabled' ? ButtonStyle.Primary : ButtonStyle.Secondary, '🟢'),
    createPanelButton(CustomIds.HelpDisabled, 'Disabled Modules', mode === 'disabled' ? ButtonStyle.Primary : ButtonStyle.Secondary, '🔴'),
    createPanelButton(CustomIds.HelpRefresh, 'Refresh', ButtonStyle.Secondary, '🔄')
  ]);
}

function moduleSummaryLines(visible) {
  const byModule = new Map();
  for (const item of visible) {
    if (!byModule.has(item.moduleKey)) byModule.set(item.moduleKey, []);
    byModule.get(item.moduleKey).push(item);
  }
  return Array.from(byModule.entries())
    .sort((a, b) => moduleLabel(a[0]).localeCompare(moduleLabel(b[0])))
    .map(([moduleKey, items]) => `• **${moduleLabel(moduleKey)}** \`${moduleKey}\` — ${items.length} visible item(s)`);
}

function buildModuleOptions(visible, mode) {
  const moduleKeys = Array.from(new Set(visible.map((item) => item.moduleKey)))
    .sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b)))
    .slice(0, 25);
  return moduleKeys.map((moduleKey) => ({
    label: moduleLabel(moduleKey).slice(0, 100),
    value: moduleKey,
    description: `${mode === 'disabled' ? 'Disabled module. ' : ''}${visible.filter((item) => item.moduleKey === moduleKey).length} visible command/control item(s).`.slice(0, 100)
  }));
}

function trimLines(lines, maxLength = 3300) {
  const output = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > maxLength) {
      output.push('• Additional commands are hidden to keep this panel readable. Use a module page for details.');
      break;
    }
    output.push(line);
    length += line.length + 1;
  }
  return output;
}

async function buildHelpPayload(interaction, ctx, options = {}) {
  const mode = options.mode === 'disabled' ? 'disabled' : 'enabled';
  const selectedModule = options.moduleKey || null;
  const { visible, userLevel } = await buildVisibleCatalog(interaction, ctx, mode);

  const title = selectedModule
    ? `${moduleLabel(selectedModule)} Help`
    : 'SlickBot Help Center';
  const moduleItems = selectedModule ? visible.filter((item) => item.moduleKey === selectedModule) : [];

  let description;
  if (selectedModule) {
    const grouped = {
      'Member Commands': [],
      'Staff Commands': [],
      'Owner / Admin Commands': []
    };
    for (const item of moduleItems) grouped[accessSection(item.required)].push(shortCommandText(item));

    const sections = Object.entries(grouped)
      .filter(([, lines]) => lines.length)
      .flatMap(([section, lines]) => [`**${section}**`, ...trimLines(lines, 1200), '']);

    description = [
      `Your SlickBot permission level: **${userLevel}**`,
      mode === 'disabled' ? '**Viewing disabled modules.** Commands shown here will not run until the module is enabled.' : '**Viewing enabled modules.**',
      '',
      sections.length ? sections.join('\n').trim() : 'No commands from this module are available to your current permission level.'
    ].join('\n');
  } else {
    const lines = moduleSummaryLines(visible);
    description = [
      `Your SlickBot permission level: **${userLevel}**`,
      mode === 'disabled'
        ? 'Showing disabled modules with commands that would be available to your permission level after the module is enabled.'
        : 'Showing enabled modules and command groups available to your permission level.',
      '',
      '**Modules**',
      ...(lines.length ? trimLines(lines) : ['No modules matched this view for your current permission level.']),
      '',
      'Use the menu below to open a focused help page for one module.'
    ].join('\n');
  }

  const embed = createBaseEmbed({
    title,
    description,
    color: mode === 'disabled' ? SlickBotColors.MUTED : SlickBotColors.INFO,
    footer: 'SlickBot Help • Commands are filtered by module state and permission level.'
  });

  const components = [];
  const optionsForSelect = buildModuleOptions(visible, mode);
  if (optionsForSelect.length) {
    components.push(createSelectRow(mode === 'disabled' ? CustomIds.HelpDisabledSelect : CustomIds.HelpEnabledSelect, 'Choose a module...', optionsForSelect));
  }
  components.push(buildModeButtons(mode));

  return { embeds: [embed], components };
}

module.exports = {
  HELP_CATALOG,
  buildHelpPayload,
  moduleLabel
};
