const { ModuleKeys } = require('../moduleRegistry');

const ActionKeys = Object.freeze({
  BotPing: 'bot.ping',
  BotVersion: 'bot.version',
  BotTest: 'bot.test',
  Setup: 'setup.run',
  TeamsManage: 'permissions.teams.manage',
  PermissionsPanel: 'permissions.panel',
  PermissionsManage: 'permissions.manage',
  PermissionsIgnore: 'permissions.ignore',
  ModulesManage: 'permissions.modules.manage',
  LoggingConfigure: 'logging.configure',
  LoggingView: 'logging.view',
  StatusView: 'status.view',
  StatusManage: 'status.manage',

  ModerationPanel: 'moderation.panel',
  ModerationWarn: 'moderation.warn',
  ModerationTimeout: 'moderation.timeout',
  ModerationUntimeout: 'moderation.untimeout',
  ModerationKick: 'moderation.kick',
  ModerationBan: 'moderation.ban',
  ModerationUnban: 'moderation.unban',
  ModerationMassBan: 'moderation.massban',
  CasesView: 'cases.view',
  CasesManage: 'cases.manage',
  UserNotesView: 'user-notes.view',
  UserNotesManage: 'user-notes.manage',

  TicketsOpen: 'tickets.open',
  TicketsManager: 'tickets.manager',
  TicketsPostPanel: 'tickets.panel.post',
  TicketsConfigure: 'tickets.configure',
  TicketsPanel: 'tickets.panel',
  TicketsManage: 'tickets.manage',
  TicketsClaim: 'tickets.claim',
  TicketsClose: 'tickets.close',

  ReportsSubmit: 'reports.submit',
  ReportsManager: 'reports.manager',
  ReportsPostPanel: 'reports.panel.post',
  ReportsConfigure: 'reports.configure',
  ReportsPanel: 'reports.panel',
  ReportsReview: 'reports.review',
  ReportsClaim: 'reports.claim',
  ReportsResolve: 'reports.resolve',
  ReportsDismiss: 'reports.dismiss',
  ReportsOpenTicket: 'reports.open-ticket',

  ApplicationsApply: 'applications.apply',
  ApplicationsManager: 'applications.manager',
  ApplicationsPostPanel: 'applications.panel.post',
  ApplicationsConfigure: 'applications.configure',
  ApplicationsPanel: 'applications.panel',
  ApplicationsReview: 'applications.review',
  ApplicationsApprove: 'applications.approve',
  ApplicationsDeny: 'applications.deny',

  AppealsSubmit: 'appeals.submit',
  AppealsManager: 'appeals.manager',
  AppealsPostPanel: 'appeals.panel.post',
  AppealsConfigure: 'appeals.configure',
  AppealsPanel: 'appeals.panel',
  AppealsReview: 'appeals.review',
  AppealsApprove: 'appeals.approve',
  AppealsDeny: 'appeals.deny',

  WelcomeView: 'welcome.view',
  WelcomeConfigure: 'welcome.configure',
  WelcomeTest: 'welcome.test',

  RolePanelsView: 'reaction-roles.view',
  RolePanelsConfigure: 'reaction-roles.configure',
  RolePanelsPost: 'reaction-roles.panel.post',
  RolePanelsUse: 'reaction-roles.use',

  GiveawaysView: 'giveaways.view',
  GiveawaysConfigure: 'giveaways.configure',
  GiveawaysCreate: 'giveaways.create',
  GiveawaysEnd: 'giveaways.end',
  GiveawaysReroll: 'giveaways.reroll',
  GiveawaysEnter: 'giveaways.enter',

  BirthdaysUse: 'birthdays.use',
  BirthdaysView: 'birthdays.view',
  BirthdaysConfigure: 'birthdays.configure',

  ScheduledMessagesView: 'scheduled-messages.view',
  ScheduledMessagesConfigure: 'scheduled-messages.configure',
  ScheduledMessagesCreate: 'scheduled-messages.create',
  ScheduledMessagesCancel: 'scheduled-messages.cancel',
  ScheduledMessagesSendNow: 'scheduled-messages.send-now',

  ServerStatsView: 'server-stats.view',
  ServerStatsConfigure: 'server-stats.configure',
  ServerStatsRefresh: 'server-stats.refresh',

  BotUpdatesView: 'bot-updates.view',
  BotUpdatesConfigure: 'bot-updates.configure',
  BotUpdatesSend: 'bot-updates.send',

  CustomCommandsUse: 'custom-commands.use',
  CustomCommandsView: 'custom-commands.view',
  CustomCommandsCreate: 'custom-commands.create',
  CustomCommandsEdit: 'custom-commands.edit',
  CustomCommandsDelete: 'custom-commands.delete',
  CustomCommandsEnable: 'custom-commands.enable',

  JoinCreateView: 'join-create.view',
  JoinCreateSetup: 'join-create.setup',
  JoinCreateEdit: 'join-create.edit',
  JoinCreateDelete: 'join-create.delete',
  JoinCreateCleanup: 'join-create.cleanup',
  TempVoiceManage: 'join-create.temp.manage',

  LevelingUse: 'leveling.use',
  LevelingView: 'leveling.view',
  LevelingConfigure: 'leveling.configure',
  LevelingAdjust: 'leveling.adjust',

  PanelsConfigure: 'panels.configure',

  ServerReset: 'server.reset'
});

