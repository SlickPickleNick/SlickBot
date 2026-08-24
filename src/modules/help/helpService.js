const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { ModuleKeys, implementedModules } = require('../moduleRegistry');
const { ActionKeys, PermissionLevels, defaultActionLevels } = require('../permissions/actionKeys');
const {
  createBaseEmbed,
  createButtonRow,
  createPanelButton,
  createSelectRow,
  SlickBotColors
} = require('../ui/uiService');
const { CustomIds } = require('../ui/customIds');

const MODULE_LABELS = Object.freeze({
  [ModuleKeys.PERMISSIONS]: 'Permissions & Setup',
  [ModuleKeys.LOGGING]: 'Logging & Audits',
  [ModuleKeys.STATUS]: 'Status & Health',
  [ModuleKeys.MODERATION]: 'Moderation & Cases',
  [ModuleKeys.LOCKDOWN]: 'Emergency Lockdown',
  [ModuleKeys.TEMP_ROLES]: 'Temporary Roles',
  [ModuleKeys.UTILITY]: 'Utility & Essentials',
  [ModuleKeys.TICKETS]: 'Support Tickets',
  [ModuleKeys.REPORTS]: 'User Reports',
  [ModuleKeys.APPLICATIONS]: 'Custom Applications',
  [ModuleKeys.APPEALS]: 'Punishment Appeals',
  [ModuleKeys.WELCOME]: 'Welcome & Auto Roles',
  [ModuleKeys.REACTION_ROLES]: 'Role Panels',
  [ModuleKeys.GIVEAWAYS]: 'Giveaways',
  [ModuleKeys.BIRTHDAYS]: 'Birthdays',
  [ModuleKeys.LEVELING]: 'Leveling & XP',
  [ModuleKeys.COMMUNITY_GAMES]: 'Community Games',
  [ModuleKeys.FAQ]: 'Knowledge Base / FAQ',
  [ModuleKeys.SUGGESTIONS]: 'Suggestions Hub',
  [ModuleKeys.REFERRALS]: 'Invite Referrals',
  [ModuleKeys.ACHIEVEMENTS]: 'Achievements & Badges',
  [ModuleKeys.JOIN_TO_CREATE]: 'Join-to-Create Voice',
  [ModuleKeys.SERVER_STATS]: 'Server Stat Counters',
  [ModuleKeys.CUSTOM_COMMANDS]: 'Custom Commands',
  [ModuleKeys.SCHEDULED_MESSAGES]: 'Scheduled Announcements',
  [ModuleKeys.BOT_UPDATES]: 'Bot Changelogs',
  [ModuleKeys.SOCIAL_FEEDS]: 'Social Feeds'
});

const HELP_CATEGORIES = Object.freeze([
  {
    key: 'MEMBER',
    label: 'Member Commands',
    emoji: '✨',
    description: 'Commands available to all server members.'
  },
  {
    key: 'CORE',
    label: 'Core & Safety',
    emoji: '🛡️',
    description: 'Moderation, lockdown, temporary roles, logging, and essentials.'
  },
  {
    key: 'SUPPORT',
    label: 'Support Systems',
    emoji: '🎟️',
    description: 'Tickets, reports, DM applications, and punishment appeals.'
  },
  {
    key: 'COMMUNITY',
    label: 'Community & Games',
    emoji: '🎉',
    description: 'Leveling, giveaways, birthdays, games, FAQ, suggestions, and voice.'
  },
  {
    key: 'AUTOMATION',
    label: 'Automation & Stats',
    emoji: '⚡',
    description: 'Server stats, scheduled messages, social feeds, and custom commands.'
  }
]);

