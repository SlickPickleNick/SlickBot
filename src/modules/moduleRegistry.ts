import { ModuleKey } from "@prisma/client";

export const coreModules = [ModuleKey.PERMISSIONS, ModuleKey.LOGGING] as const;

export const defaultModules: Array<{ key: ModuleKey; enabled: boolean }> = [
  { key: ModuleKey.PERMISSIONS, enabled: true },
  { key: ModuleKey.LOGGING, enabled: true },
  { key: ModuleKey.MODERATION, enabled: false },
  { key: ModuleKey.TICKETS, enabled: false },
  { key: ModuleKey.APPLICATIONS, enabled: false },
  { key: ModuleKey.APPEALS, enabled: false },
  { key: ModuleKey.SCHEDULED_MESSAGES, enabled: false },
  { key: ModuleKey.WELCOME, enabled: false },
  { key: ModuleKey.REACTION_ROLES, enabled: false },
  { key: ModuleKey.GIVEAWAYS, enabled: false },
  { key: ModuleKey.BIRTHDAYS, enabled: false },
  { key: ModuleKey.LEVELING, enabled: false },
  { key: ModuleKey.SERVER_STATS, enabled: false },
  { key: ModuleKey.JOIN_TO_CREATE, enabled: false },
  { key: ModuleKey.CUSTOM_COMMANDS, enabled: false },
  { key: ModuleKey.UTILITY, enabled: false }
];

export function isCoreModule(moduleKey: ModuleKey): boolean {
  return coreModules.includes(moduleKey as (typeof coreModules)[number]);
}