const PermissionLevels = Object.freeze({
  EVERYONE: 'EVERYONE',
  MODERATOR: 'MODERATOR',
  SENIOR_MODERATOR: 'SENIOR_MODERATOR',
  OWNER: 'OWNER'
});

const permissionLevelRank = Object.freeze({
  EVERYONE: 0,
  MODERATOR: 1,
  SENIOR_MODERATOR: 2,
  OWNER: 3
});

const defaultActionLevels = Object.freeze({
  [ActionKeys.BotPing]: PermissionLevels.EVERYONE,
  [ActionKeys.BotVersion]: PermissionLevels.EVERYONE,
  [ActionKeys.BotTest]: PermissionLevels.MODERATOR,

  [ActionKeys.Setup]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.TeamsManage]: PermissionLevels.OWNER,
  [ActionKeys.PermissionsPanel]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.PermissionsManage]: PermissionLevels.OWNER,
  [ActionKeys.PermissionsIgnore]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ModulesManage]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.LoggingView]: PermissionLevels.MODERATOR,
  [ActionKeys.LoggingConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.StatusView]: PermissionLevels.MODERATOR,
  [ActionKeys.StatusManage]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.ModerationPanel]: PermissionLevels.MODERATOR,
  [ActionKeys.ModerationWarn]: PermissionLevels.MODERATOR,
  [ActionKeys.ModerationTimeout]: PermissionLevels.MODERATOR,
  [ActionKeys.ModerationUntimeout]: PermissionLevels.MODERATOR,
  [ActionKeys.ModerationKick]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ModerationBan]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ModerationUnban]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ModerationMassBan]: PermissionLevels.OWNER,
  [ActionKeys.CasesView]: PermissionLevels.MODERATOR,
  [ActionKeys.CasesManage]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.UserNotesView]: PermissionLevels.MODERATOR,
  [ActionKeys.UserNotesManage]: PermissionLevels.MODERATOR,

  [ActionKeys.TicketsOpen]: PermissionLevels.EVERYONE,
  [ActionKeys.TicketsPanel]: PermissionLevels.MODERATOR,
  [ActionKeys.TicketsManager]: PermissionLevels.MODERATOR,
  [ActionKeys.TicketsPostPanel]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.TicketsConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.TicketsManage]: PermissionLevels.MODERATOR,
  [ActionKeys.TicketsClaim]: PermissionLevels.MODERATOR,
  [ActionKeys.TicketsClose]: PermissionLevels.MODERATOR,

  [ActionKeys.ReportsSubmit]: PermissionLevels.EVERYONE,
  [ActionKeys.ReportsPanel]: PermissionLevels.MODERATOR,
  [ActionKeys.ReportsManager]: PermissionLevels.MODERATOR,
  [ActionKeys.ReportsPostPanel]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ReportsConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ReportsReview]: PermissionLevels.MODERATOR,
  [ActionKeys.ReportsClaim]: PermissionLevels.MODERATOR,
  [ActionKeys.ReportsResolve]: PermissionLevels.MODERATOR,
  [ActionKeys.ReportsDismiss]: PermissionLevels.MODERATOR,
  [ActionKeys.ReportsOpenTicket]: PermissionLevels.MODERATOR,

  [ActionKeys.ApplicationsApply]: PermissionLevels.EVERYONE,
  [ActionKeys.ApplicationsPanel]: PermissionLevels.MODERATOR,
  [ActionKeys.ApplicationsManager]: PermissionLevels.MODERATOR,
  [ActionKeys.ApplicationsPostPanel]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ApplicationsConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ApplicationsReview]: PermissionLevels.MODERATOR,
  [ActionKeys.ApplicationsApprove]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ApplicationsDeny]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.AppealsSubmit]: PermissionLevels.EVERYONE,
  [ActionKeys.AppealsPanel]: PermissionLevels.MODERATOR,
  [ActionKeys.AppealsManager]: PermissionLevels.MODERATOR,
  [ActionKeys.AppealsPostPanel]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.AppealsConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.AppealsReview]: PermissionLevels.MODERATOR,
  [ActionKeys.AppealsApprove]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.AppealsDeny]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.WelcomeView]: PermissionLevels.MODERATOR,
  [ActionKeys.WelcomeConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.WelcomeTest]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.RolePanelsView]: PermissionLevels.MODERATOR,
  [ActionKeys.RolePanelsConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.RolePanelsPost]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.RolePanelsUse]: PermissionLevels.EVERYONE,
  [ActionKeys.PanelsConfigure]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.GiveawaysView]: PermissionLevels.MODERATOR,
  [ActionKeys.GiveawaysConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.GiveawaysCreate]: PermissionLevels.MODERATOR,
  [ActionKeys.GiveawaysEnd]: PermissionLevels.MODERATOR,
  [ActionKeys.GiveawaysReroll]: PermissionLevels.MODERATOR,
  [ActionKeys.GiveawaysEnter]: PermissionLevels.EVERYONE,

  [ActionKeys.BirthdaysUse]: PermissionLevels.EVERYONE,
  [ActionKeys.BirthdaysView]: PermissionLevels.MODERATOR,
  [ActionKeys.BirthdaysConfigure]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.ScheduledMessagesView]: PermissionLevels.MODERATOR,
  [ActionKeys.ScheduledMessagesConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ScheduledMessagesCreate]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ScheduledMessagesCancel]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ScheduledMessagesSendNow]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.ServerStatsView]: PermissionLevels.MODERATOR,
  [ActionKeys.ServerStatsConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ServerStatsRefresh]: PermissionLevels.MODERATOR,

  [ActionKeys.BotUpdatesView]: PermissionLevels.MODERATOR,
  [ActionKeys.BotUpdatesConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.BotUpdatesSend]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.CustomCommandsUse]: PermissionLevels.EVERYONE,
  [ActionKeys.CustomCommandsView]: PermissionLevels.MODERATOR,
  [ActionKeys.CustomCommandsCreate]: PermissionLevels.MODERATOR,
  [ActionKeys.CustomCommandsEdit]: PermissionLevels.MODERATOR,
  [ActionKeys.CustomCommandsDelete]: PermissionLevels.MODERATOR,
  [ActionKeys.CustomCommandsEnable]: PermissionLevels.MODERATOR,

  [ActionKeys.JoinCreateView]: PermissionLevels.MODERATOR,
  [ActionKeys.JoinCreateSetup]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.JoinCreateEdit]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.JoinCreateDelete]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.JoinCreateCleanup]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.TempVoiceManage]: PermissionLevels.EVERYONE,

  [ActionKeys.LevelingUse]: PermissionLevels.EVERYONE,
  [ActionKeys.LevelingView]: PermissionLevels.MODERATOR,
  [ActionKeys.LevelingConfigure]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.LevelingAdjust]: PermissionLevels.SENIOR_MODERATOR,

  [ActionKeys.ServerReset]: PermissionLevels.OWNER
});

