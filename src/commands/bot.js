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
const { createBaseEmbed, createSuccessEmbed, SlickBotColors } = require('../modules/ui/uiService');

const MODULE_CHECKS = {
  [ModuleKeys.PERMISSIONS]: [
    { name: 'Guild config', sql: 'SELECT COUNT(*)::int AS count FROM guild_configs WHERE guild_id = $1' },
    { name: 'Module config', sql: 'SELECT COUNT(*)::int AS count FROM module_configs WHERE guild_id = $1' },
    { name: 'Permission defaults', sql: 'SELECT COUNT(*)::int AS count FROM permission_default_versions WHERE guild_id = $1' }
  ],
  [ModuleKeys.LOGGING]: [
    { name: 'Module log settings', sql: 'SELECT COUNT(*)::int AS count FROM log_module_settings WHERE guild_id = $1' },
    { name: 'Event log settings', sql: 'SELECT COUNT(*)::int AS count FROM log_settings WHERE guild_id = $1' },
    { name: 'Queue table', sql: 'SELECT COUNT(*)::int AS count FROM log_queue_items WHERE guild_id = $1' }
  ],
  [ModuleKeys.STATUS]: [
    { name: 'Presence settings', sql: 'SELECT COUNT(*)::int AS count FROM bot_presence_settings WHERE guild_id = $1' }
  ],
  [ModuleKeys.MODERATION]: [
    { name: 'Cases', sql: 'SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id = $1' },
    { name: 'User notes', sql: 'SELECT COUNT(*)::int AS count FROM user_notes WHERE guild_id = $1' }
  ],
  [ModuleKeys.TICKETS]: [
    { name: 'Ticket config', sql: 'SELECT COUNT(*)::int AS count FROM ticket_configs WHERE guild_id = $1' },
    { name: 'Ticket types', sql: 'SELECT COUNT(*)::int AS count FROM ticket_types WHERE guild_id = $1' },
    { name: 'Tickets', sql: 'SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1' },
    { name: 'Added-user tracking', sql: 'SELECT COUNT(*)::int AS count FROM ticket_added_users WHERE guild_id = $1' }
  ],
  [ModuleKeys.REPORTS]: [
    { name: 'Report config', sql: 'SELECT COUNT(*)::int AS count FROM report_configs WHERE guild_id = $1' },
    { name: 'Reports', sql: 'SELECT COUNT(*)::int AS count FROM reports WHERE guild_id = $1' }
  ],
  [ModuleKeys.APPLICATIONS]: [
    { name: 'Application types', sql: 'SELECT COUNT(*)::int AS count FROM application_types WHERE guild_id = $1' },
    { name: 'Application questions', sql: 'SELECT COUNT(*)::int AS count FROM application_questions q INNER JOIN application_types t ON t.id = q.application_type_id WHERE t.guild_id = $1' },
    { name: 'Application sessions', sql: 'SELECT COUNT(*)::int AS count FROM application_sessions WHERE guild_id = $1' },
    { name: 'Application submissions', sql: 'SELECT COUNT(*)::int AS count FROM application_submissions WHERE guild_id = $1' }
  ],
  [ModuleKeys.APPEALS]: [
    { name: 'Appeal config', sql: 'SELECT COUNT(*)::int AS count FROM appeal_configs WHERE guild_id = $1' },
    { name: 'Appeals', sql: 'SELECT COUNT(*)::int AS count FROM appeals WHERE guild_id = $1' }
  ],
  [ModuleKeys.SCHEDULED_MESSAGES]: [
    { name: 'Scheduled config', sql: 'SELECT COUNT(*)::int AS count FROM scheduled_message_configs WHERE guild_id = $1' },
    { name: 'Scheduled messages', sql: 'SELECT COUNT(*)::int AS count FROM scheduled_messages WHERE guild_id = $1' }
  ],
  [ModuleKeys.WELCOME]: [
    { name: 'Welcome config', sql: 'SELECT COUNT(*)::int AS count FROM welcome_configs WHERE guild_id = $1' },
    { name: 'Auto roles', sql: 'SELECT COUNT(*)::int AS count FROM welcome_auto_roles WHERE guild_id = $1' }
  ],
  [ModuleKeys.REACTION_ROLES]: [
    { name: 'Role panels', sql: 'SELECT COUNT(*)::int AS count FROM role_panels WHERE guild_id = $1' },
    { name: 'Role options', sql: 'SELECT COUNT(*)::int AS count FROM role_panel_options o INNER JOIN role_panels p ON p.id = o.panel_id WHERE p.guild_id = $1' },
    { name: 'Published panels', sql: "SELECT COUNT(*)::int AS count FROM panel_messages WHERE guild_id = $1 AND panel_type = 'role'" }
  ],
  [ModuleKeys.GIVEAWAYS]: [
    { name: 'Giveaway config', sql: 'SELECT COUNT(*)::int AS count FROM giveaway_configs WHERE guild_id = $1' },
    { name: 'Giveaways', sql: 'SELECT COUNT(*)::int AS count FROM giveaways WHERE guild_id = $1' },
    { name: 'Entries', sql: 'SELECT COUNT(*)::int AS count FROM giveaway_entries e INNER JOIN giveaways g ON g.id = e.giveaway_id WHERE g.guild_id = $1' }
  ],
  [ModuleKeys.BIRTHDAYS]: [
    { name: 'Birthday config', sql: 'SELECT COUNT(*)::int AS count FROM birthday_configs WHERE guild_id = $1' },
    { name: 'Profiles', sql: 'SELECT COUNT(*)::int AS count FROM birthday_profiles WHERE guild_id = $1' },
    { name: 'Active grants', sql: 'SELECT COUNT(*)::int AS count FROM birthday_active_grants WHERE guild_id = $1' }
  ],
  [ModuleKeys.LEVELING]: [
    { name: 'Leveling config', sql: 'SELECT COUNT(*)::int AS count FROM leveling_configs WHERE guild_id = $1' },
    { name: 'XP profiles', sql: 'SELECT COUNT(*)::int AS count FROM leveling_profiles WHERE guild_id = $1' },
    { name: 'Reward roles', sql: 'SELECT COUNT(*)::int AS count FROM leveling_role_rewards WHERE guild_id = $1' },
    { name: 'Multiplier roles', sql: 'SELECT COUNT(*)::int AS count FROM leveling_multiplier_roles WHERE guild_id = $1' }
  ],
  [ModuleKeys.SERVER_STATS]: [
    { name: 'Stats config', sql: 'SELECT COUNT(*)::int AS count FROM server_stats_configs WHERE guild_id = $1' }
  ],
  [ModuleKeys.BOT_UPDATES]: [
    { name: 'Update config', sql: 'SELECT COUNT(*)::int AS count FROM bot_update_configs WHERE guild_id = $1' },
    { name: 'Ping roles', sql: 'SELECT COUNT(*)::int AS count FROM bot_update_ping_roles WHERE guild_id = $1' },
    { name: 'Announcements', sql: 'SELECT COUNT(*)::int AS count FROM bot_update_announcements WHERE guild_id = $1' }
  ],
  [ModuleKeys.CUSTOM_COMMANDS]: [
    { name: 'Custom command config', sql: 'SELECT COUNT(*)::int AS count FROM custom_command_configs WHERE guild_id = $1' },
    { name: 'Custom commands', sql: 'SELECT COUNT(*)::int AS count FROM custom_commands WHERE guild_id = $1' },
    { name: 'Usage logs', sql: 'SELECT COUNT(*)::int AS count FROM custom_command_usage_logs WHERE guild_id = $1' }
  ]
};

