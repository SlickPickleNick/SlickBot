import type { PrismaClient, ModuleKey } from "@prisma/client";
import type { ChatInputCommandInteraction, Client, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import type { PermissionService } from "../modules/permissions/permissionService.js";
import type { LoggingService } from "../modules/logging/loggingService.js";

export type SlashCommandData = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

export type CommandContext = {
  client: Client;
  db: PrismaClient;
  permissions: PermissionService;
  logger: LoggingService;
};

export type BotCommand = {
  data: SlashCommandData;
  actionKey: string;
  moduleKey: ModuleKey;
  execute(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void>;
};