const HELP_CATALOG = Object.freeze([
  // Core & Permissions
  {
    name: 'ping',
    command: '/ping',
    syntax: '/ping',
    description: 'Check whether SlickBot is online and view gateway latency.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.BotPing,
    level: PermissionLevels.EVERYONE,
    examples: ['/ping']
  },
  {
    name: 'help',
    command: '/help',
    syntax: '/help [command] [module]',
    description: 'Open the interactive help center or view syntax for a specific command.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.Help,
    level: PermissionLevels.EVERYONE,
    options: [
      { name: 'command', description: 'Command name to view syntax and examples for', required: false },
      { name: 'module', description: 'Module key to view commands for', required: false }
    ],
    examples: ['/help', '/help command:purge', '/help module:tickets']
  },
  {
    name: 'setup',
    command: '/setup',
    syntax: '/setup',
    description: 'Open the centralized Setup Center with category dashboards and guided onboarding.',
    category: 'CORE',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.Setup,
    level: PermissionLevels.ADMIN,
    examples: ['/setup']
  },
  {
    name: 'modules',
    command: '/modules',
    syntax: '/modules [action]',
    description: 'Open the module manager or enable/disable specific modules.',
    category: 'CORE',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.ModulesManage,
    level: PermissionLevels.ADMIN,
    examples: ['/modules panel', '/modules enable module:giveaways', '/modules disable module:leveling']
  },
  {
    name: 'permissions',
    command: '/permissions',
    syntax: '/permissions [panel|apply-defaults|command-level|module-level|ignore-add|ignore-remove|ignore-list]',
    description: 'Configure permission levels, command overrides, and blocked users.',
    category: 'CORE',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.PermissionsManage,
    level: PermissionLevels.ADMIN,
    examples: ['/permissions panel', '/permissions apply-defaults', '/permissions command-level action:purge level:Moderator']
  },
  {
    name: 'team',
    command: '/team',
    syntax: '/team [create|add-role|remove-role|allow|delete|list]',
    description: 'Manage staff and custom permission teams.',
    category: 'CORE',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.TeamsManage,
    level: PermissionLevels.ADMIN,
    examples: ['/team list', '/team create name:SupportStaff', '/team add-role team:SupportStaff role:@Helpers']
  },
  {
    name: 'reset',
    command: '/reset',
    syntax: '/reset',
    description: 'Reset SlickBot configurations and stored data for this server.',
    category: 'CORE',
    moduleKey: ModuleKeys.PERMISSIONS,
    actionKey: ActionKeys.ServerReset,
    level: PermissionLevels.OWNER,
    examples: ['/reset']
  },

  // Logging & Status
  {
    name: 'logging',
    command: '/logging',
    syntax: '/logging [panel|set-channel|clear-channel|module-mode|event-mode|event-channel|test]',
    description: 'Configure audit log routing, channel assignments, and event delivery modes.',
    category: 'CORE',
    moduleKey: ModuleKeys.LOGGING,
    actionKey: ActionKeys.LoggingConfigure,
    level: PermissionLevels.ADMIN,
    examples: ['/logging panel', '/logging set-channel module:moderation channel:#mod-logs', '/logging test module:moderation']
  },
  {
    name: 'status',
    command: '/status',
    syntax: '/status [view|manager|set|stream-url|clear]',
    description: 'Global bot presence and status control dashboard. Restricted to authorized bot owners.',
    category: 'CORE',
    moduleKey: ModuleKeys.STATUS,
    actionKey: ActionKeys.StatusManage,
    level: PermissionLevels.BOT_OWNER,
    examples: ['/status view', '/status manager', '/status set status:Online activity:Watching text:"SlickBot Multi-Server"']
  },
  {
    name: 'bot',
    command: '/bot',
    syntax: '/bot [version|info|invite|test]',
    description: 'Show SlickBot version, global server count telemetry, invite generator, or module diagnostics.',
    category: 'CORE',
    moduleKey: ModuleKeys.STATUS,
    actionKey: ActionKeys.BotTest,
    level: PermissionLevels.ADMIN,
    examples: ['/bot version', '/bot info', '/bot invite', '/bot test']
  },

  // Moderation, Cases, Notes, Temp Roles, Lockdown
  {
    name: 'mod',
    command: '/mod',
    syntax: '/mod <warn|timeout|untimeout|kick|ban|unban|massban|panel>',
    description: 'Staff moderation suite for managing infractions, timeouts, kicks, and bans.',
    category: 'CORE',
    moduleKey: ModuleKeys.MODERATION,
    actionKey: ActionKeys.ModerationPanel,
    level: PermissionLevels.MODERATOR,
    examples: ['/mod warn user:@badactor reason:Spamming', '/mod timeout user:@member duration:1h reason:Disruptive', '/mod ban user:@troll reason:Raiding']
  },
  {
    name: 'case',
    command: '/case',
    syntax: '/case <panel|view|user|close|reopen>',
    description: 'Inspect, manage, and close moderation infraction cases.',
    category: 'CORE',
    moduleKey: ModuleKeys.MODERATION,
    actionKey: ActionKeys.CasesView,
    level: PermissionLevels.MODERATOR,
    examples: ['/case view case_number:12', '/case user user:@member', '/case close case_number:12 reason:Resolved']
  },
  {
    name: 'note',
    command: '/note',
    syntax: '/note <add|list|remove>',
    description: 'Manage private staff notes attached to server members.',
    category: 'CORE',
    moduleKey: ModuleKeys.MODERATION,
    actionKey: ActionKeys.UserNotesView,
    level: PermissionLevels.MODERATOR,
    examples: ['/note add user:@member note:Given verbal warning in ticket #45', '/note list user:@member']
  },
  {
    name: 'temp-role',
    command: '/temp-role',
    syntax: '/temp-role <add|remove|list|active>',
    description: 'Assign a role to a member for a temporary duration (e.g. 7d, 24h).',
    category: 'CORE',
    moduleKey: ModuleKeys.TEMP_ROLES,
    actionKey: ActionKeys.TempRolesAdd,
    level: PermissionLevels.MODERATOR,
    examples: ['/temp-role add user:@member role:@VIP duration:7d reason:Nitro Booster', '/temp-role list']
  },
  {
    name: 'lockdown',
    command: '/lockdown',
    syntax: '/lockdown <start|end|manager|setup|channel-add|channel-remove>',
    description: 'Instantly lock down channels during emergencies and restore permissions cleanly.',
    category: 'CORE',
    moduleKey: ModuleKeys.LOCKDOWN,
    actionKey: ActionKeys.LockdownManage,
    level: PermissionLevels.ADMIN,
    examples: ['/lockdown start preset:Emergency', '/lockdown end', '/lockdown manager']
  },

  // Utility
  {
    name: 'purge',
    command: '/purge',
    syntax: '/purge <amount> [user] [match]',
    description: 'Bulk delete up to 100 recent messages with optional user and keyword filters.',
    category: 'CORE',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityPurge,
    level: PermissionLevels.MODERATOR,
    examples: ['/purge amount:50', '/purge amount:100 user:@spammer', '/purge amount:25 match:discord.gg']
  },
  {
    name: 'poll',
    command: '/poll',
    syntax: '/poll <create|close|results>',
    description: 'Launch interactive community polls with single/multiple votes and custom durations.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityPolls,
    level: PermissionLevels.EVERYONE,
    examples: ['/poll create question:"Game night choice?" option_1:AmongUs option_2:Valorant duration:24h']
  },
  {
    name: 'remind',
    command: '/remind',
    syntax: '/remind <set|list|cancel>',
    description: 'Schedule persistent reminders delivered via DM or channel.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityReminders,
    level: PermissionLevels.EVERYONE,
    examples: ['/remind set duration:2h message:"Submit tournament roster"', '/remind list']
  },
  {
    name: 'afk',
    command: '/afk',
    syntax: '/afk [message]',
    description: 'Set your AFK status. SlickBot automatically notifies members who ping you.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityAfk,
    level: PermissionLevels.EVERYONE,
    examples: ['/afk message:"Studying for exams"', '/afk']
  },
  {
    name: 'snipe',
    command: '/snipe',
    syntax: '/snipe [channel]',
    description: 'View the most recently deleted message in a channel.',
    category: 'CORE',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilitySnipe,
    level: PermissionLevels.MODERATOR,
    examples: ['/snipe', '/snipe channel:#general']
  },
  {
    name: 'userinfo',
    command: '/userinfo',
    syntax: '/userinfo [user]',
    description: 'View detailed account age, join date, roles, and status for a member.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityInfo,
    level: PermissionLevels.EVERYONE,
    examples: ['/userinfo', '/userinfo user:@member']
  },
  {
    name: 'serverinfo',
    command: '/serverinfo',
    syntax: '/serverinfo',
    description: 'View comprehensive guild statistics, boost tier, channel counts, and owner info.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityInfo,
    level: PermissionLevels.EVERYONE,
    examples: ['/serverinfo']
  },
  {
    name: 'emojis',
    command: '/emojis',
    syntax: '/emojis [page]',
    description: 'Browse all static and animated custom emojis available on this server with slot stats.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityInfo,
    level: PermissionLevels.EVERYONE,
    examples: ['/emojis', '/emojis page:2']
  },
  {
    name: 'stickers',
    command: '/stickers',
    syntax: '/stickers [page]',
    description: 'Browse all custom server stickers with format types, descriptions, tags, and asset previews.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.UTILITY,
    actionKey: ActionKeys.UtilityInfo,
    level: PermissionLevels.EVERYONE,
    examples: ['/stickers', '/stickers page:2']
  },

  // Support
  {
    name: 'ticket',
    command: '/ticket',
    syntax: '/ticket <open|manager|setup|panel|claim|close|priority|escalate>',
    description: 'Comprehensive support ticket system with custom intake questions and transcripts.',
    category: 'SUPPORT',
    moduleKey: ModuleKeys.TICKETS,
    actionKey: ActionKeys.TicketsOpen,
    level: PermissionLevels.EVERYONE,
    examples: ['/ticket open', '/ticket manager', '/ticket close reason:"Issue resolved"']
  },
  {
    name: 'report',
    command: '/report',
    syntax: '/report <user|message|manager|setup|panel|review-index>',
    description: 'Submit private reports to staff with message context or inspect incoming reports.',
    category: 'SUPPORT',
    moduleKey: ModuleKeys.REPORTS,
    actionKey: ActionKeys.ReportsSubmit,
    level: PermissionLevels.EVERYONE,
    examples: ['/report user user:@violator reason:"DM advertising"', '/report manager']
  },
  {
    name: 'application',
    command: '/application',
    syntax: '/application <apply|manager|setup|question-add|panel|review-index>',
    description: 'Interactive step-by-step DM application builder with timeout limits and staff review.',
    category: 'SUPPORT',
    moduleKey: ModuleKeys.APPLICATIONS,
    actionKey: ActionKeys.ApplicationsApply,
    level: PermissionLevels.EVERYONE,
    examples: ['/application apply type:Staff', '/application manager']
  },
  {
    name: 'appeal',
    command: '/appeal',
    syntax: '/appeal <submit|manager|setup|edit|panel|review-index>',
    description: 'Ban and punishment appeal submission system with decision notifications.',
    category: 'SUPPORT',
    moduleKey: ModuleKeys.APPEALS,
    actionKey: ActionKeys.AppealsSubmit,
    level: PermissionLevels.EVERYONE,
    examples: ['/appeal submit', '/appeal manager']
  },

  // Community
  {
    name: 'welcome',
    command: '/welcome',
    syntax: '/welcome <manager|setup|auto-role-add|auto-role-remove|test>',
    description: 'Custom welcome cards, join embeds, dynamic placeholders, and auto-roles.',
    category: 'COMMUNITY',
    moduleKey: ModuleKeys.WELCOME,
    actionKey: ActionKeys.WelcomeConfigure,
    level: PermissionLevels.ADMIN,
    examples: ['/welcome manager', '/welcome test']
  },
  {
    name: 'roles',
    command: '/roles',
    syntax: '/roles <manager|create-panel|add-option|post-panel|list>',
    description: 'Create interactive button, dropdown, and reaction self-assignable role panels.',
    category: 'COMMUNITY',
    moduleKey: ModuleKeys.REACTION_ROLES,
    actionKey: ActionKeys.RolePanelsConfigure,
    level: PermissionLevels.ADMIN,
    examples: ['/roles manager', '/roles create-panel title:"Color Roles"', '/roles post-panel']
  },
  {
    name: 'giveaway',
    command: '/giveaway',
    syntax: '/giveaway <start|end|reroll|list|manager|setup>',
    description: 'Timed giveaway creator with role requirements, entry buttons, and winner picking.',
    category: 'COMMUNITY',
    moduleKey: ModuleKeys.GIVEAWAYS,
    actionKey: ActionKeys.GiveawaysCreate,
    level: PermissionLevels.MODERATOR,
    examples: ['/giveaway start duration:24h winners:2 prize:"Discord Nitro"', '/giveaway reroll message_id:123456']
  },
  {
    name: 'birthday',
    command: '/birthday',
    syntax: '/birthday <set|view|remove|manager|setup|test>',
    description: 'Register birthdays with timezones, automated birthday roles, and greetings.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.BIRTHDAYS,
    actionKey: ActionKeys.BirthdaysUse,
    level: PermissionLevels.EVERYONE,
    examples: ['/birthday set month:8 day:22 timezone:"America/New_York"', '/birthday view']
  },
  {
    name: 'level',
    command: '/level',
    syntax: '/level <rank|leaderboard|info|manager|setup|set-xp|reset>',
    description: 'Text and voice XP leveling system with reward roles, multipliers, and rank cards.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.LEVELING,
    actionKey: ActionKeys.LevelingUse,
    level: PermissionLevels.EVERYONE,
    examples: ['/level rank', '/level leaderboard', '/level info']
  },
  {
    name: 'games',
    command: '/games',
    syntax: '/games <counting|tic-tac-toe|connect-four|manager|panel>',
    description: 'Interactive multiplayer games including Counting, Tic-Tac-Toe, and Connect 4.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.COMMUNITY_GAMES,
    actionKey: ActionKeys.GamesPlay,
    level: PermissionLevels.EVERYONE,
    examples: ['/games tic-tac-toe challenge opponent:@friend', '/games counting leaderboard']
  },
  {
    name: 'faq',
    command: '/faq',
    syntax: '/faq <answer|status|panel|setup|edit|refresh>',
    description: 'Community knowledge base forum with fast-response search and master index thread.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.FAQ,
    actionKey: ActionKeys.FaqAnswer,
    level: PermissionLevels.EVERYONE,
    examples: ['/faq answer query:"How to link account"', '/faq status']
  },
  {
    name: 'suggestion',
    command: '/suggestion',
    syntax: '/suggestion <submit|view|panel|review-index|setup|status>',
    description: 'Community suggestion box with voting reactions, approval states, and review indexes.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.SUGGESTIONS,
    actionKey: ActionKeys.SuggestionsSubmit,
    level: PermissionLevels.EVERYONE,
    examples: ['/suggestion submit title:"Add custom emotes" description:"More server emojis"', '/suggestion review-index']
  },
  {
    name: 'referral',
    command: '/referral',
    syntax: '/referral <submit|leaderboard|status|manager|setup>',
    description: 'Track member invites and referral rewards with lifetime leaderboards.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.REFERRALS,
    actionKey: ActionKeys.ReferralsSubmit,
    level: PermissionLevels.EVERYONE,
    examples: ['/referral submit referrer:@friend', '/referral leaderboard']
  },
  {
    name: 'achievement',
    command: '/achievement',
    syntax: '/achievement <profile|list|leaderboard|manager|setup>',
    description: 'Automatic badge unlock system for voice time, messages, games, and boosts.',
    category: 'MEMBER',
    moduleKey: ModuleKeys.ACHIEVEMENTS,
    actionKey: ActionKeys.AchievementsUse,
    level: PermissionLevels.EVERYONE,
    examples: ['/achievement profile', '/achievement list', '/achievement leaderboard']
  },
  {
    name: 'join-create',
    command: '/join-create',
    syntax: '/join-create <setup|create-hub|panel|list|delete|cleanup>',
    description: 'Dynamic temporary voice channel generator with owner management controls.',
    category: 'COMMUNITY',
    moduleKey: ModuleKeys.JOIN_TO_CREATE,
    actionKey: ActionKeys.JoinCreateSetup,
    level: PermissionLevels.ADMIN,
    examples: ['/join-create setup', '/join-create create-hub channel:#hub-voice']
  },

  // Automation
  {
    name: 'stats',
    command: '/stats',
    syntax: '/stats <manager|setup|refresh>',
    description: 'Dynamic voice counter channels displaying members, bots, roles, and voice counts.',
    category: 'AUTOMATION',
    moduleKey: ModuleKeys.SERVER_STATS,
    actionKey: ActionKeys.ServerStatsConfigure,
    level: PermissionLevels.ADMIN,
    examples: ['/stats manager', '/stats setup', '/stats refresh']
  },
  {
    name: 'custom-command',
    command: '/custom-command',
    syntax: '/custom-command <create|edit|delete|panel|list|enable|disable|prefix>',
    description: 'Custom response commands triggered by slash or custom text prefix (!cmd).',
    category: 'AUTOMATION',
    moduleKey: ModuleKeys.CUSTOM_COMMANDS,
    actionKey: ActionKeys.CustomCommandsCreate,
    level: PermissionLevels.ADMIN,
    examples: ['/custom-command create name:rules response:"Please follow our server rules."', '/custom-command list']
  },
  {
    name: 'schedule',
    command: '/schedule',
    syntax: '/schedule <create|list|manager|cancel|send-now|setup>',
    description: 'Recurring or one-time automated announcements delivered to designated channels.',
    category: 'AUTOMATION',
    moduleKey: ModuleKeys.SCHEDULED_MESSAGES,
    actionKey: ActionKeys.ScheduledMessagesCreate,
    level: PermissionLevels.ADMIN,
    examples: ['/schedule create name:EventAlert channel:#announcements cron:"0 18 * * 5" message:"Weekend event begins now!"']
  },
  {
    name: 'bot-updates',
    command: '/bot-updates',
    syntax: '/bot-updates <panel|setup|channel|roles|send|preview>',
    description: 'Automatic changelog broadcasting system for new SlickBot features and fixes.',
    category: 'AUTOMATION',
    moduleKey: ModuleKeys.BOT_UPDATES,
    actionKey: ActionKeys.BotUpdatesConfigure,
    level: PermissionLevels.ADMIN,
    examples: ['/bot-updates panel', '/bot-updates setup channel:#bot-news']
  },
  {
    name: 'feed',
    command: '/feed',
    syntax: '/feed <setup|add|edit|remove|list|subscribe|unsubscribe|my-alerts|directory|test|check|manager|reset>',
    description: 'Automated social media notifications, live streamer directory hub, and per-creator alert subscriptions for Twitch and YouTube.',
    category: 'AUTOMATION',
    moduleKey: ModuleKeys.SOCIAL_FEEDS,
    actionKey: ActionKeys.FeedsManage,
    level: PermissionLevels.ADMIN,
    examples: [
      '/feed add platform:Twitch account:ninja member:@User channel:#live-streams',
      '/feed directory action:Post Directory channel:#streams',
      '/feed subscribe feed:"Twitch - Ninja"',
      '/feed my-alerts',
      '/feed list'
    ]
  },
  {
    name: 'automod',
    command: '/automod',
    syntax: '/automod <manager|status|rule|blacklist-add|blacklist-remove|blacklist-list|whitelist-add|whitelist-remove|raid|reset>',
    description: 'Automated spam filtering, invite/link blocking, mass mention limits, custom word blacklists, and anti-raid join velocity monitoring with moderator lockdown prompts.',
    category: 'CORE',
    moduleKey: ModuleKeys.AUTOMOD,
    actionKey: ActionKeys.AutoModManage,
    level: PermissionLevels.SENIOR_MODERATOR,
    examples: [
      '/automod manager',
      '/automod rule filter:"Anti-Invites" enabled:true action:"Delete Message"',
      '/automod blacklist-add pattern:"scam-link" match_type:"Exact Word Match" action:"Timeout Member & Delete"',
      '/automod whitelist-add category:"Role Exemption" value:@VIP',
      '/automod raid enabled:true join_threshold:8 join_seconds:10'
    ]
  }
]);

