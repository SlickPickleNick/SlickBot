import { ModuleKey } from "@prisma/client";
import { SlashCommandBuilder } from "discord.js";
import { defaultModules, isCoreModule } from "../modules/moduleRegistry.js";
import { ActionKeys } from "../modules/permissions/actionKeys.js";
import { replyPrivate } from "../utils/reply.js";
import type { BotCommand } from "./types.js";

const moduleChoices = Object.values(ModuleKey).map((moduleKey) => ({ name: moduleKey, value: moduleKey }));

export const modulesCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("modules")
    .setDescription("View or manage bot modules.")
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List all module states."))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enable")
        .setDescription("Enable a module.")
        .addStringOption((option) => option.setName("module").setDescription("Module to enable.").setRequired(true).addChoices(...moduleChoices))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable a module.")
        .addStringOption((option) => option.setName("module").setDescription("Module to disable.").setRequired(true).addChoices(...moduleChoices))
    ),
  actionKey: ActionKeys.ModulesManage,
  moduleKey: ModuleKey.PERMISSIONS,
  async execute(interaction, ctx) {
    if (!interaction.guildId) {
      await replyPrivate(interaction, "This command can only be used inside a server.");
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    for (const moduleConfig of defaultModules) {
      await ctx.db.moduleConfig.upsert({
        where: { guildId_moduleKey: { guildId: interaction.guildId, moduleKey: moduleConfig.key } },
        create: { guildId: interaction.guildId, moduleKey: moduleConfig.key, enabled: moduleConfig.enabled },
        update: {}
      });
    }

    if (subcommand === "list") {
      const modules = await ctx.db.moduleConfig.findMany({ where: { guildId: interaction.guildId }, orderBy: { moduleKey: "asc" } });
      const output = modules.map((moduleConfig) => `${moduleConfig.enabled ? "✅" : "⬜"} ${moduleConfig.moduleKey}`).join("\n");
      await replyPrivate(interaction, output || "No modules found. Run `/setup` first.");
      return;
    }

    const moduleKey = interaction.options.getString("module", true) as ModuleKey;

    if (isCoreModule(moduleKey) && subcommand === "disable") {
      await replyPrivate(interaction, `${moduleKey} is a core module and cannot be disabled.`);
      return;
    }

    const enabled = subcommand === "enable";
    await ctx.db.moduleConfig.upsert({
      where: { guildId_moduleKey: { guildId: interaction.guildId, moduleKey } },
      create: { guildId: interaction.guildId, moduleKey, enabled },
      update: { enabled }
    });

    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.ModulesManage,
      targetType: "ModuleConfig",
      targetId: moduleKey,
      summary: `${moduleKey} module ${enabled ? "enabled" : "disabled"}.`
    });

    await replyPrivate(interaction, `${moduleKey} module ${enabled ? "enabled" : "disabled"}.`);
  }
};
