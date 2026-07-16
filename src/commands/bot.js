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
const { getModuleStatus } = require('../modules/ui/panels');

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
  [ModuleKeys.LOCKDOWN]: [
    { name: 'Lockdown presets', sql: 'SELECT COUNT(*)::int AS count FROM lockdown_presets WHERE guild_id = $1' },
    { name: 'Controlled channels', sql: 'SELECT COUNT(*)::int AS count FROM lockdown_preset_channels WHERE guild_id = $1' },
    { name: 'Lockdown sessions', sql: 'SELECT COUNT(*)::int AS count FROM lockdown_sessions WHERE guild_id = $1' }
  ],
  [ModuleKeys.TICKETS]: [
    { name: 'Ticket config', sql: 'SELECT COUNT(*)::int AS count FROM ticket_configs WHERE guild_id = $1' },
    { name: 'Ticket types', sql: 'SELECT COUNT(*)::int AS count FROM ticket_types WHERE guild_id = $1' },
    { name: 'Tickets', sql: 'SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1' },
    { name: 'Added-user tracking', sql: 'SELECT COUNT(*)::int AS count FROM ticket_added_users WHERE guild_id = $1' },
    { name: 'Ticket review indexes', sql: 'SELECT COUNT(*)::int AS count FROM ticket_review_indexes WHERE guild_id = $1' }
  ],
  [ModuleKeys.REPORTS]: [
    { name: 'Report config', sql: 'SELECT COUNT(*)::int AS count FROM report_configs WHERE guild_id = $1' },
    { name: 'Reports', sql: 'SELECT COUNT(*)::int AS count FROM reports WHERE guild_id = $1' },
    { name: 'Report review indexes', sql: 'SELECT COUNT(*)::int AS count FROM report_review_indexes WHERE guild_id = $1' }
  ],
  [ModuleKeys.APPLICATIONS]: [
    { name: 'Application types', sql: 'SELECT COUNT(*)::int AS count FROM application_types WHERE guild_id = $1' },
    { name: 'Application questions', sql: 'SELECT COUNT(*)::int AS count FROM application_questions q INNER JOIN application_types t ON t.id = q.application_type_id WHERE t.guild_id = $1' },
    { name: 'Application sessions', sql: 'SELECT COUNT(*)::int AS count FROM application_sessions WHERE guild_id = $1' },
    { name: 'Application submissions', sql: 'SELECT COUNT(*)::int AS count FROM application_submissions WHERE guild_id = $1' },
    { name: 'Application review indexes', sql: 'SELECT COUNT(*)::int AS count FROM application_review_indexes WHERE guild_id = $1' }
  ],
  [ModuleKeys.APPEALS]: [
    { name: 'Appeal config', sql: 'SELECT COUNT(*)::int AS count FROM appeal_configs WHERE guild_id = $1' },
    { name: 'Appeals', sql: 'SELECT COUNT(*)::int AS count FROM appeals WHERE guild_id = $1' },
    { name: 'Appeal review indexes', sql: 'SELECT COUNT(*)::int AS count FROM appeal_review_indexes WHERE guild_id = $1' }
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
  ],
  [ModuleKeys.JOIN_TO_CREATE]: [
    { name: 'Join-create hubs', sql: 'SELECT COUNT(*)::int AS count FROM join_create_hubs WHERE guild_id = $1' },
    { name: 'Active temp channels', sql: "SELECT COUNT(*)::int AS count FROM join_create_temp_channels WHERE guild_id = $1 AND status = 'ACTIVE'" },
    { name: 'All temp channels', sql: 'SELECT COUNT(*)::int AS count FROM join_create_temp_channels WHERE guild_id = $1' }
  ],
  [ModuleKeys.COMMUNITY_GAMES]: [
    { name: 'Game configs', sql: 'SELECT COUNT(*)::int AS count FROM community_game_configs WHERE guild_id = $1' },
    { name: 'Counting config', sql: 'SELECT COUNT(*)::int AS count FROM counting_game_configs WHERE guild_id = $1' },
    { name: 'Active counting entries', sql: 'SELECT COUNT(*)::int AS count FROM counting_game_entries WHERE guild_id = $1' },
    { name: 'Game sessions', sql: 'SELECT COUNT(*)::int AS count FROM community_game_sessions WHERE guild_id = $1' },
    { name: 'Game statistics', sql: 'SELECT COUNT(*)::int AS count FROM community_game_stats WHERE guild_id = $1' }
  ],
  [ModuleKeys.FAQ]: [
    { name: 'FAQ config', sql: 'SELECT COUNT(*)::int AS count FROM faq_configs WHERE guild_id = $1' }
  ],
  [ModuleKeys.SUGGESTIONS]: [
    { name: 'Suggestion config', sql: 'SELECT COUNT(*)::int AS count FROM suggestion_configs WHERE guild_id = $1' },
    { name: 'Suggestion categories', sql: 'SELECT COUNT(*)::int AS count FROM suggestion_categories WHERE guild_id = $1' },
    { name: 'Suggestions', sql: 'SELECT COUNT(*)::int AS count FROM suggestions WHERE guild_id = $1' },
    { name: 'Suggestion votes', sql: 'SELECT COUNT(*)::int AS count FROM suggestion_votes WHERE guild_id = $1' },
    { name: 'Suggestion review indexes', sql: 'SELECT COUNT(*)::int AS count FROM suggestion_review_indexes WHERE guild_id = $1' }
  ]
};

