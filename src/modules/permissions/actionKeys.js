const ActionKeys = Object.freeze({
  BotPing: 'bot.ping',
  Setup: 'setup.run',
  TeamsManage: 'permissions.teams.manage',
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
  UserNotesManage: 'user-notes.manage'
});

const defaultTeamPermissions = [
  ActionKeys.BotPing,
  ActionKeys.Setup,
  ActionKeys.TeamsManage,
  ActionKeys.ModulesManage,
  ActionKeys.LoggingConfigure,
  ActionKeys.LoggingView,
  ActionKeys.StatusView,
  ActionKeys.StatusManage,
  ActionKeys.ModerationPanel,
  ActionKeys.ModerationWarn,
  ActionKeys.ModerationTimeout,
  ActionKeys.ModerationKick,
  ActionKeys.ModerationBan,
  ActionKeys.ModerationMassBan,
  ActionKeys.CasesView,
  ActionKeys.CasesManage,
  ActionKeys.UserNotesView,
  ActionKeys.UserNotesManage
];

module.exports = {
  ActionKeys,
  defaultTeamPermissions
};
