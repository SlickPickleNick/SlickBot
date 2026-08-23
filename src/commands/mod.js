const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ModerationService } = require('../modules/moderation/moderationService');
const { buildModerationPanel, buildCaseEmbed } = require('../modules/moderation/moderationUi');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { parseDurationToMs } = require('../utils/time');
const { AutoModService } = require('../modules/moderation/autoModService');

const moderation = new ModerationService();
const autoMod = new AutoModService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools, punishments, and infraction auto-escalation.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the moderation control panel.'))
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the moderation control panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warn')
        .setDescription('Create a warning case for a user and evaluate auto-escalation.')
        .addUserOption((option) => option.setName('user').setDescription('User to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning.').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('evidence').setDescription('Optional evidence or context.').setRequired(false).setMaxLength(1000))
        .addBooleanOption((option) => option.setName('dm_user').setDescription('Try to DM the user. Defaults to false.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warnings')
        .setDescription('View a user’s active warnings and escalation status.')
        .addUserOption((option) => option.setName('user').setDescription('User to inspect.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('escalation-list')
        .setDescription('View the server warning escalation matrix.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('escalation-set')
        .setDescription('Set an auto-punishment rule for a warning count threshold.')
        .addIntegerOption((option) => option.setName('warnings').setDescription('Warning count threshold.').setRequired(true).setMinValue(1).setMaxValue(50))
        .addStringOption((option) =>
          option.setName('punishment')
            .setDescription('Punishment to execute.')
            .setRequired(true)
            .addChoices(
              { name: 'Timeout', value: 'TIMEOUT' },
              { name: 'Kick', value: 'KICK' },
              { name: 'Ban', value: 'BAN' }
            )
        )
        .addStringOption((option) => option.setName('duration').setDescription('Timeout duration, such as 10m, 1h, 24h, 7d.').setRequired(false).setMaxLength(30))
        .addIntegerOption((option) => option.setName('days').setDescription('Timeout duration in days.').setRequired(false).setMinValue(1).setMaxValue(28))
        .addIntegerOption((option) => option.setName('hours').setDescription('Timeout duration in hours.').setRequired(false).setMinValue(1).setMaxValue(672))
        .addIntegerOption((option) => option.setName('minutes').setDescription('Timeout duration in minutes.').setRequired(false).setMinValue(1).setMaxValue(40320))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('escalation-remove')
        .setDescription('Remove an auto-escalation rule.')
        .addIntegerOption((option) => option.setName('warnings').setDescription('Warning count threshold to remove.').setRequired(true).setMinValue(1).setMaxValue(50))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timeout')
        .setDescription('Timeout a user and create a moderation case.')
        .addUserOption((option) => option.setName('user').setDescription('User to timeout.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout.').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('duration').setDescription('Flexible duration (e.g. 10m, 2h, 1d, 7d, 28d). Or use days/hours/minutes below.').setRequired(false))
        .addIntegerOption((option) => option.setName('days').setDescription('Timeout duration in days (up to 28 days).').setRequired(false).setMinValue(1).setMaxValue(28))
        .addIntegerOption((option) => option.setName('hours').setDescription('Timeout duration in hours.').setRequired(false).setMinValue(1).setMaxValue(672))
        .addIntegerOption((option) => option.setName('minutes').setDescription('Timeout duration in minutes.').setRequired(false).setMinValue(1).setMaxValue(40320))
        .addStringOption((option) => option.setName('evidence').setDescription('Optional evidence or context.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('untimeout')
        .setDescription('Remove an active timeout from a user and create a moderation case.')
        .addUserOption((option) => option.setName('user').setDescription('User whose timeout should be removed.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Optional reason for removing the timeout.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('kick')
        .setDescription('Kick a user and create a moderation case.')
        .addUserOption((option) => option.setName('user').setDescription('User to kick.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick.').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('evidence').setDescription('Optional evidence or context.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ban')
        .setDescription('Ban a user and create a moderation case.')
        .addUserOption((option) => option.setName('user').setDescription('User to ban.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban.').setRequired(true).setMaxLength(1000))
        .addIntegerOption((option) => option.setName('delete_message_days').setDescription('Delete recent messages from 0–7 days.').setRequired(false).setMinValue(0).setMaxValue(7))
        .addStringOption((option) => option.setName('evidence').setDescription('Optional evidence or context.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unban')
        .setDescription('Unban a user ID and create a moderation case.')
        .addStringOption((option) => option.setName('user_id').setDescription('Discord user ID to unban.').setRequired(true).setMinLength(15).setMaxLength(25))
        .addStringOption((option) => option.setName('reason').setDescription('Optional reason for the unban.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('massban')
        .setDescription('Bulk ban user IDs and create moderation cases.')
        .addStringOption((option) => option.setName('user_ids').setDescription('Comma or space-separated user IDs. Max 25.').setRequired(true).setMaxLength(1200))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the mass ban.').setRequired(true).setMaxLength(1000))
        .addIntegerOption((option) => option.setName('delete_message_days').setDescription('Delete recent messages from 0–7 days.').setRequired(false).setMinValue(0).setMaxValue(7))
    ),
  actionKey: ActionKeys.ModerationPanel,
  moduleKey: ModuleKeys.MODERATION,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'warn') return ActionKeys.ModerationWarn;
    if (subcommand === 'warnings') return ActionKeys.ModerationWarnings;
    if (subcommand === 'escalation-list') return ActionKeys.ModerationEscalation;
    if (subcommand === 'escalation-set') return ActionKeys.ModerationEscalation;
    if (subcommand === 'escalation-remove') return ActionKeys.ModerationEscalation;
    if (subcommand === 'timeout') return ActionKeys.ModerationTimeout;
    if (subcommand === 'untimeout') return ActionKeys.ModerationUntimeout;
    if (subcommand === 'kick') return ActionKeys.ModerationKick;
    if (subcommand === 'ban') return ActionKeys.ModerationBan;
    if (subcommand === 'unban') return ActionKeys.ModerationUnban;
    if (subcommand === 'massban') return ActionKeys.ModerationMassBan;
    return ActionKeys.ModerationPanel;
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'panel' || subcommand === 'manager') {
      await replyPrivate(interaction, await buildModerationPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'warn') {
      await handleWarn(interaction, ctx);
      return;
    }

    if (subcommand === 'warnings') {
      await handleUserWarnings(interaction, ctx);
      return;
    }

    if (subcommand === 'escalation-list') {
      await handleEscalationList(interaction, ctx);
      return;
    }

    if (subcommand === 'escalation-set') {
      await handleEscalationSet(interaction, ctx);
      return;
    }

    if (subcommand === 'escalation-remove') {
      await handleEscalationRemove(interaction, ctx);
      return;
    }

    if (subcommand === 'timeout') {
      await handleTimeout(interaction, ctx);
      return;
    }

    if (subcommand === 'untimeout') {
      await handleUntimeout(interaction, ctx);
      return;
    }

    if (subcommand === 'kick') {
      await handleKick(interaction, ctx);
      return;
    }

    if (subcommand === 'ban') {
      await handleBan(interaction, ctx);
      return;
    }

    if (subcommand === 'unban') {
      await handleUnban(interaction, ctx);
      return;
    }

    if (subcommand === 'massban') {
      await handleMassBan(interaction, ctx);
    }
  }
};

async function handleWarn(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence', false);
  const dmUser = interaction.options.getBoolean('dm_user') ?? false;

  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'WARN',
    reason,
    evidence,
    metadata: { dmUser }
  });

  let dmStatus = 'Not sent.';
  if (dmUser) {
    dmStatus = await target.send(`You received a warning in ${interaction.guild.name}: ${reason}`).then(() => 'Sent.').catch(() => 'Failed or blocked.');
  }

  const member = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;
  const esc = await moderation.checkAndApplyEscalation({
    guild: interaction.guild,
    member,
    targetUser: target,
    actorUser: interaction.user,
    autoMod,
    logger: ctx.logger
  });

  const embed = buildCaseEmbed(caseRecord, 'Warning Case Created')
    .addFields(
      { name: 'DM Status', value: dmStatus, inline: true },
      { name: 'Active Warnings', value: `**${esc.warningCount}** warning(s)`, inline: true }
    );

  if (esc.escalated) {
    const durStr = esc.durationSeconds ? ` (${Math.round(esc.durationSeconds / 60)}m)` : '';
    embed.addFields({
      name: '⚠️ Infraction Auto-Escalation Applied',
      value: `User reached **${esc.warningCount} active warnings**.\nAction Executed: **${esc.punishment}**${durStr}\nAuto-Case: #${esc.caseRecord?.case_number || 'Created'}`,
      inline: false
    });
  } else if (esc.nextRule) {
    embed.setFooter({ text: `Next auto-escalation at ${esc.nextRule.warning_count} warnings (${esc.nextRule.punishment})` });
  }

  await replyPrivate(interaction, { embeds: [embed] });
}

async function handleUserWarnings(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const activeCount = await moderation.getActiveWarningCount(interaction.guildId, target.id, 30);
  const userCases = await moderation.listUserCases(interaction.guildId, target.id, 10);
  const warningCases = userCases.filter((c) => c.action_type === 'WARN');
  const rules = await moderation.getEscalationRules(interaction.guildId);
  const nextRule = rules.find((r) => r.warning_count > activeCount);

  const lines = warningCases.length
    ? warningCases.map((c) => `• Case #${c.case_number} (${c.status}) — *${c.reason || 'No reason'}*`).join('\n')
    : 'No warning cases recorded.';

  const embed = createBaseEmbed({
    title: `Warnings Profile • ${target.tag}`,
    description: [
      `User: <@${target.id}>`,
      `Active Warnings (30d): **${activeCount}**`,
      nextRule
        ? `Next Escalation: **${nextRule.warning_count} Warnings** -> **${nextRule.punishment}**${nextRule.duration_seconds ? ` (${Math.round(nextRule.duration_seconds / 60)}m)` : ''}`
        : 'Next Escalation: *No higher threshold configured.*',
      '',
      '**Recent Warnings**',
      lines
    ].join('\n'),
    color: activeCount > 0 ? SlickBotColors.WARNING : SlickBotColors.INFO
  });

  await replyPrivate(interaction, { embeds: [embed] });
}

async function handleEscalationList(interaction, ctx) {
  const rules = await moderation.getEscalationRules(interaction.guildId);

  const lines = rules.length
    ? rules.map((r) => `• **${r.warning_count} Warnings** ➔ **${r.punishment}**${r.duration_seconds ? ` (${Math.round(r.duration_seconds / 60)}m duration)` : ''}`).join('\n')
    : '*No auto-escalation rules configured. Use `/mod escalation-set` to create one.*';

  const embed = createBaseEmbed({
    title: '⚠️ Moderation Infraction Auto-Escalation Ladder',
    description: [
      'When members accumulate active warnings within a 30-day window, SlickBot automatically enforces escalating punishments.',
      '',
      '**Configured Escalation Rules**',
      lines,
      '',
      '**Commands**',
      '`/mod escalation-set <warnings> <punishment> [duration]` — Set a threshold',
      '`/mod escalation-remove <warnings>` — Remove a threshold'
    ].join('\n'),
    color: rules.length ? SlickBotColors.PRIMARY : SlickBotColors.INFO
  });

  await replyPrivate(interaction, { embeds: [embed] });
}

async function handleEscalationSet(interaction, ctx) {
  const warnings = interaction.options.getInteger('warnings', true);
  const punishment = interaction.options.getString('punishment', true);
  const durationStr = interaction.options.getString('duration');
  const days = interaction.options.getInteger('days') || 0;
  const hours = interaction.options.getInteger('hours') || 0;
  const minutes = interaction.options.getInteger('minutes') || 0;

  let durationSeconds = 0;
  if (durationStr) {
    const ms = parseDurationToMs(durationStr, { maxDurationMs: 28 * 24 * 60 * 60 * 1000, fallback: 0 });
    durationSeconds = Math.floor(ms / 1000);
  }
  if (!durationSeconds) {
    durationSeconds = (days * 86400) + (hours * 3600) + (minutes * 60);
  }
  if (punishment === 'TIMEOUT' && durationSeconds <= 0) {
    durationSeconds = 3600; // Default 1h timeout
  }

  const rule = await moderation.setEscalationRule(
    interaction.guildId,
    warnings,
    punishment,
    punishment === 'TIMEOUT' ? durationSeconds : null
  );

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'moderation-config',
    title: 'Auto-Escalation Rule Saved',
    body: `Threshold: **${warnings} Warnings**\nPunishment: **${punishment}**${punishment === 'TIMEOUT' ? ` (${Math.round(durationSeconds / 60)}m)` : ''}\nConfigured By: <@${interaction.user.id}>`,
    actorUserId: interaction.user.id
  }).catch(() => {});

  await replyPrivate(interaction, {
    embeds: [createSuccessEmbed(
      'Auto-Escalation Rule Saved',
      `Members reaching **${warnings} active warnings** will automatically receive a **${punishment}**${punishment === 'TIMEOUT' ? ` for **${Math.round(durationSeconds / 60)} minutes**` : ''}.`
    )]
  });
}

async function handleEscalationRemove(interaction, ctx) {
  const warnings = interaction.options.getInteger('warnings', true);
  const removed = await moderation.removeEscalationRule(interaction.guildId, warnings);

  if (!removed) {
    await replyPrivate(interaction, { embeds: [createWarningEmbed('Rule Not Found', `No auto-escalation rule exists for **${warnings} warnings**.`)] });
    return;
  }

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'moderation-config',
    title: 'Auto-Escalation Rule Removed',
    body: `Removed threshold for **${warnings} Warnings** by <@${interaction.user.id}>.`,
    actorUserId: interaction.user.id
  }).catch(() => {});

  await replyPrivate(interaction, {
    embeds: [createSuccessEmbed('Auto-Escalation Rule Removed', `Removed escalation rule for **${warnings} warnings**.`)]
  });
}

async function handleTimeout(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration');
  const days = interaction.options.getInteger('days') || 0;
  const hours = interaction.options.getInteger('hours') || 0;
  const minutes = interaction.options.getInteger('minutes') || 0;
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence', false);

  let durationSeconds = 0;
  if (durationStr) {
    const ms = parseDurationToMs(durationStr, { maxDurationMs: 28 * 24 * 60 * 60 * 1000, fallback: 0 });
    durationSeconds = Math.floor(ms / 1000);
  }
  if (!durationSeconds) {
    durationSeconds = (days * 86400) + (hours * 3600) + (minutes * 60);
  }
  if (durationSeconds <= 0) {
    durationSeconds = 600; // default to 10 minutes
  }
  if (durationSeconds > 28 * 86400) {
    durationSeconds = 28 * 86400; // 28 days max
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  if (!member) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Member Not Found', description: 'That user is not currently available as a server member.', color: SlickBotColors.WARNING })] });
    return;
  }

  const timeoutRes = await autoMod.applyTimeout(member, durationSeconds, reason, interaction.user);
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'TIMEOUT',
    reason,
    evidence,
    durationSeconds,
    expiresAt,
    metadata: {
      durationSeconds,
      expiresAt,
      roleApplied: timeoutRes?.roleApplied,
      roleMode: timeoutRes?.roleMode,
      nativeSuccess: timeoutRes?.nativeSuccess
    }
  });

  const durationLabel = `${Math.floor(durationSeconds / 60)} minutes`;
  const embed = buildCaseEmbed(caseRecord, 'Timeout Applied')
    .addFields(
      { name: 'Duration', value: durationLabel, inline: true },
      { name: 'Expires', value: `<t:${Math.floor((Date.now() + (durationSeconds * 1000)) / 1000)}:R>`, inline: true }
    );

  if (timeoutRes?.roleApplied) {
    const roleIdText = timeoutRes.timeoutRoleId ? `<@&${timeoutRes.timeoutRoleId}>` : (member.guild.roles?.cache?.find ? `<@&${member.guild.roles.cache.find((r) => r.name.toLowerCase().includes('timeout'))?.id || 'role-timeout'}>` : 'Timeout Role');
    embed.addFields({
      name: 'Dual-Layer Enforcement',
      value: `Discord Timeout: ${timeoutRes.nativeTimeout !== false ? '✅ Applied' : '⚠️ Fallback'}\nTimeout Role: ✅ Assigned (${roleIdText})`,
      inline: false
    });
  }

  await replyPrivate(interaction, { embeds: [embed] });
}