const MODULE_FIXES = Object.freeze({
  [ModuleKeys.LOGGING]: 'Run `/logging panel`, then configure channels with `/logging set-channel`.',
  [ModuleKeys.TICKETS]: 'Run `/ticket setup`, create ticket types as needed, then post a ticket panel with `/ticket panel`.',
  [ModuleKeys.REPORTS]: 'Run `/report setup` and set a review channel.',
  [ModuleKeys.APPLICATIONS]: 'Run `/application setup`, add questions with `/application question-add`, then post an application panel.',
  [ModuleKeys.APPEALS]: 'Run `/appeal setup` or `/appeal edit` and set a review channel.',
  [ModuleKeys.LOCKDOWN]: 'Run `/lockdown setup`, add channels with `/lockdown channel-add`, and test `/lockdown start` / `/lockdown end` carefully.',
  [ModuleKeys.WELCOME]: 'Run `/welcome setup` and optionally configure auto roles.',
  [ModuleKeys.REACTION_ROLES]: 'Run `/roles create-panel`, add options, then post the panel.',
  [ModuleKeys.GIVEAWAYS]: 'Run `/giveaway setup` and set a default channel.',
  [ModuleKeys.BIRTHDAYS]: 'Run `/birthday setup` and configure an announcement channel or birthday role.',
  [ModuleKeys.SCHEDULED_MESSAGES]: 'Run `/schedule setup` and set a default channel.',
  [ModuleKeys.LEVELING]: 'Run `/level setup` and review rewards/multipliers with `/level manager`.',
  [ModuleKeys.SERVER_STATS]: 'Run `/stats setup`, confirm SlickBot can rename the configured stat channels, then run `/stats refresh`.',
  [ModuleKeys.BOT_UPDATES]: 'Run `/bot-updates setup` and configure an update channel.',
  [ModuleKeys.CUSTOM_COMMANDS]: 'Run `/custom-command create` to add your first command.',
  [ModuleKeys.JOIN_TO_CREATE]: 'Run `/join-create create-hub` or `/join-create setup` to configure a hub channel.',
  [ModuleKeys.COMMUNITY_GAMES]: 'Run `/games manager`, configure games, enable each game separately, then post a launcher with `/games panel post` if desired.',
  [ModuleKeys.FAQ]: 'Run `/faq setup` with a forum channel, create FAQ posts in that forum, then run `/faq refresh`.',
  [ModuleKeys.SUGGESTIONS]: 'Run `/suggestion setup`, add/review categories, post a launcher with `/suggestion panel post`, and create a staff index with `/suggestion review-index`.'
});

function statusIcon(status) {
  if (status === 'ok') return '✅';
  if (status === 'disabled') return '⏸️';
  if (status === 'warning') return '⚠️';
  if (status === 'needs_setup') return '🟣';
  if (status === 'partial') return '🟠';
  return '⛔';
}

function findMissingCoverage() {
  const actionValues = Object.values(ActionKeys);
  const moduleValues = Object.values(ModuleKeys).filter((moduleKey) => isImplementedModule(moduleKey));
  return {
    missingActions: actionValues.filter((actionKey) => !defaultActionLevels[actionKey]),
    missingModules: moduleValues.filter((moduleKey) => !defaultModuleLevels[moduleKey])
  };
}

function recommendedFixFor(check) {
  if (check.fix) return check.fix;
  if (check.moduleKey && MODULE_FIXES[check.moduleKey]) return MODULE_FIXES[check.moduleKey];
  if (check.name === 'Database connection') return 'Check Railway Postgres is attached and `DATABASE_URL` is available to the deployment.';
  if (check.name === 'Guild configuration') return 'Run `/setup` in the server, then run `/bot test` again.';
  if (String(check.name || '').startsWith('Module records')) return 'Run `/modules panel` or `/permissions apply-defaults` to reseed module records.';
  if (check.name === 'Permission defaults') return 'Run `/permissions apply-defaults` to reseed the current permission defaults.';
  if (check.name === 'Discord client connection') return 'Check Railway logs, bot token, and Discord gateway connectivity.';
  return null;
}

