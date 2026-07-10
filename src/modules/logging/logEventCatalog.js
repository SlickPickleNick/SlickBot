const LogModuleCatalog = Object.freeze([
  {
    key: 'core',
    label: 'Core / System',
    description: 'Startup, setup, module changes, permissions, and bot status updates.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'moderation',
    label: 'Moderation',
    description: 'Moderation actions, case updates, and staff user notes.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'member',
    label: 'Member Logs',
    description: 'Joins, leaves, nickname changes, role changes, and member profile updates.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'message',
    label: 'Message Logs',
    description: 'Message edits and deletions.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'voice',
    label: 'Voice Logs',
    description: 'Voice joins, leaves, and moves.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'tickets',
    label: 'Tickets',
    description: 'Ticket opens, claims, priority changes, closes, and transcript activity.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'User-submitted reports and staff report decisions.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'applications',
    label: 'Applications',
    description: 'Application submissions and review actions.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'appeals',
    label: 'Appeals',
    description: 'Appeal submissions and review actions.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'scheduled-messages',
    label: 'Scheduled Messages',
    description: 'Scheduled announcement activity.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'welcome',
    label: 'Welcome / Auto Roles',
    description: 'Welcome messages, DM welcomes, and auto role activity.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'reaction-roles',
    label: 'Reaction / Button Roles',
    description: 'Self-assignable role panel configuration and role toggles.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'giveaways',
    label: 'Giveaways',
    description: 'Giveaway creation, entries, endings, and rerolls.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'birthdays',
    label: 'Birthdays',
    description: 'Birthday profile changes, birthday announcements, and birthday role activity.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'leveling',
    label: 'Leveling / XP',
    description: 'Leveling configuration, level-ups, and staff XP adjustments.',
    defaultDelivery: 'IMMEDIATE'
  },
  {
    key: 'server-stats',
    label: 'Server Stats',
    description: 'Member, human, bot, and voice counter channel updates.',
    defaultDelivery: 'IMMEDIATE'
  }
]);