function moduleLabel(moduleKey) {
  return MODULE_LABELS[moduleKey] || moduleKey;
}

function getPermissionBadge(level) {
  if (level === PermissionLevels.EVERYONE) return '`🟢 Everyone`';
  if (level === PermissionLevels.MODERATOR) return '`🛡️ Moderator`';
  if (level === PermissionLevels.SENIOR_MODERATOR) return '`⚔️ Sr Mod`';
  if (level === PermissionLevels.ADMIN) return '`⚙️ Server Admin`';
  if (level === PermissionLevels.OWNER) return '`👑 Server Owner`';
  if (level === PermissionLevels.BOT_OWNER) return '`🤖 Bot Owner`';
  return '`Staff`';
}

function getHelpAutocomplete(focusedOption, value, { isBotOwner = false } = {}) {
  const queryText = String(value || '').trim().toLowerCase();

  if (focusedOption === 'command') {
    return HELP_CATALOG
      .filter((cmd) => isBotOwner || cmd.level !== PermissionLevels.BOT_OWNER)
      .filter((cmd) => cmd.name.toLowerCase().includes(queryText) || cmd.command.toLowerCase().includes(queryText))
      .slice(0, 25)
      .map((cmd) => ({
        name: `${cmd.command} — ${cmd.description}`.slice(0, 100),
        value: cmd.name
      }));
  }

  if (focusedOption === 'module') {
    return Object.entries(MODULE_LABELS)
      .filter(([key]) => isBotOwner || key !== ModuleKeys.STATUS)
      .filter(([key, label]) => key.toLowerCase().includes(queryText) || label.toLowerCase().includes(queryText))
      .slice(0, 25)
      .map(([key, label]) => ({
        name: `${label} (${key})`.slice(0, 100),
        value: key
      }));
  }

  return [];
}

