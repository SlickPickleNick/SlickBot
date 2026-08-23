const { ActionRowBuilder, RoleSelectMenuBuilder } = require('discord.js');
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
const { CommunityGameService } = require('../community/gameService');
const { FaqService } = require('../community/faqService');
const { SuggestionService } = require('../community/suggestionService');
const { ReferralService } = require('../community/referralService');
const { TemporaryRoleService } = require('../moderation/tempRoleService');
const { AchievementService } = require('../community/achievementService');
const { LockdownService } = require('../safety/lockdownService');
const giveaways = new GiveawayService();
const birthdays = new BirthdayService();
const scheduledMessages = new ScheduledMessageService();
const serverStats = new ServerStatsService();
const leveling = new LevelingService();
const customCommands = new CustomCommandService();
const joinCreate = new JoinCreateService();
const communityGames = new CommunityGameService();
const faq = new FaqService();
const suggestions = new SuggestionService();
const referrals = new ReferralService();
const tempRoles = new TemporaryRoleService();
const achievements = new AchievementService();
const lockdown = new LockdownService();

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
  { key: 'CORE', label: 'Core Setup', modules: [ModuleKeys.PERMISSIONS, ModuleKeys.LOGGING, ModuleKeys.STATUS, ModuleKeys.MODERATION, ModuleKeys.LOCKDOWN, ModuleKeys.AUTOMOD, ModuleKeys.TEMP_ROLES, ModuleKeys.UTILITY] },
  { key: 'SUPPORT', label: 'Support Systems', modules: [ModuleKeys.TICKETS, ModuleKeys.REPORTS, ModuleKeys.APPLICATIONS, ModuleKeys.APPEALS] },
  { key: 'COMMUNITY', label: 'Community Systems', modules: [ModuleKeys.WELCOME, ModuleKeys.REACTION_ROLES, ModuleKeys.GIVEAWAYS, ModuleKeys.BIRTHDAYS, ModuleKeys.LEVELING, ModuleKeys.COMMUNITY_GAMES, ModuleKeys.FAQ, ModuleKeys.SUGGESTIONS, ModuleKeys.REFERRALS, ModuleKeys.ACHIEVEMENTS, ModuleKeys.SERVER_STATS, ModuleKeys.CUSTOM_COMMANDS, ModuleKeys.JOIN_TO_CREATE] },
  { key: 'AUTOMATION', label: 'Automation Systems', modules: [ModuleKeys.SCHEDULED_MESSAGES, ModuleKeys.BOT_UPDATES, ModuleKeys.SOCIAL_FEEDS] },
  { key: 'BACKLOG', label: 'Coming Soon', modules: [] }
]);