const defaultModuleLevels = Object.freeze({
  [ModuleKeys.PERMISSIONS]: PermissionLevels.EVERYONE,
  [ModuleKeys.LOGGING]: PermissionLevels.MODERATOR,
  [ModuleKeys.STATUS]: PermissionLevels.MODERATOR,
  [ModuleKeys.MODERATION]: PermissionLevels.MODERATOR,
  [ModuleKeys.TICKETS]: PermissionLevels.EVERYONE,
  [ModuleKeys.REPORTS]: PermissionLevels.EVERYONE,
  [ModuleKeys.APPLICATIONS]: PermissionLevels.EVERYONE,
  [ModuleKeys.APPEALS]: PermissionLevels.EVERYONE,
  [ModuleKeys.SCHEDULED_MESSAGES]: PermissionLevels.SENIOR_MODERATOR,
  [ModuleKeys.WELCOME]: PermissionLevels.MODERATOR,
  [ModuleKeys.REACTION_ROLES]: PermissionLevels.EVERYONE,
  [ModuleKeys.GIVEAWAYS]: PermissionLevels.MODERATOR,
  [ModuleKeys.BIRTHDAYS]: PermissionLevels.EVERYONE,
  [ModuleKeys.LEVELING]: PermissionLevels.EVERYONE,
  [ModuleKeys.SERVER_STATS]: PermissionLevels.MODERATOR,
  [ModuleKeys.BOT_UPDATES]: PermissionLevels.MODERATOR,
  [ModuleKeys.CUSTOM_COMMANDS]: PermissionLevels.EVERYONE,
  [ModuleKeys.JOIN_TO_CREATE]: PermissionLevels.EVERYONE,
  [ModuleKeys.UTILITY]: PermissionLevels.EVERYONE
});

const defaultPublicActions = Object.freeze([
  ActionKeys.BotPing,
  ActionKeys.BotVersion,
  ActionKeys.TicketsOpen,
  ActionKeys.ReportsSubmit,
  ActionKeys.ApplicationsApply,
  ActionKeys.AppealsSubmit,
  ActionKeys.RolePanelsUse,
  ActionKeys.GiveawaysEnter,
  ActionKeys.BirthdaysUse,
  ActionKeys.LevelingUse,
  ActionKeys.CustomCommandsUse,
  ActionKeys.TempVoiceManage
]);

const defaultTeamPermissions = Object.freeze(Object.values(ActionKeys));

const PERMISSION_DEFAULTS_VERSION = '0.8.2';

module.exports = {
  ActionKeys,
  defaultTeamPermissions,
  PermissionLevels,
  permissionLevelRank,
  defaultActionLevels,
  defaultModuleLevels,
  defaultPublicActions,
  PERMISSION_DEFAULTS_VERSION
};
