const ModuleKeys = Object.freeze({
  LOGGING: 'LOGGING',
  STATUS: 'STATUS',
  PERMISSIONS: 'PERMISSIONS',
  MODERATION: 'MODERATION',
  TICKETS: 'TICKETS',
  REPORTS: 'REPORTS',
  APPLICATIONS: 'APPLICATIONS',
  APPEALS: 'APPEALS',
  SCHEDULED_MESSAGES: 'SCHEDULED_MESSAGES',
  WELCOME: 'WELCOME',
  REACTION_ROLES: 'REACTION_ROLES',
  GIVEAWAYS: 'GIVEAWAYS',
  BIRTHDAYS: 'BIRTHDAYS',
  LEVELING: 'LEVELING',
  SERVER_STATS: 'SERVER_STATS',
  JOIN_TO_CREATE: 'JOIN_TO_CREATE',
  CUSTOM_COMMANDS: 'CUSTOM_COMMANDS',
  UTILITY: 'UTILITY'
});

const coreModules = [ModuleKeys.PERMISSIONS, ModuleKeys.LOGGING, ModuleKeys.STATUS];

const defaultModules = [
  { key: ModuleKeys.PERMISSIONS, enabled: true },
  { key: ModuleKeys.LOGGING, enabled: true },
  { key: ModuleKeys.STATUS, enabled: true },
  { key: ModuleKeys.MODERATION, enabled: true },
  { key: ModuleKeys.TICKETS, enabled: true },
  { key: ModuleKeys.REPORTS, enabled: true },
  { key: ModuleKeys.APPLICATIONS, enabled: true },
  { key: ModuleKeys.APPEALS, enabled: true },
  { key: ModuleKeys.SCHEDULED_MESSAGES, enabled: false },
  { key: ModuleKeys.WELCOME, enabled: true },
  { key: ModuleKeys.REACTION_ROLES, enabled: true },
  { key: ModuleKeys.GIVEAWAYS, enabled: true },
  { key: ModuleKeys.BIRTHDAYS, enabled: false },
  { key: ModuleKeys.LEVELING, enabled: false },
  { key: ModuleKeys.SERVER_STATS, enabled: false },
  { key: ModuleKeys.JOIN_TO_CREATE, enabled: false },
  { key: ModuleKeys.CUSTOM_COMMANDS, enabled: false },
  { key: ModuleKeys.UTILITY, enabled: false }
];

function isCoreModule(moduleKey) {
  return coreModules.includes(moduleKey);
}


const implementedModules = Object.freeze([
  ModuleKeys.PERMISSIONS,
  ModuleKeys.LOGGING,
  ModuleKeys.STATUS,
  ModuleKeys.MODERATION,
  ModuleKeys.TICKETS,
  ModuleKeys.REPORTS,
  ModuleKeys.APPLICATIONS,
  ModuleKeys.APPEALS,
  ModuleKeys.WELCOME,
  ModuleKeys.REACTION_ROLES,
  ModuleKeys.GIVEAWAYS
]);

function isImplementedModule(moduleKey) {
  return implementedModules.includes(moduleKey);
}

module.exports = {
  ModuleKeys,
  coreModules,
  defaultModules,
  implementedModules,
  isCoreModule,
  isImplementedModule
};
