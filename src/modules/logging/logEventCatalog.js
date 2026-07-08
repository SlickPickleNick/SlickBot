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
    description: 'Ticket activity when the ticket module is added.',
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

  { key: 'tickets', moduleKey: 'tickets', label: 'Tickets', description: 'Future ticket activity.', defaultDelivery: 'IMMEDIATE' },
  { key: 'applications', moduleKey: 'applications', label: 'Applications', description: 'Future application activity.', defaultDelivery: 'IMMEDIATE' },
  { key: 'appeals', moduleKey: 'appeals', label: 'Appeals', description: 'Future appeal activity.', defaultDelivery: 'IMMEDIATE' },
  { key: 'scheduled-messages', moduleKey: 'scheduled-messages', label: 'Scheduled Messages', description: 'Future scheduled announcement activity.', defaultDelivery: 'IMMEDIATE' }
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
