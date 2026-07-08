const { CustomIds } = require('../modules/ui/customIds');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { ModuleKeys, isCoreModule } = require('../modules/moduleRegistry');
const { query } = require('./db');
const { replyPrivate } = require('../utils/reply');
const { buildSetupPanel, buildModulesPanel, buildLoggingPanel, buildTeamsPanel } = require('../modules/ui/panels');
const { buildStatusPanel } = require('../commands/status');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { ActivityTypeNames, PresenceStatus } = require('../modules/status/statusService');

async function handleComponentInteraction(interaction, ctx) {
  if (!interaction.guildId) {
    await replyPrivate(interaction, 'This control can only be used inside a server.');
    return true;
  }

  if (interaction.isButton()) {
    return handleButton(interaction, ctx);
  }

  if (interaction.isStringSelectMenu()) {
    return handleSelect(interaction, ctx);
  }

  return false;
}

async function handleButton(interaction, ctx) {
  const id = interaction.customId;

  if (id === CustomIds.SetupRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.Setup, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildSetupPanel(interaction.guildId, interaction.guild ? interaction.guild.name : null));
    return true;
  }

  if (id === CustomIds.SetupModules || id === CustomIds.ModulesRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupLogging || id === CustomIds.LoggingRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingView, ModuleKeys.LOGGING))) return true;
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupTeams) {
    if (!(await requireAction(interaction, ctx, ActionKeys.TeamsManage, ModuleKeys.PERMISSIONS))) return true;
    await updatePanel(interaction, await buildTeamsPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.SetupStatus || id === CustomIds.StatusRefresh) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusView, ModuleKeys.STATUS))) return true;
    await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx));
    return true;
  }

  if (id === CustomIds.LoggingFlush) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    await ctx.logger.flushGuildBatches(interaction.guildId);
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if (id === CustomIds.LoggingTest) {
    if (!(await requireAction(interaction, ctx, ActionKeys.LoggingConfigure, ModuleKeys.LOGGING))) return true;
    await ctx.logger.log({
      guildId: interaction.guildId,
      eventKey: 'system',
      title: 'SlickBot Test Log',
      body: `Test log created by ${interaction.user.tag}.`,
      actorUserId: interaction.user.id
    });
    await updatePanel(interaction, await buildLoggingPanel(interaction.guildId));
    return true;
  }

  if ([CustomIds.StatusQuickOnline, CustomIds.StatusQuickIdle, CustomIds.StatusQuickDnd, CustomIds.StatusClear].includes(id)) {
    if (!(await requireAction(interaction, ctx, ActionKeys.StatusManage, ModuleKeys.STATUS))) return true;

    if (id === CustomIds.StatusClear) {
      await ctx.status.clearPresence(interaction.guildId, true);
      await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, 'Status cleared.'));
      return true;
    }

    const status = id === CustomIds.StatusQuickOnline
      ? PresenceStatus.ONLINE
      : id === CustomIds.StatusQuickIdle
        ? PresenceStatus.IDLE
        : PresenceStatus.DND;

    const saved = await ctx.status.getSavedPresence(interaction.guildId);
    const next = saved || {
      activityType: ActivityTypeNames.WATCHING,
      activityText: 'the server',
      activityUrl: null
    };

    await ctx.status.applyPresence({ ...next, status });
    await ctx.status.savePresence(interaction.guildId, { ...next, status });
    await updatePanel(interaction, await buildStatusPanel(interaction.guildId, ctx, `Status set to ${status}.`));
    return true;
  }

  return false;
}

async function handleSelect(interaction, ctx) {
  const id = interaction.customId;

  if (id === CustomIds.ModulesSelect) {
    if (!(await requireAction(interaction, ctx, ActionKeys.ModulesManage, ModuleKeys.PERMISSIONS))) return true;

    const moduleKey = interaction.values[0];
    if (isCoreModule(moduleKey)) {
      await updatePanel(interaction, {
        embeds: [createBaseEmbed({
          title: 'Core Module Locked',
          description: `**${moduleKey}** is a core SlickBot module and cannot be disabled.`,
          color: SlickBotColors.WARNING
        })],
        components: (await buildModulesPanel(interaction.guildId)).components
      });
      return true;
    }

    const current = await query(
      `SELECT enabled FROM module_configs WHERE guild_id = $1 AND module_key = $2 LIMIT 1`,
      [interaction.guildId, moduleKey]
    );
    const nextEnabled = !(current.rows[0]?.enabled);

    await query(
      `INSERT INTO module_configs (guild_id, module_key, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, module_key)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [interaction.guildId, moduleKey, nextEnabled]
    );

    await ctx.logger.writeAudit({
      guildId: interaction.guildId,
      actorUserId: interaction.user.id,
      actionKey: ActionKeys.ModulesManage,
      targetType: 'ModuleConfig',
      targetId: moduleKey,
      summary: `${moduleKey} module ${nextEnabled ? 'enabled' : 'disabled'} from interactive panel.`
    });

    await updatePanel(interaction, await buildModulesPanel(interaction.guildId));
    return true;
  }

  return false;
}

async function requireAction(interaction, ctx, actionKey, moduleKey) {
  const result = await ctx.permissions.checkInteraction(interaction, actionKey, moduleKey);
  if (result.allowed) return true;

  await replyPrivate(interaction, {
    embeds: [createBaseEmbed({
      title: 'Permission Required',
      description: result.reason || 'You do not have permission to use this control.',
      color: SlickBotColors.ERROR
    })]
  });
  return false;
}

async function updatePanel(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }

  if (typeof interaction.update === 'function') {
    await interaction.update(payload);
    return;
  }

  await replyPrivate(interaction, payload);
}

module.exports = { handleComponentInteraction };
