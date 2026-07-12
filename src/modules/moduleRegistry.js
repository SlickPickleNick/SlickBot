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
  BOT_UPDATES: 'BOT_UPDATES',
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
  { key: ModuleKeys.SCHEDULED_MESSAGES, enabled: true },
  { key: ModuleKeys.WELCOME, enabled: true },
  { key: ModuleKeys.REACTION_ROLES, enabled: true },
  { key: ModuleKeys.GIVEAWAYS, enabled: true },
  { key: ModuleKeys.BIRTHDAYS, enabled: true },
  { key: ModuleKeys.LEVELING, enabled: true },
  { key: ModuleKeys.SERVER_STATS, enabled: true },
  { key: ModuleKeys.BOT_UPDATES, enabled: true },
  { key: ModuleKeys.CUSTOM_COMMANDS, enabled: true },
  { key: ModuleKeys.JOIN_TO_CREATE, enabled: true },
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
  ModuleKeys.SCHEDULED_MESSAGES,
  ModuleKeys.WELCOME,
  ModuleKeys.REACTION_ROLES,
  ModuleKeys.GIVEAWAYS,
  ModuleKeys.BIRTHDAYS,
  ModuleKeys.LEVELING,
  ModuleKeys.SERVER_STATS,
  ModuleKeys.BOT_UPDATES,
  ModuleKeys.CUSTOM_COMMANDS,
  ModuleKeys.JOIN_TO_CREATE
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
