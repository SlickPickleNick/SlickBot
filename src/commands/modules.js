const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys, defaultModules, isCoreModule, isImplementedModule } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { query } = require('../services/db');
const { buildModulesPanel } = require('../modules/ui/panels');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');

const moduleChoices = Object.values(ModuleKeys).map((moduleKey) => ({ name: moduleKey, value: moduleKey }));

module.exports = {
  data: new SlashCommandBuilder().setName('modules').setDescription('Open or manage SlickBot modules.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the interactive module manager.'))
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List all module states.'))
    .addSubcommand((subcommand) => subcommand.setName('enable').setDescription('Enable a module.').addStringOption((option) => option.setName('module').setDescription('Module to enable.').setRequired(true).addChoices(...moduleChoices)))
    .addSubcommand((subcommand) => subcommand.setName('disable').setDescription('Disable a module.').addStringOption((option) => option.setName('module').setDescription('Module to disable.').setRequired(true).addChoices(...moduleChoices))),
  actionKey: ActionKeys.ModulesManage,
  moduleKey: ModuleKeys.PERMISSIONS,
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
    for (const moduleConfig of defaultModules) await query(`INSERT INTO module_configs (guild_id, module_key, enabled) VALUES ($1, $2, $3) ON CONFLICT (guild_id, module_key) DO NOTHING`, [interaction.guildId, moduleConfig.key, moduleConfig.enabled]);
    if (subcommand === 'panel' || subcommand === 'list') return replyPrivate(interaction, await buildModulesPanel(interaction.guildId));
    const moduleKey = interaction.options.getString('module', true);
    if (!isImplementedModule(moduleKey)) return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Module Coming Soon', description: `**${moduleKey}** has not been built yet. It will appear as 🕒 Coming Soon in the module panel until it is released.`, color: SlickBotColors.WARNING })] });
    if (isCoreModule(moduleKey) && subcommand === 'disable') return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Core Module Locked', description: `**${moduleKey}** is a core module and cannot be disabled.`, color: SlickBotColors.WARNING })] });
    const enabled = subcommand === 'enable';
    await query(`INSERT INTO module_configs (guild_id, module_key, enabled) VALUES ($1, $2, $3) ON CONFLICT (guild_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`, [interaction.guildId, moduleKey, enabled]);
    await ctx.logger.writeAudit({ guildId: interaction.guildId, actorUserId: interaction.user.id, actionKey: ActionKeys.ModulesManage, targetType: 'ModuleConfig', targetId: moduleKey, summary: `${moduleKey} module ${enabled ? 'enabled' : 'disabled'}.` });
    await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'module-config', title: `Module ${enabled ? 'Enabled' : 'Disabled'}`, body: [`Module: **${moduleKey}**`, `Updated By: <@${interaction.user.id}>`].join('\n'), metadata: { moduleKey, enabled, actorUserId: interaction.user.id } });
    await replyPrivate(interaction, await buildModulesPanel(interaction.guildId));
  }
};