async function handleUntimeout(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Member Not Found', description: 'That user is not currently available as a server member.', color: SlickBotColors.WARNING })] });
    return;
  }

  const untimeoutRes = await autoMod.removeTimeout(member, reason, interaction.user);
  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'UNTIMEOUT',
    reason,
    status: 'CLOSED',
    metadata: {
      roleRemoved: untimeoutRes?.roleRemoved,
      nativeSuccess: untimeoutRes?.nativeSuccess
    }
  });

  const embed = buildCaseEmbed(caseRecord, 'Timeout Removed')
    .addFields({ name: 'Status', value: 'Active timeout cleared.', inline: true });

  if (untimeoutRes?.roleRemoved) {
    embed.addFields({ name: 'Dual Enforcement', value: 'Cleared restricted timeout role from member.', inline: false });
  }

  await replyPrivate(interaction, { embeds: [embed] });
}

async function handleKick(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence', false);

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Member Not Found', description: 'That user is not currently available in this server.', color: SlickBotColors.WARNING })] });
    return;
  }

  if (!member.kickable) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Cannot Kick Member', description: 'I do not have high enough hierarchy or permissions to kick that member.', color: SlickBotColors.ERROR })] });
    return;
  }

  await member.kick(reason);
  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'KICK',
    reason,
    evidence
  });

  await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, 'Member Kicked')] });
}

