const catalogPath = require.resolve('./logEventCatalog');
const original = require('./logEventCatalog');

const joinToCreateModule = Object.freeze({
  key: 'join-to-create',
  label: 'Join-to-Create Voice',
  description: 'Temporary voice-room creation, cleanup, ownership, and access changes.',
  defaultDelivery: 'IMMEDIATE'
});

const joinToCreateEvents = Object.freeze([
  { key: 'join-to-create-config', moduleKey: 'join-to-create', label: 'Voice Room Config', description: 'Join-to-create configuration changed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'join-to-create-created', moduleKey: 'join-to-create', label: 'Voice Room Created', description: 'A temporary voice room was created.', defaultDelivery: 'IMMEDIATE' },
  { key: 'join-to-create-deleted', moduleKey: 'join-to-create', label: 'Voice Room Deleted', description: 'An empty temporary voice room was removed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'join-to-create-updated', moduleKey: 'join-to-create', label: 'Voice Room Updated', description: 'A temporary room name, limit, or lock state changed.', defaultDelivery: 'IMMEDIATE' },
  { key: 'join-to-create-access', moduleKey: 'join-to-create', label: 'Voice Room Access', description: 'A member was permitted or rejected from a temporary room.', defaultDelivery: 'IMMEDIATE' },
  { key: 'join-to-create-owner', moduleKey: 'join-to-create', label: 'Voice Room Ownership', description: 'Temporary room ownership was transferred or claimed.', defaultDelivery: 'IMMEDIATE' }
]);

const LogModuleCatalog = Object.freeze([
  ...original.LogModuleCatalog.filter((item) => item.key !== joinToCreateModule.key),
  joinToCreateModule
]);

const eventKeys = new Set(joinToCreateEvents.map((item) => item.key));
const LogEventCatalog = Object.freeze([
  ...original.LogEventCatalog.filter((item) => !eventKeys.has(item.key)),
  ...joinToCreateEvents
]);

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

const extended = {
  ...original,
  LogModuleCatalog,
  LogEventCatalog,
  getLogModule,
  getLogEvent,
  getLogModuleChoices,
  getLogEventChoices,
  getEventsForModule
};

require.cache[catalogPath].exports = extended;

module.exports = extended;