function statusIcon(status) {
  if (status === 'ok') return '✅';
  if (status === 'disabled') return '⏸️';
  if (status === 'warning') return '⚠️';
  return '❌';
}

function findMissingCoverage() {
  const actionValues = Object.values(ActionKeys);
  const moduleValues = Object.values(ModuleKeys).filter((moduleKey) => isImplementedModule(moduleKey));
  return {
    missingActions: actionValues.filter((actionKey) => !defaultActionLevels[actionKey]),
    missingModules: moduleValues.filter((moduleKey) => !defaultModuleLevels[moduleKey])
  };
}

async function runModuleHealthCheck(guildId, moduleKey, enabled) {
  const checks = MODULE_CHECKS[moduleKey] || [];
  const details = [];
  for (const check of checks) {
    try {
      const result = await query(check.sql, [guildId]);
      const count = Number(result.rows[0]?.count || 0);
      details.push(`${check.name}: ${count}`);
    } catch (error) {
      return {
        moduleKey,
        status: 'error',
        detail: `${check.name} failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  if (!enabled) {
    return { moduleKey, status: 'disabled', detail: 'disabled in this server' };
  }

  if (!checks.length) {
    return { moduleKey, status: 'warning', detail: 'no diagnostic checks registered' };
  }

  return { moduleKey, status: 'ok', detail: details.join(' · ') };
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
      checks.push({ name: 'Database connection', status: 'ok' });
    } catch (error) {
      checks.push({ name: 'Database connection', status: 'error', detail: error instanceof Error ? error.message : String(error) });
    }

    try {
      await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
      checks.push({ name: 'Guild configuration', status: 'ok' });
    } catch (error) {
      checks.push({ name: 'Guild configuration', status: 'error', detail: error instanceof Error ? error.message : String(error) });
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
      checks.push({ name: `Module records (${implementedCount}/${implementedModules.length})`, status: implementedCount >= implementedModules.length ? 'ok' : 'error' });
    } catch (error) {
      checks.push({ name: 'Module records', status: 'error', detail: error instanceof Error ? error.message : String(error) });
    }

    const coverage = findMissingCoverage();
    checks.push({
      name: 'Permission defaults',
      status: coverage.missingActions.length === 0 && coverage.missingModules.length === 0 ? 'ok' : 'error',
      detail: coverage.missingActions.length || coverage.missingModules.length
        ? `Missing actions: ${coverage.missingActions.length}; missing modules: ${coverage.missingModules.length}`
        : `${Object.values(ActionKeys).length} action(s), ${implementedModules.length} module(s)`
    });

    checks.push({ name: 'Discord client connection', status: ctx.client?.isReady?.() ? 'ok' : 'error' });

    const moduleHealth = [];
    for (const moduleKey of implementedModules) {
      const row = moduleRows.find((entry) => entry.module_key === moduleKey);
      if (!row) {
        moduleHealth.push({ moduleKey, status: 'error', detail: 'missing module config row' });
        continue;
      }
      moduleHealth.push(await runModuleHealthCheck(interaction.guildId, moduleKey, row.enabled));
    }

    const failed = checks.filter((check) => check.status === 'error').length + moduleHealth.filter((check) => check.status === 'error').length;
    const warnings = checks.filter((check) => check.status === 'warning').length + moduleHealth.filter((check) => check.status === 'warning').length;
    const moduleLines = moduleHealth.map((check) => `${statusIcon(check.status)} **${check.moduleKey}**: ${check.detail}`);

    const description = [
      `Running **SlickBot v${packageInfo.version}**`,
      `Permission defaults: **${PERMISSION_DEFAULTS_VERSION}**`,
      '',
      '**Core Checks**',
      ...checks.map((check) => `${statusIcon(check.status)} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`),
      '',
      '**Module Health**',
      ...moduleLines,
      '',
      failed ? `**Result:** ${failed} error(s) found. Review the failed module line(s) above.` : warnings ? `**Result:** Passed with ${warnings} warning(s).` : '**Result:** All enabled modules passed their diagnostic checks.'
    ].join('\n');

    return replyPrivate(interaction, {
      embeds: [createBaseEmbed({
        title: failed ? 'SlickBot Diagnostic Check Failed' : warnings ? 'SlickBot Diagnostic Check Completed with Warnings' : 'SlickBot Diagnostic Check Passed',
        description,
        color: failed ? SlickBotColors.ERROR : warnings ? SlickBotColors.WARNING : SlickBotColors.SUCCESS,
        footer: 'Safe diagnostic. It verifies module config and database readiness without posting panels, renaming channels, or sending test messages.'
      })]
    });
  }
};