async function runDbCheck(guildId, moduleKey) {
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
        detail: `${check.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        fix: 'This usually indicates a missing/failed database migration. Check Railway startup logs and rerun the latest build.'
      };
    }
  }

  if (!checks.length) {
    return { moduleKey, status: 'warning', detail: 'no database diagnostic checks registered' };
  }

  return { moduleKey, status: 'ok', detail: details.join(' · ') };
}

function normalizeModuleHealth(dbHealth, setupStatus, enabled) {
  if (!enabled) return { moduleKey: dbHealth.moduleKey, status: 'disabled', detail: 'Disabled in this server.' };
  if (dbHealth.status === 'error') return dbHealth;
  if (!setupStatus) return dbHealth;

  if (setupStatus.state === 'READY') {
    return { moduleKey: dbHealth.moduleKey, status: 'ok', detail: `${setupStatus.label} — ${setupStatus.note || dbHealth.detail}` };
  }
  if (setupStatus.state === 'NEEDS_CONFIG') {
    return { moduleKey: dbHealth.moduleKey, status: 'needs_setup', detail: `Needs Setup — ${setupStatus.note || 'configuration required'}` };
  }
  if (setupStatus.state === 'PARTIAL') {
    return { moduleKey: dbHealth.moduleKey, status: 'partial', detail: `Partially Configured — ${setupStatus.note || 'review settings'}` };
  }
  if (setupStatus.state === 'DISABLED') {
    return { moduleKey: dbHealth.moduleKey, status: 'disabled', detail: setupStatus.note || 'Disabled in this server.' };
  }

  return dbHealth;
}

function chunkLines(lines, maxLength = 3600) {
  const chunks = [];
  let current = [];
  let currentLength = 0;
  for (const line of lines) {
    const nextLength = currentLength + line.length + 1;
    if (nextLength > maxLength && current.length) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function compactDetail(value, maxLength = 190) {
  const text = String(value || 'No detail.');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
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
      checks.push({
        name: `Module records (${implementedCount}/${implementedModules.length})`,
        status: implementedCount >= implementedModules.length ? 'ok' : 'error',
        detail: implementedCount >= implementedModules.length ? null : 'One or more implemented modules is missing a config row.'
      });
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
        moduleHealth.push({ moduleKey, status: 'error', detail: 'Missing module config row.', fix: 'Run `/modules panel` or `/permissions apply-defaults` to reseed module configuration.' });
        continue;
      }
      const dbHealth = await runDbCheck(interaction.guildId, moduleKey);
      let setupStatus = null;
      try {
        setupStatus = await getModuleStatus(interaction.guildId, row);
      } catch (error) {
        moduleHealth.push({ moduleKey, status: 'error', detail: `Setup status failed: ${error instanceof Error ? error.message : String(error)}`, fix: 'Check Railway logs for the module status query failure.' });
        continue;
      }
      moduleHealth.push(normalizeModuleHealth(dbHealth, setupStatus, Boolean(row.enabled)));
    }

    const errors = [...checks, ...moduleHealth].filter((check) => check.status === 'error');
    const warnings = [...checks, ...moduleHealth].filter((check) => ['warning', 'needs_setup', 'partial'].includes(check.status));
    const moduleLines = moduleHealth.map((check) => `${statusIcon(check.status)} **${check.moduleKey}** — ${compactDetail(check.detail)}`);
    const recommendations = [...errors, ...warnings]
      .map((check) => {
        const fix = recommendedFixFor(check);
        return fix ? `${statusIcon(check.status)} **${check.moduleKey || check.name}**: ${fix}` : null;
      })
      .filter(Boolean);

    const coreLines = checks.map((check) => `${statusIcon(check.status)} ${check.name}${check.detail ? ` — ${compactDetail(check.detail, 160)}` : ''}`);
    const resultLine = errors.length
      ? `**Result:** ${errors.length} error(s) found. Review the recommended fixes below.`
      : warnings.length
        ? `**Result:** No blocking errors found. ${warnings.length} module(s)/check(s) need setup or review.`
        : '**Result:** All enabled modules passed their diagnostic checks.';

    const baseDescription = [
      `Running **SlickBot v${packageInfo.version}**`,
      `Permission defaults: **${PERMISSION_DEFAULTS_VERSION}**`,
      '',
      '**Core Checks**',
      ...coreLines,
      '',
      '**Status Legend**',
      '✅ Ready · 🟠 Partially Configured · 🟣 Needs Setup · ⏸️ Disabled · ⚠️ Warning · ⛔ Error',
      '',
      '**Module Health**'
    ];

    const chunks = chunkLines([...baseDescription, ...moduleLines, '', resultLine]);
    const embeds = chunks.map((chunk, index) => createBaseEmbed({
      title: index === 0
        ? errors.length ? 'SlickBot Diagnostic Check Failed' : warnings.length ? 'SlickBot Diagnostic Check Needs Review' : 'SlickBot Diagnostic Check Passed'
        : 'SlickBot Diagnostic Check Continued',
      description: chunk.join('\n'),
      color: errors.length ? SlickBotColors.ERROR : warnings.length ? SlickBotColors.WARNING : SlickBotColors.SUCCESS,
      footer: 'Safe diagnostic. It verifies module setup and database readiness without posting panels, renaming channels, or sending test messages.'
    }));

    if (recommendations.length) {
      embeds.push(createBaseEmbed({
        title: 'Recommended Fixes',
        description: chunkLines(recommendations, 3600)[0].join('\n'),
        color: errors.length ? SlickBotColors.ERROR : SlickBotColors.WARNING,
        footer: 'Run the recommended command(s), then run /bot test again.'
      }));
    }

    return replyPrivate(interaction, { embeds: embeds.slice(0, 10) });
  }
};
