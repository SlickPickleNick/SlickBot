const { ModuleKeys } = require('../moduleRegistry');

const ActionKeys = Object.freeze({
  BotPing: 'bot.ping',
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
  ModerationKick: 'moderation.kick',
  ModerationBan: 'moderation.ban',
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
  [ActionKeys.ModerationKick]: PermissionLevels.SENIOR_MODERATOR,
  [ActionKeys.ModerationBan]: PermissionLevels.SENIOR_MODERATOR,
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
  [ModuleKeys.WELCOME]: PermissionLevels.SENIOR_MODERATOR,
  [ModuleKeys.REACTION_ROLES]: PermissionLevels.EVERYONE,
  [ModuleKeys.GIVEAWAYS]: PermissionLevels.MODERATOR,
  [ModuleKeys.BIRTHDAYS]: PermissionLevels.EVERYONE,
  [ModuleKeys.LEVELING]: PermissionLevels.EVERYONE,
  [ModuleKeys.SERVER_STATS]: PermissionLevels.SENIOR_MODERATOR,
  [ModuleKeys.JOIN_TO_CREATE]: PermissionLevels.EVERYONE,
  [ModuleKeys.CUSTOM_COMMANDS]: PermissionLevels.EVERYONE,
  [ModuleKeys.UTILITY]: PermissionLevels.EVERYONE
});

const defaultPublicActions = Object.freeze([
  ActionKeys.BotPing,
  ActionKeys.TicketsOpen,
  ActionKeys.ReportsSubmit,
  ActionKeys.ApplicationsApply,
  ActionKeys.AppealsSubmit
]);

const defaultTeamPermissions = Object.freeze(Object.values(ActionKeys));

const PERMISSION_DEFAULTS_VERSION = '0.3.6';

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
