const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const packageInfo = require('../../package.json');
const { query } = require('../services/db');
const { ModuleKeys, defaultModules, implementedModules, isImplementedModule } = require('../modules/moduleRegistry');
const {
  ActionKeys,
  defaultActionLevels,
  defaultModuleLevels,
  PERMISSION_DEFAULTS_VERSION
} = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');

function formatStatus(ok) {
  return ok ? '✅' : '⚠️';
}

function findMissingCoverage() {
  const actionValues = Object.values(ActionKeys);
  const moduleValues = Object.values(ModuleKeys).filter((moduleKey) => isImplementedModule(moduleKey));
  return {
    missingActions: actionValues.filter((actionKey) => !defaultActionLevels[actionKey]),
    missingModules: moduleValues.filter((moduleKey) => !defaultModuleLevels[moduleKey])
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('SlickBot diagnostics and version tools.')
    .addSubcommand((subcommand) => subcommand.setName('version').setDescription('Show the currently running SlickBot version.'))
    .addSubcommand((subcommand) => subcommand.setName('test').setDescription('Run a safe diagnostic check for SlickBot modules.')),
  moduleKey: ModuleKeys.STATUS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'test') return ActionKeys.BotTest;
    return ActionKeys.BotVersion;
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'version') {
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('SlickBot Version', `Running **SlickBot v${packageInfo.version}**.\nPermission defaults: **${PERMISSION_DEFAULTS_VERSION}**.`)]
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const checks = [];
    let moduleRows = [];

    try {
      await query('SELECT 1 AS ok');
      checks.push({ name: 'Database connection', ok: true });
    } catch (error) {
      checks.push({ name: 'Database connection', ok: false, detail: error instanceof Error ? error.message : String(error) });
    }

    try {
      await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
      checks.push({ name: 'Guild configuration', ok: true });
    } catch (error) {
      checks.push({ name: 'Guild configuration', ok: false, detail: error instanceof Error ? error.message : String(error) });
    }

    try {
      for (const moduleConfig of defaultModules) {
        await query(
          `INSERT INTO module_configs (guild_id, module_key, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (guild_id, module_key) DO NOTHING`,
          [interaction.guildId, moduleConfig.key, moduleConfig.enabled]
        );
      }
      const result = await query(
        `SELECT module_key, enabled
         FROM module_configs
         WHERE guild_id = $1
         ORDER BY module_key ASC`,
        [interaction.guildId]
      );
      moduleRows = result.rows;
      const implementedCount = moduleRows.filter((row) => implementedModules.includes(row.module_key)).length;
      checks.push({ name: `Module records (${implementedCount}/${implementedModules.length})`, ok: implementedCount >= implementedModules.length });
    } catch (error) {
      checks.push({ name: 'Module records', ok: false, detail: error instanceof Error ? error.message : String(error) });
    }

    const coverage = findMissingCoverage();
    checks.push({
      name: 'Permission defaults',
      ok: coverage.missingActions.length === 0 && coverage.missingModules.length === 0,
      detail: coverage.missingActions.length || coverage.missingModules.length
        ? `Missing actions: ${coverage.missingActions.length}; missing modules: ${coverage.missingModules.length}`
        : `${Object.values(ActionKeys).length} action(s), ${implementedModules.length} module(s)`
    });

    checks.push({ name: 'Discord client connection', ok: Boolean(ctx.client?.isReady?.()) });

    const failed = checks.filter((check) => !check.ok);
    const moduleLines = implementedModules.map((moduleKey) => {
      const row = moduleRows.find((entry) => entry.module_key === moduleKey);
      if (!row) return `⚠️ **${moduleKey}**: missing config row`;
      return `${row.enabled ? '✅' : '⏸️'} **${moduleKey}**: ${row.enabled ? 'enabled' : 'disabled'}`;
    });

    const description = [
      `Running **SlickBot v${packageInfo.version}**`,
      `Permission defaults: **${PERMISSION_DEFAULTS_VERSION}**`,
      '',
      '**Core Checks**',
      ...checks.map((check) => `${formatStatus(check.ok)} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`),
      '',
      '**Implemented Modules**',
      ...moduleLines
    ].join('\n');

    return replyPrivate(interaction, {
      embeds: [createBaseEmbed({
        title: failed.length ? 'SlickBot Diagnostic Check Completed with Warnings' : 'SlickBot Diagnostic Check Passed',
        description,
        color: failed.length ? SlickBotColors.WARNING : SlickBotColors.SUCCESS,
        footer: 'This is a safe static/runtime readiness check. It does not rename channels, send test panels, or mutate module data beyond ensuring missing module config rows exist.'
      })]
    });
  }
};