function buildCommandHelpPayload(commandName, { isBotOwner = false } = {}) {
  const name = String(commandName || '').replace(/^\/+/, '').trim().toLowerCase();
  const cmd = HELP_CATALOG.find((entry) => (isBotOwner || entry.level !== PermissionLevels.BOT_OWNER) && (entry.name.toLowerCase() === name || entry.command.toLowerCase().includes(name)));

  if (!cmd) {
    return {
      embeds: [
        createBaseEmbed({
          title: 'Command Not Found',
          description: `No command documentation found for **\`${commandName}\`**.\nRun \`/help\` to browse all available commands.`,
          color: SlickBotColors.WARNING,
          footer: 'SlickBot Help'
        })
      ],
      components: [
        createButtonRow([
          createPanelButton(CustomIds.HelpRefresh, 'All Commands', ButtonStyle.Primary, '📖'),
          createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
        ])
      ]
    };
  }

  const optionsLines = Array.isArray(cmd.options) && cmd.options.length > 0
    ? cmd.options.map((opt) => `• \`${opt.name}\`${opt.required ? ' *(Required)*' : ' *(Optional)*'} — ${opt.description}`).join('\n')
    : '*No special options or subcommands.*';

  const exampleLines = Array.isArray(cmd.examples) && cmd.examples.length > 0
    ? cmd.examples.map((ex) => `\`${ex}\``).join('\n')
    : `\`${cmd.syntax}\``;

  const embed = createBaseEmbed({
    title: `Command Help • ${cmd.command}`,
    description: [
      `**Description:** ${cmd.description}`,
      `**Required Access:** ${getPermissionBadge(cmd.level)}`,
      `**Module:** **${moduleLabel(cmd.moduleKey)}** (\`${cmd.moduleKey}\`)`,
      '',
      '**Syntax**',
      `\`\`\`text\n${cmd.syntax}\n\`\`\``,
      '**Options & Arguments**',
      optionsLines,
      '',
      '**Examples**',
      exampleLines
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Help • ${moduleLabel(cmd.moduleKey)}`
  });

  const buttons = [
    createPanelButton(`${CustomIds.OnboardingModulePrefix}${cmd.moduleKey}`, 'Quick Setup', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.HelpRefresh, 'All Commands', ButtonStyle.Primary, '📖'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ];

  return { embeds: [embed], components: [createButtonRow(buttons)] };
}

function buildModuleHelpPayload(moduleKey, { isBotOwner = false } = {}) {
  const key = String(moduleKey || '').toUpperCase().trim();
  if (key === ModuleKeys.STATUS && !isBotOwner) {
    return {
      embeds: [
        createBaseEmbed({
          title: 'Module Not Found',
          description: `No module documentation found for **\`${moduleKey}\`**.\nRun \`/help\` to browse all available modules.`,
          color: SlickBotColors.WARNING,
          footer: 'SlickBot Help'
        })
      ],
      components: [
        createButtonRow([
          createPanelButton(CustomIds.HelpRefresh, 'All Commands', ButtonStyle.Primary, '📖'),
          createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
        ])
      ]
    };
  }

  const commands = HELP_CATALOG
    .filter((cmd) => isBotOwner || cmd.level !== PermissionLevels.BOT_OWNER)
    .filter((cmd) => cmd.moduleKey === key);

  if (!commands.length) {
    return {
      embeds: [
        createBaseEmbed({
          title: 'Module Not Found',
          description: `No module documentation found for **\`${moduleKey}\`**.\nRun \`/help\` to browse all available modules.`,
          color: SlickBotColors.WARNING,
          footer: 'SlickBot Help'
        })
      ],
      components: [
        createButtonRow([
          createPanelButton(CustomIds.HelpRefresh, 'All Commands', ButtonStyle.Primary, '📖'),
          createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
        ])
      ]
    };
  }

  const cmdLines = commands.map((c) => `• \`${c.command}\` — ${c.description} (${getPermissionBadge(c.level)})`).join('\n\n');

  const embed = createBaseEmbed({
    title: `Module Guide • ${moduleLabel(key)}`,
    description: [
      `**Module Key:** \`${key}\``,
      `**Total Commands:** **${commands.length}**`,
      '',
      '**Commands in this Module**',
      cmdLines,
      '',
      'Use `/help command:<name>` for detailed option parameters and copy-paste examples.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Help • ${moduleLabel(key)}`
  });

  const buttons = [
    createPanelButton(`${CustomIds.OnboardingModulePrefix}${key}`, 'Guided Setup', ButtonStyle.Success, '🚀'),
    createPanelButton(CustomIds.HelpRefresh, 'Help Menu', ButtonStyle.Secondary, '📖'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ];

  return { embeds: [embed], components: [createButtonRow(buttons)] };
}

const PAGE_SIZE = 6;

function buildCategoryHelpPayload(categoryKey = 'MEMBER', mode = 'member', page = 1, { isBotOwner = false } = {}) {
  let filtered = HELP_CATALOG.filter((cmd) => isBotOwner || cmd.level !== PermissionLevels.BOT_OWNER);

  if (categoryKey && categoryKey !== 'ALL') {
    filtered = filtered.filter((cmd) => cmd.category === categoryKey);
  }

  if (mode === 'member') {
    filtered = filtered.filter((cmd) => cmd.level === PermissionLevels.EVERYONE);
  } else if (mode === 'staff') {
    filtered = filtered.filter((cmd) => cmd.level !== PermissionLevels.EVERYONE);
  }

  const categoryDef = HELP_CATEGORIES.find((c) => c.key === categoryKey) || { label: 'All Commands', emoji: '📚' };
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const lines = pageItems.map((cmd) => `• \`${cmd.command}\` — ${cmd.description} ${getPermissionBadge(cmd.level)}`).join('\n\n');

  const modeLabel = mode === 'member' ? 'Member Commands' : mode === 'staff' ? 'Staff & Admin Commands' : 'All Category Commands';

  const embed = createBaseEmbed({
    title: `SlickBot Help • ${categoryDef.emoji} ${categoryDef.label}`,
    description: [
      categoryDef.description ? `*${categoryDef.description}*\n` : '',
      `**Filter:** ${modeLabel} • **Page ${currentPage} of ${totalPages}** (${filtered.length} total commands)`,
      '',
      lines || '*No commands found for this view.*',
      '',
      '💡 *Tip: Use `/help command:<name>` to inspect full argument syntax and examples.*'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Knowledge Center • Page ${currentPage} / ${totalPages}`
  });

  const catOptions = HELP_CATEGORIES.map((cat) => ({
    label: cat.label,
    value: cat.key,
    description: cat.description.slice(0, 100),
    emoji: cat.emoji,
    default: cat.key === categoryKey
  }));

  const selectRow = createSelectRow(CustomIds.HelpCategorySelect, 'Browse command categories...', catOptions);

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CustomIds.HelpPagePrefix}${categoryKey || 'ALL'}:${mode}:${currentPage - 1}`)
      .setLabel('Previous')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId('slickbot:help:page_indicator')
      .setLabel(`Page ${currentPage} of ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${CustomIds.HelpPagePrefix}${categoryKey || 'ALL'}:${mode}:${currentPage + 1}`)
      .setLabel('Next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages),
    new ButtonBuilder()
      .setCustomId(CustomIds.HelpSearchBtn)
      .setLabel('Search')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Primary)
  );

  const filterRow = createButtonRow([
    createPanelButton(`${CustomIds.HelpModePrefix}${categoryKey || 'MEMBER'}:member`, 'Member View', mode === 'member' ? ButtonStyle.Primary : ButtonStyle.Secondary, '✨'),
    createPanelButton(`${CustomIds.HelpModePrefix}${categoryKey || 'MEMBER'}:staff`, 'Staff View', mode === 'staff' ? ButtonStyle.Primary : ButtonStyle.Secondary, '🛡️'),
    createPanelButton(`${CustomIds.HelpModePrefix}${categoryKey || 'MEMBER'}:all`, 'All Commands', mode === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary, '📚'),
    createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
  ]);

  return { embeds: [embed], components: [selectRow, navRow, filterRow] };
}

async function buildHelpPayload(interaction, ctx, options = {}) {
  const isBotOwner = options.isBotOwner ?? (ctx?.permissions ? ctx.permissions.isBotOwner(interaction.user.id) : false);
  const commandArg = interaction.options?.getString?.('command');
  const moduleArg = interaction.options?.getString?.('module');

  if (commandArg) {
    return buildCommandHelpPayload(commandArg, { isBotOwner });
  }

  if (moduleArg) {
    return buildModuleHelpPayload(moduleArg, { isBotOwner });
  }

  // Default interactive view
  return buildCategoryHelpPayload('MEMBER', 'member', 1, { isBotOwner });
}

function buildHelpSearchModal() {
  return new ModalBuilder()
    .setCustomId(CustomIds.HelpSearchModalSubmit)
    .setTitle('Search SlickBot Commands')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Keyword or Command Name')
          .setPlaceholder('e.g. purge, tickets, rank, xp, role, giveaway')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(50)
      )
    );
}

