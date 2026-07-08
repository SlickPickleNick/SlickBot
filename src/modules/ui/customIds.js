const CustomIds = Object.freeze({
  SetupRefresh: 'slickbot:setup:refresh',
  SetupModules: 'slickbot:setup:modules',
  SetupLogging: 'slickbot:setup:logging',
  SetupStatus: 'slickbot:setup:status',
  SetupTeams: 'slickbot:setup:teams',
  SetupModeration: 'slickbot:setup:moderation',
  SetupSupport: 'slickbot:setup:support',

  ModulesSelect: 'slickbot:modules:select',
  ModulesRefresh: 'slickbot:modules:refresh',

  LoggingRefresh: 'slickbot:logging:refresh',
  LoggingFlush: 'slickbot:logging:flush',
  LoggingTest: 'slickbot:logging:test',

  StatusRefresh: 'slickbot:status:refresh',
  StatusQuickOnline: 'slickbot:status:quick-online',
  StatusQuickIdle: 'slickbot:status:quick-idle',
  StatusQuickDnd: 'slickbot:status:quick-dnd',
  StatusClear: 'slickbot:status:clear',

  ModerationRefresh: 'slickbot:moderation:refresh',
  CasesRefresh: 'slickbot:cases:refresh',

  SupportRefresh: 'slickbot:support:refresh',
  TicketsRefresh: 'slickbot:tickets:refresh',
  TicketOpen: 'slickbot:ticket:open',
  TicketClaim: 'slickbot:ticket:claim',
  TicketClose: 'slickbot:ticket:close',

  ReportsRefresh: 'slickbot:reports:refresh',
  ReportOpen: 'slickbot:report:open',
  ReportResolvePrefix: 'slickbot:report:resolve:',
  ReportDismissPrefix: 'slickbot:report:dismiss:',

  ApplicationsRefresh: 'slickbot:applications:refresh',
  ApplicationApplyPrefix: 'slickbot:application:apply:',
  ApplicationApprovePrefix: 'slickbot:application:approve:',
  ApplicationDenyPrefix: 'slickbot:application:deny:',

  AppealsRefresh: 'slickbot:appeals:refresh',
  AppealOpen: 'slickbot:appeal:open',
  AppealApprovePrefix: 'slickbot:appeal:approve:',
  AppealDenyPrefix: 'slickbot:appeal:deny:',

  TicketModal: 'slickbot:modal:ticket',
  ReportModal: 'slickbot:modal:report',
  AppealModal: 'slickbot:modal:appeal',
  ApplicationModalPrefix: 'slickbot:modal:application:'
});

module.exports = { CustomIds };
