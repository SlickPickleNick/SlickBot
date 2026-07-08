const LogEventCatalog = Object.freeze([
  { key: 'system', label: 'System', description: 'Startup, health, tests, and general bot events.', defaultDelivery: 'IMMEDIATE' },
  { key: 'setup', label: 'Setup', description: 'Server setup and configuration actions.', defaultDelivery: 'IMMEDIATE' },
  { key: 'module-config', label: 'Module Config', description: 'Module enable/disable changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'permission-team', label: 'Permission Teams', description: 'Team and permission changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'status', label: 'Status', description: 'Bot status and activity changes.', defaultDelivery: 'IMMEDIATE' },
  { key: 'moderation', label: 'Moderation', description: 'Warns, timeouts, kicks, bans, and bulk actions.', defaultDelivery: 'IMMEDIATE' },
  { key: 'cases', label: 'Cases', description: 'Case creation and case status updates.', defaultDelivery: 'IMMEDIATE' },
  { key: 'user-notes', label: 'User Notes', description: 'Private staff notes for users.', defaultDelivery: 'IMMEDIATE' },
  { key: 'member-join', label: 'Member Joins', description: 'Members joining the server.', defaultDelivery: 'BATCHED' },
  { key: 'member-leave', label: 'Member Leaves', description: 'Members leaving the server.', defaultDelivery: 'BATCHED' },
  { key: 'message-delete', label: 'Message Deletes', description: 'Deleted message logs.', defaultDelivery: 'BATCHED' },
  { key: 'message-edit', label: 'Message Edits', description: 'Edited message logs.', defaultDelivery: 'BATCHED' },
  { key: 'voice', label: 'Voice Activity', description: 'Voice joins, leaves, and moves.', defaultDelivery: 'BATCHED' },
  { key: 'tickets', label: 'Tickets', description: 'Future ticket activity.', defaultDelivery: 'IMMEDIATE' },
  { key: 'applications', label: 'Applications', description: 'Future application activity.', defaultDelivery: 'IMMEDIATE' },
  { key: 'appeals', label: 'Appeals', description: 'Future appeal activity.', defaultDelivery: 'IMMEDIATE' },
  { key: 'scheduled-messages', label: 'Scheduled Messages', description: 'Future scheduled announcement activity.', defaultDelivery: 'IMMEDIATE' }
]);

const StarterLogEventKeys = Object.freeze([
  'system',
  'setup',
  'module-config',
  'permission-team',
  'status',
  'moderation',
  'cases',
  'user-notes'
]);

function getLogEvent(eventKey) {
  return LogEventCatalog.find((event) => event.key === eventKey) || null;
}

function getLogEventChoices() {
  return LogEventCatalog.slice(0, 25).map((event) => ({ name: event.label, value: event.key }));
}

module.exports = {
  LogEventCatalog,
  StarterLogEventKeys,
  getLogEvent,
  getLogEventChoices
};
