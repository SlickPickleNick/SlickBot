const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ModerationService } = require('../modules/moderation/moderationService');
const { buildModerationPanel, buildCaseEmbed } = require('../modules/moderation/moderationUi');
const { createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');

const moderation = new ModerationService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools for SlickBot.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open the moderation control panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warn')
        .setDescription('Create a warning case for a user.')
        .addUserOption((option) => option.setName('user').setDescription('User to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning.').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('evidence').setDescription('Optional evidence or context.').setRequired(false).setMaxLength(1000))
        .addBooleanOption((option) => option.setName('dm_user').setDescription('Try to DM the user. Defaults to false.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timeout')
        .setDescription('Timeout a user and create a moderation case.')
        .addUserOption((option) => option.setName('user').setDescription('User to timeout.').setRequired(true))
        .addIntegerOption((option) => option.setName('minutes').setDescription('Timeout duration in minutes.').setRequired(true).setMinValue(1).setMaxValue(40320))
        .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout.').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('evidence').setDescription('Optional evidence or context.').setRequired(false).setMaxLength(1000))
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
    if (subcommand === 'timeout') return ActionKeys.ModerationTimeout;
    if (subcommand === 'kick') return ActionKeys.ModerationKick;
    if (subcommand === 'ban') return ActionKeys.ModerationBan;
    if (subcommand === 'massban') return ActionKeys.ModerationMassBan;
    return ActionKeys.ModerationPanel;
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'panel') {
      await replyPrivate(interaction, await buildModerationPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'warn') {
      await handleWarn(interaction, ctx);
      return;
    }

    if (subcommand === 'timeout') {
      await handleTimeout(interaction, ctx);
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

  const embed = buildCaseEmbed(caseRecord, 'Warning Case Created')
    .addFields({ name: 'DM Status', value: dmStatus, inline: true });
  await replyPrivate(interaction, { embeds: [embed] });
}

async function handleTimeout(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const minutes = interaction.options.getInteger('minutes', true);
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence', false);
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  if (!member) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Member Not Found', description: 'That user is not currently available as a server member.', color: SlickBotColors.WARNING })] });
    return;
  }

  await member.timeout(minutes * 60 * 1000, reason);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'TIMEOUT',
    reason,
    evidence,
    durationSeconds: minutes * 60,
    expiresAt
  });

  await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, 'Timeout Applied')] });
}

async function handleKick(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence', false);
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  if (!member) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'Member Not Found', description: 'That user is not currently available as a server member.', color: SlickBotColors.WARNING })] });
    return;
  }

  await member.kick(reason);
  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'KICK',
    reason,
    evidence,
    status: 'CLOSED'
  });

  await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, 'User Kicked')] });
}

async function handleBan(interaction, ctx) {
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  const evidence = interaction.options.getString('evidence', false);
  const deleteDays = interaction.options.getInteger('delete_message_days') ?? 0;

  await interaction.guild.members.ban(target.id, {
    reason,
    deleteMessageSeconds: deleteDays * 24 * 60 * 60
  });

  const caseRecord = await createAndLogCase(interaction, ctx, {
    target,
    actionType: 'BAN',
    reason,
    evidence,
    status: 'CLOSED',
    metadata: { deleteMessageDays: deleteDays }
  });

  await replyPrivate(interaction, { embeds: [buildCaseEmbed(caseRecord, 'User Banned')] });
}

async function handleMassBan(interaction, ctx) {
  const raw = interaction.options.getString('user_ids', true);
  const reason = interaction.options.getString('reason', true);
  const deleteDays = interaction.options.getInteger('delete_message_days') ?? 0;
  const ids = Array.from(new Set(raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 25);

  if (ids.length === 0) {
    await replyPrivate(interaction, { embeds: [createBaseEmbed({ title: 'No User IDs Found', description: 'Provide at least one user ID.', color: SlickBotColors.WARNING })] });
    return;
  }

  const results = [];
  for (const userId of ids) {
    try {
      await interaction.guild.members.ban(userId, {
        reason,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60
      });
      await moderation.createCase({
        guildId: interaction.guildId,
        targetUserId: userId,
        targetUserTag: null,
        actorUserId: interaction.user.id,
        actionType: 'MASS_BAN',
        reason,
        status: 'CLOSED',
        metadata: { deleteMessageDays: deleteDays }
      });
      results.push(`✅ ${userId}`);
    } catch (error) {
      results.push(`❌ ${userId} — ${error.message || 'Failed'}`);
    }
  }

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'moderation',
    title: 'Mass Ban Completed',
    body: [`Moderator: <@${interaction.user.id}>`, `Reason: ${reason}`, '', results.join('\n')].join('\n'),
    metadata: { moderatorId: interaction.user.id, userIds: ids, reason, deleteDays }
  });

  await replyPrivate(interaction, {
    embeds: [createBaseEmbed({
      title: 'Mass Ban Completed',
      description: results.join('\n'),
      color: results.some((line) => line.startsWith('❌')) ? SlickBotColors.WARNING : SlickBotColors.SUCCESS
    })]
  });
}

async function createAndLogCase(interaction, ctx, input) {
  const caseRecord = await moderation.createCase({
    guildId: interaction.guildId,
    targetUserId: input.target.id,
    targetUserTag: input.target.tag,
    actorUserId: interaction.user.id,
    actionType: input.actionType,
    reason: input.reason,
    status: input.status || 'OPEN',
    durationSeconds: input.durationSeconds || null,
    expiresAt: input.expiresAt || null,
    evidence: input.evidence || null,
    metadata: input.metadata || null
  });

  await ctx.logger.writeAudit({
    guildId: interaction.guildId,
    actorUserId: interaction.user.id,
    actionKey: `moderation.${input.actionType.toLowerCase()}`,
    targetType: 'User',
    targetId: input.target.id,
    summary: `${input.actionType} case #${caseRecord.case_number} created for ${input.target.tag}.`,
    metadata: { caseNumber: caseRecord.case_number, reason: input.reason }
  });

  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'moderation',
    title: `${input.actionType} • Case #${caseRecord.case_number}`,
    body: [
      `Target: <@${input.target.id}> \`${input.target.id}\``,
      `Moderator: <@${interaction.user.id}>`,
      `Status: **${caseRecord.status}**`,
      '',
      `Reason: ${input.reason}`
    ].join('\n'),
    metadata: { caseNumber: caseRecord.case_number, targetUserId: input.target.id, actorUserId: interaction.user.id }
  });

  return caseRecord;
}
