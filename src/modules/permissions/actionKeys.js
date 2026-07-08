const ActionKeys = Object.freeze({
  BotPing: 'bot.ping',
  Setup: 'setup.run',
  TeamsManage: 'permissions.teams.manage',
  ModulesManage: 'permissions.modules.manage',
  LoggingConfigure: 'logging.configure',
  LoggingView: 'logging.view'
});

const defaultTeamPermissions = [
  ActionKeys.BotPing,
  ActionKeys.Setup,
  ActionKeys.TeamsManage,
  ActionKeys.ModulesManage,
  ActionKeys.LoggingConfigure,
  ActionKeys.LoggingView
];

module.exports = {
  ActionKeys,
  defaultTeamPermissions
};
