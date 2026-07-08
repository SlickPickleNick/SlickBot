export const ActionKeys = {
  SetupRun: "setup.run",
  PermissionsManage: "permissions.manage",
  ModulesManage: "modules.manage",
  LoggingConfigure: "logging.configure",
  LoggingTest: "logging.test",
  ModerationWarn: "moderation.warn",
  TicketsClaim: "tickets.claim",
  ApplicationsReview: "applications.review",
  AppealsReview: "appeals.review",
  ScheduledMessagesCreate: "scheduledMessages.create"
} as const;

export type ActionKey = (typeof ActionKeys)[keyof typeof ActionKeys];