const LogEventCatalog = Object.freeze([
  { key: 'system', moduleKey: 'core', label: 'System', description: 'Startup, health, tests, and general bot events.', defaultDelivery: 'IMMEDIATE' },
  { key: 'setup', moduleKey: 'core', label: 'Setup', description: 'Server setup and configuration actions.', defaultDelivery: 'IMMEDIATE' },
  { key: 'module-config', moduleKey: 'core', label: 'Module Config', description: 'Module enable/disable changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'permission-team', moduleKey: 'core', label: 'Permission Teams', description: 'Team and permission changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'status', moduleKey: 'core', label: 'Status', description: 'Bot status and activity changes.', defaultDelivery: 'IMMEDIATE' },

  { key: 'moderation', moduleKey: 'moderation', label: 'Moderation Actions', description: 'Warns, timeouts, kicks, bans, and bulk actions.', defaultDelivery: 'IMMEDIATE' },
  { key: 'cases', moduleKey: 'moderation', label: 'Cases', description: 'Case creation and case status updates.', defaultDelivery: 'IMMEDIATE' },
  { key: 'user-notes', moduleKey: 'moderation', label: 'User Notes', description: 'Private staff notes for users.', defaultDelivery: 'IMMEDIATE' },

  { key: 'member-join', moduleKey: 'member', label: 'Member Joins', description: 'Members joining the server.', defaultDelivery: 'IMMEDIATE' },
  { key: 'member-leave', moduleKey: 'member', label: 'Member Leaves', description: 'Members leaving the server.', defaultDelivery: 'IMMEDIATE' },
  { key: 'member-update', moduleKey: 'member', label: 'Member Updates', description: 'General member profile/server-profile updates.', defaultDelivery: 'IMMEDIATE' },
  { key: 'member-nickname', moduleKey: 'member', label: 'Nickname Changes', description: 'Member nickname changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'member-roles', moduleKey: 'member', label: 'Role Changes', description: 'Member role additions and removals.', defaultDelivery: 'IMMEDIATE' },

  { key: 'message-delete', moduleKey: 'message', label: 'Message Deletes', description: 'Deleted message logs.', defaultDelivery: 'IMMEDIATE' },
  { key: 'message-edit', moduleKey: 'message', label: 'Message Edits', description: 'Edited message logs.', defaultDelivery: 'IMMEDIATE' },

  { key: 'voice-join', moduleKey: 'voice', label: 'Voice Joins', description: 'Users joining voice channels.', defaultDelivery: 'IMMEDIATE' },
  { key: 'voice-leave', moduleKey: 'voice', label: 'Voice Leaves', description: 'Users leaving voice channels.', defaultDelivery: 'IMMEDIATE' },
  { key: 'voice-move', moduleKey: 'voice', label: 'Voice Moves', description: 'Users moving between voice channels.', defaultDelivery: 'IMMEDIATE' },

  { key: 'ticket-open', moduleKey: 'tickets', label: 'Ticket Opened', description: 'A user opened a support ticket.', defaultDelivery: 'IMMEDIATE' },
  { key: 'ticket-claim', moduleKey: 'tickets', label: 'Ticket Claimed', description: 'A staff member claimed a ticket.', defaultDelivery: 'IMMEDIATE' },
  { key: 'ticket-priority', moduleKey: 'tickets', label: 'Ticket Priority', description: 'A ticket priority changed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'ticket-close', moduleKey: 'tickets', label: 'Ticket Closed', description: 'A ticket was closed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'ticket-transcript', moduleKey: 'tickets', label: 'Ticket Transcript', description: 'A ticket transcript was generated.', defaultDelivery: 'IMMEDIATE' },
  { key: 'ticket-escalate', moduleKey: 'tickets', label: 'Ticket Escalated', description: 'A ticket was escalated to a higher review role or team.', defaultDelivery: 'IMMEDIATE' },

  { key: 'report-submit', moduleKey: 'reports', label: 'Report Submitted', description: 'A user submitted a report.', defaultDelivery: 'IMMEDIATE' },
  { key: 'report-review', moduleKey: 'reports', label: 'Report Reviewed', description: 'Staff reviewed a report.', defaultDelivery: 'IMMEDIATE' },
  { key: 'report-claim', moduleKey: 'reports', label: 'Report Claimed', description: 'Staff claimed an open report.', defaultDelivery: 'IMMEDIATE' },
  { key: 'report-note', moduleKey: 'reports', label: 'Report Details Added', description: 'Staff added review details to a report.', defaultDelivery: 'IMMEDIATE' },

  { key: 'application-start', moduleKey: 'applications', label: 'Application Started', description: 'A user started a DM-based application.', defaultDelivery: 'IMMEDIATE' },
  { key: 'application-submit', moduleKey: 'applications', label: 'Application Submitted', description: 'A user submitted an application.', defaultDelivery: 'IMMEDIATE' },
  { key: 'application-review', moduleKey: 'applications', label: 'Application Reviewed', description: 'Staff reviewed an application.', defaultDelivery: 'IMMEDIATE' },

  { key: 'appeal-submit', moduleKey: 'appeals', label: 'Appeal Submitted', description: 'A user submitted an appeal.', defaultDelivery: 'IMMEDIATE' },
  { key: 'appeal-review', moduleKey: 'appeals', label: 'Appeal Reviewed', description: 'Staff reviewed an appeal.', defaultDelivery: 'IMMEDIATE' },

  { key: 'scheduled-messages', moduleKey: 'scheduled-messages', label: 'Scheduled Messages', description: 'Scheduled announcement activity.', defaultDelivery: 'IMMEDIATE' },

  { key: 'welcome-config', moduleKey: 'welcome', label: 'Welcome Config', description: 'Welcome message and DM configuration changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'welcome-member', moduleKey: 'welcome', label: 'Welcome Member', description: 'Welcome message and auto role actions on member join.', defaultDelivery: 'IMMEDIATE' },
  { key: 'auto-role-config', moduleKey: 'welcome', label: 'Auto Role Config', description: 'Auto role configuration changes.', defaultDelivery: 'IMMEDIATE' },

  { key: 'reaction-role-config', moduleKey: 'reaction-roles', label: 'Role Panel Config', description: 'Self-assignable role panel setup changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'reaction-role-toggle', moduleKey: 'reaction-roles', label: 'Role Panel Used', description: 'User role self-assignment actions.', defaultDelivery: 'IMMEDIATE' },

  { key: 'giveaway-config', moduleKey: 'giveaways', label: 'Giveaway Config', description: 'Giveaway setup and default changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'giveaway-created', moduleKey: 'giveaways', label: 'Giveaway Created', description: 'A giveaway was created.', defaultDelivery: 'IMMEDIATE' },
  { key: 'giveaway-entry', moduleKey: 'giveaways', label: 'Giveaway Entry', description: 'A user entered a giveaway.', defaultDelivery: 'IMMEDIATE' },
  { key: 'giveaway-ended', moduleKey: 'giveaways', label: 'Giveaway Ended', description: 'A giveaway ended and winners were selected.', defaultDelivery: 'IMMEDIATE' },
  { key: 'giveaway-rerolled', moduleKey: 'giveaways', label: 'Giveaway Rerolled', description: 'Giveaway winners were rerolled.', defaultDelivery: 'IMMEDIATE' },

  { key: 'birthday-config', moduleKey: 'birthdays', label: 'Birthday Config', description: 'Birthday system settings changed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'birthday-profile', moduleKey: 'birthdays', label: 'Birthday Profile', description: 'A user saved or removed their birthday.', defaultDelivery: 'IMMEDIATE' },
  { key: 'birthday-active', moduleKey: 'birthdays', label: 'Birthday Active', description: 'A birthday was announced or a birthday role was added.', defaultDelivery: 'IMMEDIATE' },
  { key: 'birthday-ended', moduleKey: 'birthdays', label: 'Birthday Ended', description: 'A birthday role was removed after the birthday passed.', defaultDelivery: 'IMMEDIATE' },

  { key: 'leveling-config', moduleKey: 'leveling', label: 'Leveling Config', description: 'Leveling settings and role rewards changed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'leveling-level-up', moduleKey: 'leveling', label: 'Level Up', description: 'A member reached a new level.', defaultDelivery: 'IMMEDIATE' },
  { key: 'leveling-adjustment', moduleKey: 'leveling', label: 'XP Adjustment', description: 'Staff manually changed or reset XP.', defaultDelivery: 'IMMEDIATE' },

  { key: 'server-stats-config', moduleKey: 'server-stats', label: 'Server Stats Config', description: 'Server stats configuration changed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'server-stats-update', moduleKey: 'server-stats', label: 'Server Stats Updated', description: 'Server stat counter channels were refreshed.', defaultDelivery: 'IMMEDIATE' }
]);

const StarterLogModuleKeys = Object.freeze(['core', 'moderation']);
const StarterLogEventKeys = Object.freeze(['system', 'setup', 'module-config', 'permission-team', 'status', 'moderation', 'cases', 'user-notes']);

function getLogModule(moduleKey) {
  return LogModuleCatalog.find((module) => module.key === moduleKey) || null;
}

function getLogEvent(eventKey) {
  return LogEventCatalog.find((event) => event.key === eventKey) || null;
}

function getLogModuleChoices() {
  return LogModuleCatalog.slice(0, 25).map((module) => ({ name: module.label, value: module.key }));
}

function getLogEventChoices() {
  return LogEventCatalog.slice(0, 25).map((event) => ({ name: `${event.label} (${event.moduleKey})`, value: event.key }));
}

function getEventsForModule(moduleKey) {
  return LogEventCatalog.filter((event) => event.moduleKey === moduleKey);
}

module.exports = {
  LogModuleCatalog,
  LogEventCatalog,
  StarterLogModuleKeys,
  StarterLogEventKeys,
  getLogModule,
  getLogEvent,
  getLogModuleChoices,
  getLogEventChoices,
  getEventsForModule
};