async function handleBan(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const deleteDays = interaction.options.getInteger('delete_message_days') ?? 0;
  const evidence = interaction.options.getString('evidence', false);

  const deleteMessageSeconds = deleteDays * 86400;
  await interaction.guild.bans.create(target.id, {
    reason,
    deleteMessageSeconds
  });

  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'BAN',
    reason,
    evidence,
    metadata: { deleteDays }
  });

  await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, 'User Banned')] });
}

async function handleUnban(interaction, ctx) {
  const userId = interaction.options.getString('user_id', true).trim();
  const reason = interaction.options.getString('reason') || 'No reason provided';

  await interaction.guild.bans.remove(userId, reason);
  const caseRecord = await createAndLogCase(interaction, ctx, {
    target: { id: userId, tag: `User ${userId}` },
    actionType: 'UNBAN',
    reason,
    status: 'CLOSED'
  });

  await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, 'User Unbanned')] });
}

async function handleMassBan(interaction, ctx) {
  const rawIds = interaction.options.getString('user_ids', true);
  const reason = interaction.options.getString('reason', true);
  const deleteDays = interaction.options.getInteger('delete_message_days') ?? 0;
  const deleteMessageSeconds = deleteDays * 86400;

  const userIds = [...new Set(rawIds.split(/[\s,]+/).filter(Boolean))].slice(0, 25);
  if (!userIds.length) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Invalid User IDs', description: 'No valid user IDs could be extracted.', color: SlickBotColors.WARNING })] });
    return;
  }

  const success = [];
  const failed = [];

  for (const id of userIds) {
    try {
      await interaction.guild.bans.create(id, { reason, deleteMessageSeconds });
      await moderation.createCase({
        guildId: interaction.guildId,
        targetUserId: id,
        actorUserId: interaction.user.id,
        actionType: 'BAN',
        reason: `[Mass Ban] ${reason}`,
        metadata: { massBan: true, deleteDays }
      });
      success.push(id);
    } catch {
      failed.push(id);
    }
  }

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'moderation-action',
    title: 'Mass Ban Executed',
    body: `Actor: <@${interaction.user.id}>\nBanned: **${success.length}**\nFailed: **${failed.length}**\nReason: ${reason}`,
    actorUserId: interaction.user.id,
    metadata: { success, failed, reason }
  });

  const embed = createBaseEmbed({
    title: 'Mass Ban Complete',
    description: [
      `Total Attempted: **${userIds.length}**`,
      `Successfully Banned: **${success.length}**`,
      `Failed: **${failed.length}**`,
      '',
      success.length ? `Banned IDs: ${success.map((id) => `\`${id}\``).join(', ')}` : null,
      failed.length ? `Failed IDs: ${failed.map((id) => `\`${id}\``).join(', ')}` : null
    ].filter(Boolean).join('\n'),
    color: failed.length ? SlickBotColors.WARNING : SlickBotColors.SUCCESS
  });

  await replyPrivate(interaction, { embeds: [embed] });
}

async function createAndLogCase(interaction, ctx, input) {
  const caseRecord = await moderation.createCase({
    guildId: interaction.guildId,
    targetUserId: input.target.id,
    targetUserTag: input.target.tag || input.target.username || null,
    actorUserId: interaction.user.id,
    actionType: input.actionType,
    reason: input.reason || null,
    status: input.status || 'OPEN',
    durationSeconds: input.durationSeconds || null,
    expiresAt: input.expiresAt || null,
    evidence: input.evidence || null,
    metadata: input.metadata || null
  });

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'moderation-action',
    title: `Moderation Case #${caseRecord.case_number} Created`,
    body: [
      `Action: **${input.actionType}**`,
      `Target: <@${input.target.id}> (${input.target.tag || input.target.id})`,
      `Actor: <@${interaction.user.id}>`,
      `Reason: ${input.reason || 'No reason provided'}`,
      input.evidence ? `Evidence: ${input.evidence}` : null,
      input.durationSeconds ? `Duration: ${Math.floor(input.durationSeconds / 60)} minutes` : null
    ].filter(Boolean).join('\n'),
    actorUserId: interaction.user.id,
    metadata: {
      caseNumber: caseRecord.case_number,
      targetUserId: input.target.id,
      actionType: input.actionType
    }
  });

  return caseRecord;
}