function handleHelpSearch(query, { isBotOwner = false } = {}) {
  const text = String(query || '').trim().toLowerCase();
  const matches = HELP_CATALOG
    .filter((cmd) => isBotOwner || cmd.level !== PermissionLevels.BOT_OWNER)
    .filter((cmd) =>
      cmd.name.toLowerCase().includes(text) ||
      cmd.command.toLowerCase().includes(text) ||
      cmd.description.toLowerCase().includes(text) ||
      moduleLabel(cmd.moduleKey).toLowerCase().includes(text)
    ).slice(0, 15);

  if (!matches.length) {
    return {
      embeds: [
        createBaseEmbed({
          title: `Search Results • "${query}"`,
          description: `No commands matched **"${query}"**.\nUse \`/help\` to browse categories or check your spelling.`,
          color: SlickBotColors.WARNING,
          footer: 'SlickBot Help'
        })
      ],
      components: [
        createButtonRow([
          createPanelButton(CustomIds.HelpRefresh, 'All Commands', ButtonStyle.Primary, '📖'),
          createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
        ])
      ]
    };
  }

  const lines = matches.map((cmd) => `• \`${cmd.command}\` — ${cmd.description} (${getPermissionBadge(cmd.level)})`).join('\n\n');

  const embed = createBaseEmbed({
    title: `Search Results • "${query}"`,
    description: [
      `Found **${matches.length}** matching command(s):`,
      '',
      lines,
      '',
      'Use `/help command:<name>` for full options and examples.'
    ].join('\n'),
    color: SlickBotColors.PRIMARY,
    footer: `SlickBot Help • Search for "${query}"`
  });

  return {
    embeds: [embed],
    components: [
      createButtonRow([
        createPanelButton(CustomIds.HelpRefresh, 'Help Menu', ButtonStyle.Secondary, '📖'),
        createPanelButton(CustomIds.SetupRefresh, 'Setup Center', ButtonStyle.Secondary, '⚙️')
      ])
    ]
  };
}

module.exports = {
  MODULE_LABELS,
  HELP_CATEGORIES,
  HELP_CATALOG,
  getHelpAutocomplete,
  buildCommandHelpPayload,
  buildModuleHelpPayload,
  buildCategoryHelpPayload,
  buildHelpPayload,
  buildHelpSearchModal,
  handleHelpSearch
};
