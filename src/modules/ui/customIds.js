const CustomIds = Object.freeze({
  SetupRefresh: 'slickbot:setup:refresh',
  SetupModules: 'slickbot:setup:modules',
  SetupLogging: 'slickbot:setup:logging',
  SetupStatus: 'slickbot:setup:status',
  SetupTeams: 'slickbot:setup:teams',

  ModulesSelect: 'slickbot:modules:select',
  ModulesRefresh: 'slickbot:modules:refresh',

  LoggingRefresh: 'slickbot:logging:refresh',
  LoggingFlush: 'slickbot:logging:flush',
  LoggingTest: 'slickbot:logging:test',

  StatusRefresh: 'slickbot:status:refresh',
  StatusQuickOnline: 'slickbot:status:quick-online',
  StatusQuickIdle: 'slickbot:status:quick-idle',
  StatusQuickDnd: 'slickbot:status:quick-dnd',
  StatusClear: 'slickbot:status:clear'
});

module.exports = { CustomIds };
