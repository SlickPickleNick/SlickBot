import { LogDeliveryMode, ModuleKey } from "@prisma/client";
import { ChannelType, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import { defaultModules } from "../modules/moduleRegistry.js";
import { ActionKeys } from "../modules/permissions/actionKeys.js";
import { replyPrivate } from "../utils/reply.js";
import type { BotCommand } from "./types.js";

export const setupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Initialize the bot for this server.")
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("Default channel for bot logs.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  actionKey: ActionKeys.SetupRun,
  moduleKey: ModuleKey.PERMISSIONS,
  async execute(interaction, ctx) {
    if (!interaction.guildId) {
      await replyPrivate(interaction, "This command can only be used inside a server.");
      return;
    }

    const logChannel = interaction.options.getChannel("log_channel", false);

    await ctx.db.guildConfig.upsert({
      where: { guildId: interaction.guildId },
      create: {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name ?? null,
        timezone: env.DEFAULT_TIMEZONE,
        defaultLogChannelId: logChannel?.id ?? null
      },
      update: {
        guildName: interaction.guild?.name ?? null,
        defaultLogChannelId: logChannel?.id ?? undefined
      }
    });

    for (const moduleConfig of defaultModules) {
      await ctx.db.moduleConfig.upsert({
        where: {
          guildId_moduleKey: {
            guildId: interaction.guildId,
            moduleKey: moduleConfig.key
          }
        },
        create: {
          guildId: interaction.guildId,
          moduleKey: moduleConfig.key,
          enabled: moduleConfig.enabled
        },
        update: {}
      });
    }

    const ownerTeam = await ctx.db.permissionTeam.upsert({
      where: {
        guildId_name: {
          guildId: interaction.guildId,
          name: "Bot Owners"
        }
      },
      create: {
        guildId: interaction.guildId,
        name: "Bot Owners",
        description: "Full bot access. Includes the user who ran initial setup.",
        isSystemTeam: true
      },
      update: {}
    });

    await ctx.db.permissionTeamUser.upsert({
      where: {
        teamId_userId: {
          teamId: ownerTeam.id,
          userId: interaction.user.id
        }
      },
      create: {
        teamId: ownerTeam.id,
        userId: interaction.user.id
      },
      update: {}
    });

    const initialActions = [
      ActionKeys.SetupRun,
      ActionKeys.PermissionsManage,
      ActionKeys.ModulesManage,
      ActionKeys.LoggingConfigure,
      ActionKeys.LoggingTest
    ];

    for (const actionKey of initialActions) {
      await ctx.db.commandPermission.upsert({
        where: {
          teamId_actionKey_channelScope: {
            teamId: ownerTeam.id,
            actionKey,
            channelScope: "*"
          }
        },
        create: {
          guildId: interaction.guildId,
          teamId: ownerTeam.id,
          actionKey,
          channelScope: "*",
          allow: true
        },
        update: { allow: true }
      });
    }

    await ctx.db.logSetting.upsert({
      where: {
        guildId_eventKey: {
          guildId: interaction.guildId,
          eventKey: "system"
        }
      },
      create: {
        guildId: interaction.guildId,
        eventKey: "system",
        deliveryMode: LogDeliveryMode.IMMEDIATE,
        channelId: logChannel?.id ?? null
      },
      update: {
        channelId: logChannel?.id ?? undefined
      }
    });

    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.SetupRun,
      summary: "Bot setup initialized."
    });

    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: "system",
      title: "Bot Setup Complete",
      body: `Setup was completed by ${interaction.user.tag}.`
    });

    await replyPrivate(interaction, {
      content: [
        "Setup complete.",
        "Created/updated guild config.",
        "Enabled core modules: Permissions and Logging.",
        "Created Bot Owners team and added you to it.",
        logChannel ? `Default log channel: <#${logChannel.id}>` : "No default log channel was set. Use `/logging set-channel` when ready."
      ].join("\n")
    });
  }
};
