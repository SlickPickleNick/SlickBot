import { ModuleKey } from "@prisma/client";
import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import type { PrismaClient } from "@prisma/client";
import { botOwnerIds } from "../../config/env.js";
import { isCoreModule } from "../moduleRegistry.js";

export type PermissionResult = {
  allowed: boolean;
  reason?: string;
};

export class PermissionService {
  constructor(private readonly db: PrismaClient) {}

  isBotOwner(userId: string): boolean {
    return botOwnerIds.includes(userId);
  }

  async ensureGuildConfig(guildId: string, guildName?: string | null): Promise<void> {
    await this.db.guildConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        guildName: guildName ?? null
      },
      update: {
        guildName: guildName ?? null
      }
    });
  }

  async isModuleEnabled(guildId: string, moduleKey: ModuleKey): Promise<boolean> {
    if (isCoreModule(moduleKey)) return true;

    const moduleConfig = await this.db.moduleConfig.findUnique({
      where: {
        guildId_moduleKey: {
          guildId,
          moduleKey
        }
      }
    });

    return Boolean(moduleConfig?.enabled);
  }

  async checkInteraction(
    interaction: ChatInputCommandInteraction,
    actionKey: string,
    moduleKey: ModuleKey
  ): Promise<PermissionResult> {
    if (!interaction.guildId) {
      return { allowed: false, reason: "This command can only be used inside a server." };
    }

    await this.ensureGuildConfig(interaction.guildId, interaction.guild?.name ?? null);

    if (this.isBotOwner(interaction.user.id)) return { allowed: true };

    const moduleEnabled = await this.isModuleEnabled(interaction.guildId, moduleKey);
    if (!moduleEnabled) {
      return { allowed: false, reason: `The ${moduleKey} module is disabled.` };
    }

    // During single-server setup, Discord Administrators can manage the bot by default.
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return { allowed: true };

    const roleIds = this.getInteractionRoleIds(interaction);

    const matchingTeams = await this.db.permissionTeam.findMany({
      where: {
        guildId: interaction.guildId,
        OR: [
          { users: { some: { userId: interaction.user.id } } },
          { roles: { some: { roleId: { in: roleIds } } } }
        ],
        permissions: {
          some: {
            actionKey,
            allow: true,
            OR: [{ channelScope: "*" }, { channelScope: interaction.channelId }]
          }
        }
      }
    });

    if (matchingTeams.length > 0) return { allowed: true };

    return {
      allowed: false,
      reason: "You do not have permission to use this command/action."
    };
  }

  private getInteractionRoleIds(interaction: ChatInputCommandInteraction): string[] {
    const member = interaction.member;
    if (!member || typeof member !== "object" || !("roles" in member)) return [];

    const roles = member.roles;
    if (Array.isArray(roles)) return roles;

    if (roles && typeof roles === "object" && "cache" in roles) {
      const roleCache = (roles as { cache: Map<string, unknown> }).cache;
      return Array.from(roleCache.keys());
    }

    return [];
  }
}