const MODULE_SETUP_CATALOG = Object.freeze({
  [ModuleKeys.PERMISSIONS]: {
    name: 'Permissions', category: 'Core Setup', description: 'Controls SlickBot command access, permission levels, teams, public actions, and ignored users.',
    managerCommand: '/permissions manager', setupCommand: '/permissions setup',
    nextSteps: ['Run `/permissions setup` to configure admin and mod roles.', 'Use `/team create` and `/team add-role` for staff permission groups.', 'Use `/permissions manager` to review module and command locks.'],
    usefulCommands: ['/permissions manager', '/permissions setup', '/permissions apply-defaults', '/team create', '/team add-role', '/team allow']
  },
  [ModuleKeys.LOGGING]: {
    name: 'Logging', category: 'Core Setup', description: 'Routes SlickBot event logs to configured channels by log module or individual event override.',
    managerCommand: '/logging manager', setupCommand: '/logging setup',
    nextSteps: ['Set starter log channels with `/logging setup`.', 'Open `/logging manager` to customize event routes and delivery modes.', 'Use `/logging test` to verify delivery.'],
    usefulCommands: ['/logging manager', '/logging setup', '/logging set-channel', '/logging test']
  },
  [ModuleKeys.STATUS]: {
    name: 'Bot Status', category: 'Core Setup', description: 'Controls SlickBot presence, activity text, diagnostics, version checks, and bot-level tools.',
    managerCommand: '/status manager', setupCommand: '/status set',
    nextSteps: ['Use `/status manager` to toggle online status and activities.', 'Use `/bot version` after Railway deploys.', 'Use `/status stream-url` to save a URL for the Streaming quick button.'],
    usefulCommands: ['/status manager', '/status set', '/status stream-url', '/status clear', '/bot version', '/bot test']
  },
  [ModuleKeys.MODERATION]: {
    name: 'Moderation', category: 'Core Setup', description: 'Provides moderation actions, cases, and user notes.',
    managerCommand: '/mod manager', setupCommand: '/logging setup',
    nextSteps: ['Configure moderation/case log channels with `/logging setup`.', 'Review staff access with `/permissions manager`.', 'Use `/case panel` to review recent cases.'],
    usefulCommands: ['/mod manager', '/mod warn', '/mod timeout', '/case panel', '/note add']
  },
  [ModuleKeys.LOCKDOWN]: {
    name: 'Lockdown / Safety', category: 'Core Setup', description: 'Runs emergency lockdown presets that snapshot and restore @everyone channel overwrites for configured text and voice channels.',
    managerCommand: '/lockdown manager', setupCommand: '/lockdown setup',
    nextSteps: ['Create a preset with `/lockdown setup`.', 'Add controlled channels with `/lockdown channel-add`.', 'Review configured channels with `/lockdown channel-list`.', 'Start and end lockdowns with `/lockdown start` and `/lockdown end`.'],
    usefulCommands: ['/lockdown manager', '/lockdown setup', '/lockdown channel-add', '/lockdown start', '/lockdown end', '/lockdown reset']
  },
  [ModuleKeys.TEMP_ROLES]: {
    name: 'Temporary Roles', category: 'Core Setup', description: 'Lets moderators assign roles to members for a fixed duration and automatically removes them when they expire.',
    managerCommand: '/temp-role manager', setupCommand: '/temp-role add',
    nextSteps: ['Use `/temp-role add` to assign a temporary role.', 'Use `/temp-role manager` or `/temp-role list` to review active assignments.', 'Use `/temp-role remove` to end an assignment early.'],
    usefulCommands: ['/temp-role manager', '/temp-role add', '/temp-role remove', '/temp-role list']
  },
  [ModuleKeys.UTILITY]: {
    name: 'Utility & Tools', category: 'Core Setup', description: 'Essential server tools: message purge, custom embeds, interactive polls, timed reminders, AFK status, and media quick-lookup.',
    managerCommand: '/utility manager', setupCommand: '/utility manager',
    nextSteps: ['Open `/utility manager` to toggle tools.', 'Use `/poll create` or `/embed create` for rich interactive posts.', 'Use `/reminder set` or `/afk set` for personal workflows.'],
    usefulCommands: ['/utility manager', '/purge', '/embed create', '/poll create', '/reminder set', '/afk set']
  },
  [ModuleKeys.AUTOMOD]: {
    name: 'Auto-Mod & Anti-Raid', category: 'Core Setup', description: 'Automated protection against phishing links, invites, spam, duplicate messages, mentions, and join raids with dedicated timeout role support.',
    managerCommand: '/automod manager', setupCommand: '/automod setup',
    nextSteps: ['Run `/automod setup` to choose a 1-click protection preset.', 'Configure the @Timeout role with `/automod manager` -> Timeout Role.', 'Set the emergency raid alert channel in `/automod manager` -> Anti-Raid.'],
    usefulCommands: ['/automod manager', '/automod setup', '/automod rule', '/automod raid', '/automod reset']
  },
  [ModuleKeys.TICKETS]: {
    name: 'Tickets', category: 'Support Systems', description: 'Creates private support channels with ticket types, questions, staff assignment, escalation, transcripts, and panels.',
    managerCommand: '/ticket manager', setupCommand: '/ticket setup',
    nextSteps: ['Run `/ticket setup` for category, log channel, and staff/escalation teams.', 'Create ticket types with `/ticket type-setup`.', 'Add questions with `/ticket question-add` if needed.', 'Post the public panel with `/ticket panel`.', 'Post a staff review index with `/ticket review-index`.'],
    usefulCommands: ['/ticket manager', '/ticket setup', '/ticket type-setup', '/ticket question-add', '/ticket panel', '/ticket review-index']
  },
  [ModuleKeys.REPORTS]: {
    name: 'Reports', category: 'Support Systems', description: 'Allows private user reports, staff review actions, follow-up tickets, and review-channel embeds.',
    managerCommand: '/report manager', setupCommand: '/report setup',
    nextSteps: ['Run `/report setup` and set a review channel.', 'Post a report panel with `/report panel`.', 'Review report notification and ping settings.', 'Post a staff review index with `/report review-index`.'],
    usefulCommands: ['/report manager', '/report setup', '/report panel', '/report review-index']
  },
  [ModuleKeys.APPLICATIONS]: {
    name: 'Applications', category: 'Support Systems', description: 'Runs custom application types through DMs, records answers, and sends review embeds with transcripts.',
    managerCommand: '/application manager', setupCommand: '/application setup',
    nextSteps: ['Create an application type with `/application setup`.', 'Add custom questions with `/application question-add`.', 'Post the public application panel with `/application panel`.', 'Test the application flow from a non-staff account if possible.', 'Post a review index with `/application review-index`.'],
    usefulCommands: ['/application manager', '/application setup', '/application question-add', '/application question-list', '/application panel', '/application review-index']
  },
  [ModuleKeys.APPEALS]: {
    name: 'Appeals', category: 'Support Systems', description: 'Collects appeals, sends them to a review channel, and manages approve/deny decisions and DMs.',
    managerCommand: '/appeal manager', setupCommand: '/appeal setup',
    nextSteps: ['Run `/appeal setup` for the initial review channel and panel settings.', 'Use `/appeal edit` for partial changes later.', 'Post the public panel with `/appeal panel`.', 'Post a staff review index with `/appeal review-index`.'],
    usefulCommands: ['/appeal manager', '/appeal setup', '/appeal edit', '/appeal panel', '/appeal review-index']
  },
  [ModuleKeys.WELCOME]: {
    name: 'Welcome / Auto Roles', category: 'Community Systems', description: 'Sends welcome messages and grants configured roles when members join.',
    managerCommand: '/welcome manager', setupCommand: '/welcome setup',
    nextSteps: ['Run `/welcome setup` to configure welcome behavior.', 'Add auto roles with `/welcome auto-role-add` if needed.', 'Use `/welcome test` to preview.'],
    usefulCommands: ['/welcome manager', '/welcome setup', '/welcome auto-role-add', '/welcome test']
  },
  [ModuleKeys.REACTION_ROLES]: {
    name: 'Role Panels', category: 'Community Systems', description: 'Creates button, dropdown, or native reaction role panels with standalone roles and bundles.',
    managerCommand: '/roles manager', setupCommand: '/roles setup',
    nextSteps: ['Create a panel with `/roles setup` or `/roles create-panel`.', 'Add options with `/roles add-option`, `/roles add-bundle`, or `/roles bulk-add-wizard`.', 'Customize panel design with `/panel setup` if needed.', 'Publish with `/roles post-panel`.'],
    usefulCommands: ['/roles manager', '/roles setup', '/roles panel-wizard', '/roles bulk-add-wizard', '/roles post-panel', '/panel setup']
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
  [ModuleKeys.REFERRALS]: {
    name: 'Referrals', category: 'Community Systems', description: 'Allows members to submit who referred them once and awards configured bonus XP to the referring member.',
    managerCommand: '/referral manager', setupCommand: '/referral setup',
    nextSteps: ['Run `/referral setup` to set the XP bonus.', 'Members use `/referral submit` once.', 'Moderators can use `/referral set` for retroactive referrals.', 'Use `/referral leaderboard` to show lifetime referrals.'],
    usefulCommands: ['/referral setup', '/referral submit', '/referral set', '/referral leaderboard', '/referral manager']
  },
  [ModuleKeys.ACHIEVEMENTS]: {
    name: 'Achievements', category: 'Community Systems', description: 'Tracks server activity achievements with Bronze/Silver/Gold/Diamond tiers plus one-time unlocks for boosting and birthday setup.',
    managerCommand: '/achievement manager', setupCommand: '/achievement setup',
    nextSteps: ['Run `/achievement setup` to configure announcements and optional AFK exclusion.', 'Review standard Bronze/Silver/Gold/Diamond tiers with `/achievement list`.', 'Customize tier rewards with `/achievement tier-set`.', 'Configure one-time achievements with `/achievement one-time-config`.', 'Rename achievement categories with `/achievement rename`.', 'Ignore non-counting channels with `/achievement ignored-channel add`.'],
    usefulCommands: ['/achievement manager', '/achievement setup', '/achievement list', '/achievement profile', '/achievement leaderboard', '/achievement tier-set', '/achievement one-time-config', '/achievement rename']
  },
  [ModuleKeys.SERVER_STATS]: {
    name: 'Server Stats', category: 'Community Systems', description: 'Maintains optional member/human/bot/voice count channels.',
    managerCommand: '/stats manager', setupCommand: '/stats setup',
    nextSteps: ['Configure only the counters you want with `/stats setup`.', 'Run `/stats refresh` after changes.', 'Verify SlickBot can rename the configured counter channels.'],
    usefulCommands: ['/stats manager', '/stats setup', '/stats refresh']
  },
  [ModuleKeys.CUSTOM_COMMANDS]: {
    name: 'Custom Commands', category: 'Community Systems', description: 'Allows staff-created text triggers that members can run with the configured prefix.',
    managerCommand: '/custom-command manager', setupCommand: '/custom-command setup',
    nextSteps: ['Configure prefix with `/custom-command setup`.', 'Create commands with `/custom-command create`.', 'Open `/custom-command manager` to review all commands.'],
    usefulCommands: ['/custom-command manager', '/custom-command setup', '/custom-command create', '/custom-command edit', '/custom-command test']
  },
  [ModuleKeys.COMMUNITY_GAMES]: {
    name: 'Community Games', category: 'Community Systems', description: 'Runs persistent Counting plus button-based Tic-Tac-Toe and Connect Four challenges.',
    managerCommand: '/games manager', setupCommand: '/games counting setup',
    nextSteps: ['Open `/games manager` to review all game configurations.', 'Configure a counting channel with `/games counting setup`.', 'Enable each game separately with its `/games ... enable` command.', 'Post a public launcher with `/games panel post` and pin that message if desired.', 'Test Tic-Tac-Toe and Connect Four with a second member.'],
    usefulCommands: ['/games manager', '/games panel post', '/games panel edit', '/games counting setup', '/games counting enable', '/games tic-tac-toe enable', '/games connect-four enable']
  },
  [ModuleKeys.FAQ]: {
    name: 'Knowledge Base / FAQ', category: 'Community Systems', description: 'Maintains a forum-backed FAQ index and gives moderators quick linked FAQ replies.',
    managerCommand: '/faq manager', setupCommand: '/faq setup',
    nextSteps: ['Run `/faq setup` with a forum channel.', 'Create FAQ posts manually in that forum and assign forum tags for categories.', 'Use `/faq refresh` after major changes or let SlickBot update the master index from forum events.', 'Use `/faq answer` or the FAQ Reply message context command to send FAQ links to members.'],
    usefulCommands: ['/faq manager', '/faq setup', '/faq refresh', '/faq answer', '/faq status', 'FAQ Reply message command']
  },
  [ModuleKeys.SUGGESTIONS]: {
    name: 'Suggestions', category: 'Community Systems', description: 'Collects member suggestions through a public panel or command, tracks public votes, sends staff review embeds, manages review indexes, stores anonymous submitters privately, and optionally creates discussion threads.',
    managerCommand: '/suggestion manager', setupCommand: '/suggestion setup',
    nextSteps: ['Run `/suggestion setup` with a public voting channel and staff review channel.', 'Review or adjust categories with `/suggestion category list` and `/suggestion category add`.', 'Post a public launcher with `/suggestion panel post`.', 'Create a staff index with `/suggestion review-index`.', 'Use review buttons, `/suggestion review status`, and `/suggestion review add-details` to update suggestions.'],
    usefulCommands: ['/suggestion manager', '/suggestion setup', '/suggestion panel post', '/suggestion review-index', '/suggestion submit', '/suggestion review status', '/suggestion reset']
  },
  [ModuleKeys.JOIN_TO_CREATE]: {
    name: 'Join-to-Create Voice', category: 'Community Systems', description: 'Creates temporary voice rooms when members join configured hub channels.',
    managerCommand: '/join-create manager', setupCommand: '/join-create create-hub',
    nextSteps: ['Create a hub with `/join-create create-hub` or register an existing channel with `/join-create setup`.', 'Test by joining the hub channel.', 'Use `/join-create cleanup` if stale temporary channels remain after testing.'],
    usefulCommands: ['/join-create manager', '/join-create create-hub', '/join-create setup', '/join-create list', '/join-create cleanup']
  },
  [ModuleKeys.SCHEDULED_MESSAGES]: {
    name: 'Scheduled Messages', category: 'Automation Systems', description: 'Sends one-time, daily, or weekly scheduled messages in configured channels.',
    managerCommand: '/schedule manager', setupCommand: '/schedule setup',
    nextSteps: ['Run `/schedule setup` for a default channel.', 'Create messages with `/schedule create`.', 'Use `/schedule list` to review active scheduled messages.'],
    usefulCommands: ['/schedule manager', '/schedule setup', '/schedule create', '/schedule list', '/schedule cancel']
  },
  [ModuleKeys.BOT_UPDATES]: {
    name: 'Bot Updates', category: 'Automation Systems', description: 'Announces new SlickBot versions with patch notes and optional role pings.',
    managerCommand: '/bot-updates manager', setupCommand: '/bot-updates setup',
    nextSteps: ['Run `/bot-updates setup` and set an update channel.', 'Add optional ping roles with `/bot-updates role-add`.', 'Use `/bot-updates preview` before sending.'],
    usefulCommands: ['/bot-updates manager', '/bot-updates setup', '/bot-updates role-add', '/bot-updates preview', '/bot-updates send']
  },
  [ModuleKeys.SOCIAL_FEEDS]: {
    name: 'Social Feeds', category: 'Automation Systems', description: 'Follows Twitch, YouTube, and TikTok channels and posts customizable announcements in designated Discord channels.',
    managerCommand: '/feed manager', setupCommand: '/feed setup',
    nextSteps: ['Run `/feed setup` to set a default announcement channel.', 'Use `/feed add` to follow Twitch, YouTube, or TikTok creators.', 'Use `/feed test` to verify announcement formatting and channel permissions.', 'Open `/feed manager` to review tracked accounts.'],
    usefulCommands: ['/feed manager', '/feed setup', '/feed add', '/feed list', '/feed edit', '/feed test', '/feed check', '/feed remove']
  },
  [ModuleKeys.UTILITY]: {
    name: 'Utility', category: 'Core Setup', description: 'Essential server utilities including message purge, user/server info cards, interactive polls, persistent reminders, visual embed builder, AFK auto-replies, and snipe.',
    managerCommand: '/utility manager', setupCommand: '/utility setup',
    nextSteps: ['Run `/utility setup` to configure default channels and limits.', 'Use `/purge` to clean up chat messages.', 'Use `/userinfo` or right-click a user to view detailed profile cards.', 'Use `/poll create` to launch interactive votes.'],
    usefulCommands: ['/utility manager', '/utility setup', '/purge', '/userinfo', '/serverinfo', '/avatar', '/banner', '/poll create', '/remind set', '/embed create', '/afk', '/snipe']
  },
  [ModuleKeys.AUTOMOD]: {
    name: 'Auto-Mod & Anti-Raid', category: 'Core Setup', description: 'Automated spam filtering, invite/link blocking, mass pings, custom blacklists, and anti-raid join velocity monitoring with moderator lockdown prompts.',
    managerCommand: '/automod manager', setupCommand: '/automod setup',
    nextSteps: ['Run `/automod setup` to choose a 1-click protection preset.', 'Open `/automod manager` to customize filter rules and punishment actions.', 'Use the visual role and channel pickers to configure bypass exemptions.'],
    usefulCommands: ['/automod setup', '/automod manager', '/automod status', '/automod rule', '/automod blacklist-add', '/automod blacklist-list', '/automod whitelist-add', '/automod raid', '/automod reset']
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

async function buildCategoryPanel(guildId, categoryKey) {
  const category = MODULE_CATEGORIES.find((cat) => cat.key === categoryKey) || MODULE_CATEGORIES[0];
  const allStatuses = await getAllModuleStatuses(guildId);
  let items = allStatuses.filter((item) => category.modules.includes(item.moduleKey));
  if (!items.length) {
    items = category.modules.map((m) => normalizeStatusPayload({ moduleKey: m, core: isCoreModule(m), state: 'READY', label: 'Ready' }));
  }
  const counts = summarizeStateCounts(items);

  const lines = items.map((item) => {
    const catalog = MODULE_SETUP_CATALOG[item.moduleKey] || {};
    return [
      `• ${item.emoji} **${moduleLabel(item.moduleKey)}** — \`${item.moduleKey}\` · **${item.label}**${item.note ? ` (${item.note})` : ''}`,
      catalog.description ? `  *${catalog.description}*` : null
    ].filter(Boolean).join('\n');
  });

  const embed = createBaseEmbed({
    title: `SlickBot Setup Center • ${category.label}`,
    description: [
      `**Category:** ${category.label}`,
      `**Category Health:** ${formatStateCounts(counts)}`,
      '',
      '**Modules in this Category**',
      lines.join('\n\n') || '*No modules in this category.*',
      '',
      'Select any module below to open its **interactive Manager Panel**, or click **Guided Setup** for step-by-step onboarding.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Setup • ${category.label}`
  });

  const selectOptions = items.map((item) => ({
    label: moduleLabel(item.moduleKey).slice(0, 100),
    value: item.moduleKey,
    description: compactLine(`${item.label}${item.note ? ` · ${item.note}` : ''}`, 100),
    emoji: item.emoji
  }));

  const nonCoreItems = items.filter((item) => !isCoreModule(item.moduleKey));
  const toggleOptions = nonCoreItems.map((item) => {
    const isEnabled = item.state !== 'DISABLED';
    return {
      label: `${isEnabled ? 'Disable' : 'Enable'} ${moduleLabel(item.moduleKey)}`.slice(0, 100),
      value: item.moduleKey,
      description: compactLine(`Currently ${isEnabled ? 'Enabled (select to turn OFF)' : 'Disabled (select to turn ON)'}`, 100),
      emoji: isEnabled ? '⏸️' : '▶️'
    };
  });

  const selectRow = createSelectRow(CustomIds.SetupModuleSelect, `Open ${category.label} module dashboard...`, selectOptions.slice(0, 25));
  const components = [selectRow];

  if (toggleOptions.length > 0) {
    const toggleRow = createSelectRow(
      `${CustomIds.CategoryToggleSelectPrefix}${category.key}`,
      `⚡ Quick Toggle: Enable / Disable ${category.label} module...`,
      toggleOptions.slice(0, 25)
    );
    components.push(toggleRow);
  }

  const buttonRow = createButtonRow([
    createPanelButton(`${CustomIds.OnboardingModulePrefix}${category.key}`, `Guided ${category.label} Setup`, ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️'),
    createPanelButton(category.key === 'CORE' ? CustomIds.SetupCategoryCore : category.key === 'SUPPORT' ? CustomIds.SetupCategorySupport : category.key === 'COMMUNITY' ? CustomIds.SetupCategoryCommunity : CustomIds.SetupCategoryAutomation, 'Refresh', ButtonStyle.Secondary, '🔄')
  ]);
  components.push(buttonRow);

  return { embeds: [embed], components };
}

async function buildSetupPanel(guildId, guildName = null) {
  const statuses = await getAllModuleStatuses(guildId);
  const counts = summarizeStateCounts(statuses);
  const needs = statuses.filter((item) => ['ERROR', 'NEEDS_CONFIG', 'PARTIAL', 'WARNING'].includes(item.state));
  const categoryLines = MODULE_CATEGORIES.filter((c) => c.key !== 'BACKLOG').map((category) => categorySummary(statuses, category));

  const priorityLines = needs.length
    ? needs.slice(0, 5).map((item) => `• ${item.emoji} **${moduleLabel(item.moduleKey)}** — ${item.note || item.label}${MODULE_SETUP_CATALOG[item.moduleKey]?.setupCommand ? ` · \`${MODULE_SETUP_CATALOG[item.moduleKey].setupCommand}\`` : ''}`)
    : ['• ✅ All configured modules are healthy and active.'];

  const embed = createBaseEmbed({
    title: 'SlickBot Setup Center',
    description: [
      `Server: **${guildName || 'Current Server'}**`,
      '',
      '**System Health Snapshot**',
      `${formatStateCounts(counts)}`,
      '',
      '**Module Categories**',
      ...categoryLines,
      '',
      '**Attention / Needs Review**',
      ...priorityLines,
      '',
      'Click a **Category** below to view and configure its modules, or launch **Guided Onboarding** for one-click setup.'
    ].join('\n'),
    color: needs.some((item) => item.state === 'ERROR') ? SlickBotColors.ERROR : needs.length ? SlickBotColors.WARNING : SlickBotColors.PRIMARY,
    footer: 'SlickBot Setup Center'
  });

  const rowOne = createButtonRow([
    createPanelButton(CustomIds.SetupCategoryCore, 'Core & Safety', ButtonStyle.Primary, '🛡️'),
    createPanelButton(CustomIds.SetupCategorySupport, 'Support Systems', ButtonStyle.Primary, '🎟️'),
    createPanelButton(CustomIds.SetupCategoryCommunity, 'Community', ButtonStyle.Primary, '✨'),
    createPanelButton(CustomIds.SetupCategoryAutomation, 'Automation', ButtonStyle.Primary, '⚡')
  ]);

  const rowTwo = createButtonRow([
    createPanelButton(CustomIds.OnboardingStart, 'Guided Onboarding', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.SetupModules, 'All Modules', ButtonStyle.Secondary, '🧩'),
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
      '**Viewing:** Module Overview',
      '',
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

  const toggleOptions = statuses
    .filter((item) => !isCoreModule(item.moduleKey))
    .map((item) => ({
      label: moduleLabel(item.moduleKey).slice(0, 100),
      value: item.moduleKey,
      description: compactLine(`${item.label}. Select to toggle on/off.`, 100),
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
    title: 'SlickBot Module Manager',
    description: [
      `**Viewing:** ${status.emoji} ${catalog.name}`,
      '',
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

  const buttonList = [];
  if (isImplementedModule(moduleKey)) {
    buttonList.push(createPanelButton(`${CustomIds.SetupOpenManagerPrefix}${moduleKey}`, 'Open Manager', ButtonStyle.Primary, '⚙️'));
  }
  buttonList.push(
    createPanelButton(`${CustomIds.OnboardingModulePrefix}${moduleKey}`, 'Guided Setup', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.ModulesRefresh, 'Back to Modules', ButtonStyle.Secondary, '↩️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  );

  const buttons = createButtonRow(buttonList);
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

  if (row.module_key === 'MODERATION') {
    const [logCfg, autoModCfg, cases, notes] = await Promise.all([
      query(`SELECT channel_id, enabled, delivery_mode FROM log_module_settings WHERE guild_id = $1 AND module_key = 'moderation' LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT timeout_role_id FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count FROM moderation_cases WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ total: 0, open_count: 0 }] })),
      query(`SELECT COUNT(*)::int AS total FROM user_notes WHERE guild_id = $1 AND is_active = true`, [guildId]).catch(() => ({ rows: [{ total: 0 }] }))
    ]);
    const logReady = Boolean(logCfg.rows[0]?.channel_id && logCfg.rows[0]?.enabled !== false && logCfg.rows[0]?.delivery_mode !== 'DISABLED');
    const hasTimeoutRole = Boolean(autoModCfg.rows[0]?.timeout_role_id);
    const caseTotal = cases.rows[0]?.total || 0;
    const noteTotal = notes.rows[0]?.total || 0;

    if (logReady && hasTimeoutRole) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${caseTotal} case(s), timeout role ready` };
    if (!hasTimeoutRole && !logReady) return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Timeout role and log channel missing' };
    if (!hasTimeoutRole) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Actions ready; timeout role missing' };
    return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Actions ready; moderation log channel missing' };
  }

  if (row.module_key === 'AUTOMOD') {
    const res = await query(`SELECT enabled, timeout_role_id, raid_alert_channel_id, alert_channel_id, anti_invites_enabled, anti_links_enabled, anti_spam_enabled FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const config = res.rows[0];
    if (!config) {
      return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /automod setup' };
    }
    if (config.enabled === false) {
      return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Protection paused' };
    }
    const hasTimeoutRole = Boolean(config.timeout_role_id);
    const hasAlertChannel = Boolean(config.raid_alert_channel_id || config.alert_channel_id);

    if (hasTimeoutRole && hasAlertChannel) {
      return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Protection & timeout role active' };
    }
    if (!hasTimeoutRole && !hasAlertChannel) {
      return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Timeout role and alert channel missing' };
    }
    if (!hasTimeoutRole) {
      return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Timeout role not configured' };
    }
    return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Raid alert channel missing' };
  }

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

  if (row.module_key === 'LOCKDOWN') {
    const [presets, active] = await Promise.all([
      query(`SELECT COUNT(*)::int AS count FROM lockdown_presets WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT preset_name, started_at FROM lockdown_sessions WHERE guild_id = $1 AND status = 'ACTIVE' ORDER BY started_at DESC LIMIT 1`, [guildId]).catch(() => ({ rows: [] }))
    ]);
    if (active.rows[0]) return { moduleKey: row.module_key, core: false, state: 'WARNING', emoji: '⚠️', label: 'Warning', note: `Active: ${active.rows[0].preset_name}` };
    if ((presets.rows[0]?.count || 0) > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${presets.rows[0].count} preset(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /lockdown setup' };
  }

  if (row.module_key === 'TEMP_ROLES') {
    const active = await query(`SELECT COUNT(*)::int AS count FROM temporary_role_assignments WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }));
    return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${active.rows[0]?.count || 0} active` };
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

  if (row.module_key === 'COMMUNITY_GAMES') {
    const [configs, counting, active] = await Promise.all([
      query(`SELECT game_key, enabled, channel_id FROM community_game_configs WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT channel_id FROM counting_game_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM community_game_sessions WHERE guild_id = $1 AND status IN ('PENDING','ACTIVE') AND expires_at > NOW()`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const enabled = configs.rows.filter((config) => config.enabled === true);
    if (!enabled.length) return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Enable a game with /games' };
    const countingEnabled = enabled.some((config) => config.game_key === 'COUNTING');
    if (countingEnabled && !counting.rows[0]?.channel_id) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Counting enabled without a channel' };
    return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${enabled.length}/3 enabled · ${active.rows[0]?.count || 0} active` };
  }

  if (row.module_key === 'SUGGESTIONS') {
    const [cfg, count] = await Promise.all([
      query(`SELECT channel_id, review_channel_id, panel_active, auto_create_threads FROM suggestion_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM suggestions WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0] || {};
    if (config.channel_id && config.review_channel_id && config.panel_active) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${count.rows[0]?.count || 0} suggestion(s)` };
    if (config.channel_id || config.review_channel_id) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Complete public/review channels and panel' };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /suggestion setup' };
  }

  if (row.module_key === 'REFERRALS') {
    const [cfg, count] = await Promise.all([
      query(`SELECT enabled, referral_xp FROM referral_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM referrals WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0];
    if (!config) return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /referral setup' };
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Referral submissions off' };
    return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${count.rows[0]?.count || 0} referral(s)` };
  }

  if (row.module_key === 'ACHIEVEMENTS') {
    const [cfg, tiers, unlocks] = await Promise.all([
      query(`SELECT enabled, announcement_channel_id, dm_enabled FROM achievement_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS count FROM achievement_tiers WHERE guild_id = $1 AND enabled = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
      query(`SELECT COUNT(*)::int AS count FROM achievement_unlocks WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);
    const config = cfg.rows[0];
    if (!config) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${tiers.rows[0]?.count || 0} default tier(s)` };
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Tracking off' };
    if (config.announcement_channel_id || config.dm_enabled) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${unlocks.rows[0]?.count || 0} unlock(s)` };
    return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Tracking active; no notifications configured' };
  }

  if (row.module_key === 'FAQ') {
    const cfg = await query(`SELECT forum_channel_id, master_thread_id, ticket_channel_id FROM faq_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const config = cfg.rows[0] || {};
    if (config.forum_channel_id && config.master_thread_id) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Forum index active' };
    if (config.forum_channel_id) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Forum set; master post missing' };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /faq setup' };
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

  if (row.module_key === 'SOCIAL_FEEDS') {
    const [cfg, feeds] = await Promise.all([
      query(`SELECT enabled, default_channel_id FROM social_feed_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] })),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled = true)::int AS active FROM social_feeds WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ total: 0, active: 0 }] }))
    ]);
    const config = cfg.rows[0] || {};
    const total = feeds.rows[0]?.total || 0;
    const active = feeds.rows[0]?.active || 0;
    if (config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Notifications paused' };
    if (active > 0) return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: `${active}/${total} feed(s) active` };
    if (total > 0) return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: `${total} disabled feed(s)` };
    return { moduleKey: row.module_key, core: false, state: 'NEEDS_CONFIG', emoji: '🟣', label: 'Needs Setup', note: 'Run /feed add' };
  }

  if (row.module_key === 'UTILITY') {
    const res = await query(`SELECT enabled, purge_enabled, polls_enabled, reminders_enabled, afk_enabled, embeds_enabled FROM utility_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const config = res.rows[0];
    if (config && config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Utility tools disabled' };
    return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Essential tools active' };
  }

  if (row.module_key === 'AUTOMOD') {
    const res = await query(`SELECT enabled, raid_shield_enabled, default_blacklist_enabled FROM automod_configs WHERE guild_id = $1 LIMIT 1`, [guildId]).catch(() => ({ rows: [] }));
    const config = res.rows[0];
    if (config && config.enabled === false) return { moduleKey: row.module_key, core: false, state: 'DISABLED', emoji: '⏸️', label: 'Disabled', note: 'Auto-Mod protection paused' };
    return { moduleKey: row.module_key, core: false, state: 'READY', emoji: '✅', label: 'Ready', note: 'Filters & Raid Shield active' };
  }

  return { moduleKey: row.module_key, core: false, state: 'PARTIAL', emoji: '🟠', label: 'Partially Configured', note: 'Module shell only' };
}

async function buildLoggingPanel(guildId) {
  const { LOG_GROUPS } = require('../logging/logEventCatalog');
  const moduleSettings = await query(
    `SELECT module_key, delivery_mode, channel_id, enabled
     FROM log_module_settings
     WHERE guild_id = $1
     ORDER BY module_key ASC`,
    [guildId]
  );
  const eventSettings = await query(
    `SELECT event_key, delivery_mode, channel_id, enabled
     FROM log_settings
     WHERE guild_id = $1
     ORDER BY event_key ASC`,
    [guildId]
  );

  const moduleSettingsByKey = new Map(moduleSettings.rows.map((row) => [String(row.module_key).toLowerCase(), row]));

  const groupBlocks = LOG_GROUPS.map((group) => {
    const primaryKey = group.moduleKeys[0];
    const row = moduleSettingsByKey.get(primaryKey);
    const configuredModules = group.moduleKeys.filter((k) => {
      const r = moduleSettingsByKey.get(k);
      return r && r.channel_id && r.enabled !== false;
    }).length;

    const channelDisplay = row?.channel_id && row.enabled !== false ? `<#${row.channel_id}>` : '*Not configured*';
    const subModules = group.moduleKeys.map((k) => {
      const mod = LogModuleCatalog.find((m) => m.key === k);
      const modRow = moduleSettingsByKey.get(k);
      const isSet = modRow && modRow.channel_id && modRow.enabled !== false;
      return `${isSet ? '✅' : '⚪'} ${mod?.label || k}`;
    }).join(' · ');

    return `**${group.emoji} ${group.label}** → ${channelDisplay} (${configuredModules}/${group.moduleKeys.length} active)\n└ ${subModules}`;
  }).join('\n\n');

  const overrides = eventSettings.rows.filter((row) => row.channel_id || row.delivery_mode || row.enabled === false);
  const overrideLines = overrides.length
    ? overrides.slice(0, 5).map((row) => {
      const event = LogEventCatalog.find((item) => item.key === row.event_key);
      const parts = [];
      if (row.enabled === false || row.delivery_mode === 'DISABLED') parts.push('Disabled');
      else parts.push('Instant');
      if (row.channel_id) parts.push(`→ <#${row.channel_id}>`);
      return `• **${event?.label || row.event_key}** ` + '`' + row.event_key + '`' + ` — ${parts.join(' ') || 'Override saved'}`;
    }).join('\n')
    : `No event overrides configured. All ${LogModuleCatalog.length} modules follow their parent group settings.`;

  const embed = createBaseEmbed({
    title: 'SlickBot Core Setup • Logging Center',
    description: [
      `**Viewing:** Server Event Logging (${LogModuleCatalog.length} Tracking Modules in 6 Hubs)`,
      '',
      '**Aggregated Log Groups**',
      groupBlocks,
      '',
      '**Event Overrides**',
      overrideLines,
      '',
      'Click **Quick Setup** for guided onboarding across all 6 log hubs, or configure individual routes with `/logging set-channel`.'
    ].join('\n'),
    color: SlickBotColors.INFO,
    footer: 'SlickBot Logging • Instant Delivery'
  });

  const row1 = createButtonRow([
    createPanelButton(`${CustomIds.OnboardingModulePrefix}LOGGING`, 'Quick Setup (All 6 Hubs)', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.LoggingTest, 'Send Test', ButtonStyle.Primary, '🧪'),
    createPanelButton(CustomIds.LoggingReset, 'Reset All', ButtonStyle.Danger, '🗑️')
  ]);

  const row2 = createButtonRow([
    createPanelButton(CustomIds.LoggingRefresh, 'Refresh', ButtonStyle.Secondary, '🔄'),
    createPanelButton(CustomIds.SetupCategoryCore, 'Core & Safety', ButtonStyle.Primary, '🛡️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ]);

  return { embeds: [embed], components: [row1, row2] };
}

async function buildTeamsPanel(guildId) {
  const teams = await query(
    `SELECT pt.id, pt.name, pt.description, pt.is_system_team,
            COALESCE(array_remove(array_agg(DISTINCT ptr.role_id), NULL), ARRAY[]::text[]) AS role_ids,
            COALESCE(array_remove(array_agg(DISTINCT ptu.user_id), NULL), ARRAY[]::text[]) AS user_ids,
            tpl.permission_level
     FROM permission_teams pt
     LEFT JOIN permission_team_roles ptr ON ptr.team_id = pt.id
     LEFT JOIN permission_team_users ptu ON ptu.team_id = pt.id
     LEFT JOIN team_permission_levels tpl ON tpl.team_id = pt.id AND tpl.guild_id = pt.guild_id
     WHERE pt.guild_id = $1
     GROUP BY pt.id, pt.name, pt.description, pt.is_system_team, tpl.permission_level
     ORDER BY pt.is_system_team DESC, pt.name ASC`,
    [guildId]
  );

  const lines = teams.rowCount
    ? teams.rows.slice(0, 10).map((team) => {
      const roleIds = Array.isArray(team.role_ids) ? team.role_ids : [];
      const userIds = Array.isArray(team.user_ids) ? team.user_ids : [];
      const roles = roleIds.length ? roleIds.slice(0, 8).map((roleId) => `<@&${roleId}>`).join(', ') : 'None';
      const users = userIds.length ? userIds.slice(0, 6).map((userId) => `<@${userId}>`).join(', ') : 'None';
      const suffix = [team.is_system_team ? 'System' : null, team.permission_level ? `Level: ${team.permission_level}` : null].filter(Boolean).join(' · ');
      return [
        `• **${team.name}**${suffix ? ` — ${suffix}` : ''}`,
        team.description ? `  ${team.description}` : null,
        `  Roles: ${roles}${roleIds.length > 8 ? `, +${roleIds.length - 8} more` : ''}`,
        `  Direct Users: ${users}${userIds.length > 6 ? `, +${userIds.length - 6} more` : ''}`
      ].filter(Boolean).join('\n');
    }).join('\n\n')
    : 'No teams found. Run `/setup` first to initialize SlickBot, then create teams with `/team create`.';

  const embed = createBaseEmbed({
    title: 'SlickBot Core Setup',
    description: [
      '**Viewing:** Permission Teams',
      '',
      lines,
      '',
      '**Edit Commands**',
      'Use `/team create`, `/team add-role`, `/team remove-role`, `/permissions team-level`, and `/permissions command-allow-team` to manage teams and access.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const row = createButtonRow([
    createPanelButton(CustomIds.SetupPermissions, 'Permission Center', ButtonStyle.Secondary, '🔐'),
    createPanelButton(CustomIds.SetupCategoryCore, 'Core & Safety', ButtonStyle.Primary, '🛡️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ]);

  return { embeds: [embed], components: [row] };
}


async function buildPermissionsPanel(guildId, selectedTeamId = null) {
  const [teams, moduleTargets, publicActions, roleActions, ignored, commandLevels, moduleLevels] = await Promise.all([
    query(
      `SELECT pt.id, pt.name, pt.description, pt.is_system_team,
              COALESCE(array_remove(array_agg(DISTINCT ptr.role_id), NULL), ARRAY[]::text[]) AS role_ids,
              COALESCE(array_remove(array_agg(DISTINCT ptu.user_id), NULL), ARRAY[]::text[]) AS user_ids,
              tpl.permission_level
       FROM permission_teams pt
       LEFT JOIN permission_team_roles ptr ON ptr.team_id = pt.id
       LEFT JOIN permission_team_users ptu ON ptu.team_id = pt.id
       LEFT JOIN team_permission_levels tpl ON tpl.team_id = pt.id AND tpl.guild_id = pt.guild_id
       WHERE pt.guild_id = $1
       GROUP BY pt.id, pt.name, pt.description, pt.is_system_team, tpl.permission_level
       ORDER BY pt.is_system_team DESC, pt.name ASC`,
      [guildId]
    ).catch(() => ({ rows: [] })),
    query(`SELECT module_key, target_type, target_id FROM module_permission_targets WHERE guild_id = $1 AND allow = true ORDER BY module_key ASC LIMIT 20`, [guildId]).catch(() => ({ rows: [] })),
    query(`SELECT action_key FROM public_action_permissions WHERE guild_id = $1 AND enabled = true ORDER BY action_key ASC LIMIT 12`, [guildId]).catch(() => ({ rows: [] })),
    query(`SELECT COUNT(*)::int AS count FROM role_action_permissions WHERE guild_id = $1 AND allow = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM permission_ignored_users WHERE guild_id = $1 AND active = true`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM command_permission_levels WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] })),
    query(`SELECT COUNT(*)::int AS count FROM module_permission_levels WHERE guild_id = $1`, [guildId]).catch(() => ({ rows: [{ count: 0 }] }))
  ]);

  const selectedTeam = teams.rows.find((team) => team.id === selectedTeamId) || teams.rows[0] || null;
  const [teamCommandGrants, teamModuleGrants] = selectedTeam ? await Promise.all([
    query(`SELECT action_key FROM command_permissions WHERE guild_id = $1 AND team_id = $2 AND allow = true ORDER BY action_key ASC LIMIT 30`, [guildId, selectedTeam.id]).catch(() => ({ rows: [] })),
    query(`SELECT module_key FROM module_permission_targets WHERE guild_id = $1 AND target_type = 'TEAM' AND target_id = $2 AND allow = true ORDER BY module_key ASC LIMIT 20`, [guildId, selectedTeam.id]).catch(() => ({ rows: [] }))
  ]) : [{ rows: [] }, { rows: [] }];

  const moduleLines = moduleTargets.rows.length
    ? moduleTargets.rows.slice(0, 12).map((row) => {
      const target = row.target_type === 'ROLE'
        ? `<@&${row.target_id}>`
        : row.target_type === 'TEAM'
          ? teams.rows.find((team) => team.id === row.target_id)?.name || 'Team'
          : row.target_type === 'USER'
            ? `<@${row.target_id}>`
            : 'Everyone';
      return `• **${row.module_key}** — ${row.target_type}: ${target}`;
    }).join('\n')
    : 'No module-level locks configured. Commands currently use required permission levels, explicit grants, and public action settings.';

  const publicLines = publicActions.rows.length
    ? publicActions.rows.map((row) => `• \`${row.action_key}\``).join('\n')
    : 'No command/action keys are explicitly public.';

  let selectedTeamBlock = 'No permission teams found yet.';
  if (selectedTeam) {
    const roleIds = Array.isArray(selectedTeam.role_ids) ? selectedTeam.role_ids : [];
    const userIds = Array.isArray(selectedTeam.user_ids) ? selectedTeam.user_ids : [];
    const roles = roleIds.length ? roleIds.slice(0, 8).map((roleId) => `<@&${roleId}>`).join(', ') : 'None';
    const users = userIds.length ? userIds.slice(0, 6).map((userId) => `<@${userId}>`).join(', ') : 'None';
    const grants = teamCommandGrants.rows.length
      ? teamCommandGrants.rows.slice(0, 18).map((row) => `\`${row.action_key}\``).join(', ')
      : 'No explicit command grants. This team may still inherit access from its permission level.';
    const moduleGrants = teamModuleGrants.rows.length
      ? teamModuleGrants.rows.map((row) => `\`${row.module_key}\``).join(', ')
      : 'No explicit module grants.';
    selectedTeamBlock = [
      `Team: **${selectedTeam.name}**${selectedTeam.is_system_team ? ' · System Team' : ''}`,
      selectedTeam.description ? `Description: ${selectedTeam.description}` : null,
      `Permission Level: **${selectedTeam.permission_level || 'Not mapped'}**`,
      `Roles: ${roles}${roleIds.length > 8 ? `, +${roleIds.length - 8} more` : ''}`,
      `Direct Users: ${users}${userIds.length > 6 ? `, +${userIds.length - 6} more` : ''}`,
      `Module Grants: ${moduleGrants}`,
      `Command Grants: ${grants}`
    ].filter(Boolean).join('\n');
  }

  const embed = createBaseEmbed({
    title: 'SlickBot Core Setup',
    description: [
      '**Viewing:** Permission Center',
      '',
      '**Permission Snapshot**',
      `Teams: **${teams.rows.length || 0}**`,
      `Role Command Grants: **${roleActions.rows[0]?.count || 0}**`,
      `Command Level Rules: **${commandLevels.rows[0]?.count || 0}**`,
      `Module Level Rules: **${moduleLevels.rows[0]?.count || 0}**`,
      `Ignored Users: **${ignored.rows[0]?.count || 0}**`,
      '',
      '**Selected Permission Team**',
      selectedTeamBlock,
      '',
      '**Module Access Rules**',
      moduleLines,
      '',
      '**Public Commands**',
      publicLines,
      '',
      '**How Access Works**',
      'SlickBot checks ignored users first, then module locks, then permission level requirements, public actions, and explicit role/team grants.'
    ].join('\n'),
    color: SlickBotColors.INFO
  });

  const components = [];

  const adminSelect = new RoleSelectMenuBuilder()
    .setCustomId(CustomIds.PermissionsSetAdminRole)
    .setPlaceholder('👑 Select Administrator Role...');
  components.push(new ActionRowBuilder().addComponents(adminSelect));

  const modSelect = new RoleSelectMenuBuilder()
    .setCustomId(CustomIds.PermissionsSetModRole)
    .setPlaceholder('🛡️ Select Moderator Role...');
  components.push(new ActionRowBuilder().addComponents(modSelect));

  if (teams.rows.length) {
    components.push(createSelectRow(CustomIds.PermissionsTeamSelect, 'View a permission team...', teams.rows.slice(0, 25).map((team) => ({
      label: team.name.slice(0, 100),
      value: team.id,
      description: compactLine(`${team.permission_level || 'No level'} · ${(team.role_ids || []).length} role(s) · ${(team.user_ids || []).length} user(s)`, 100),
      emoji: team.is_system_team ? '👑' : '👥'
    }))));
  }

  components.push(createButtonRow([
    createPanelButton(`${CustomIds.OnboardingModulePrefix}PERMISSIONS`, 'Quick Setup', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.PermissionsApplyDefaults, 'Apply Defaults', ButtonStyle.Primary, '⚡'),
    createPanelButton(CustomIds.SetupTeams, 'Teams', ButtonStyle.Secondary, '👥'),
    createPanelButton(CustomIds.PermissionsRefresh, 'Refresh', ButtonStyle.Secondary, '🔄')
  ]));

  components.push(createButtonRow([
    createPanelButton(CustomIds.SetupCategoryCore, 'Core & Safety', ButtonStyle.Primary, '🛡️'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ]));

  return { embeds: [embed], components };
}


function compactCommunityText(payload, fallback) {
  const desc = payload?.embeds?.[0]?.data?.description || fallback;
  const lines = String(desc)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('**Viewing:**') && !l.startsWith('Use `/') && !l.startsWith('Use the ') && !l.startsWith('Staff can ') && !l.startsWith('Members use '));
  const text = lines.slice(0, 2).join(' · ');
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : (clean || fallback);
}

async function buildCommunityPanel(guildId) {
  return buildCategoryPanel(guildId, 'COMMUNITY');
}

module.exports = {
  ensureDefaultModules,
  buildSetupPanel,
  buildCategoryPanel,
  buildModulesPanel,
  buildModuleDetailPanel,
  buildLoggingPanel,
  buildTeamsPanel,
  buildPermissionsPanel,
  buildCommunityPanel,
  getModuleStatus,
  getAllModuleStatuses,
  MODULE_CATEGORIES
};
