const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { TicketService, buildTicketModal } = require('../modules/support/supportService');
const { buildTicketsPanel, buildPublicTicketPanel } = require('../modules/support/supportUi');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { recordPublishedPanel } = require('../modules/panels/publishedPanelService');
const { refreshPublishedPanel, formatRefreshSummary } = require('../modules/panels/panelUpdateService');

const tickets = new TicketService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system tools.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the ticket manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure default ticket settings.')
        .addChannelOption((option) => option.setName('category').setDescription('Default category where ticket channels should be created.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addChannelOption((option) => option.setName('log_channel').setDescription('Default channel where ticket transcripts should be sent.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption((option) => option.setName('staff_role').setDescription('Default staff role that can review tickets.').setRequired(false))
        .addStringOption((option) => option.setName('staff_team').setDescription('Default Permission Team assigned to tickets.').setRequired(false).setMaxLength(80))
        .addRoleOption((option) => option.setName('escalated_role').setDescription('Default escalation role.').setRequired(false))
        .addStringOption((option) => option.setName('escalated_team').setDescription('Default escalation Permission Team.').setRequired(false).setMaxLength(80))
        .addStringOption((option) => option.setName('ticket_mode').setDescription('Create private channels or private threads.').setRequired(false).addChoices({ name: 'Channels', value: 'CHANNEL' }, { name: 'Threads', value: 'THREAD' }))
        .addChannelOption((option) => option.setName('thread_host').setDescription('Host text channel for thread-mode tickets.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addIntegerOption((option) => option.setName('ticket_limit').setDescription('Default open ticket limit per user.').setMinValue(1).setMaxValue(10).setRequired(false))
        .addBooleanOption((option) => option.setName('transcripts').setDescription('Generate transcripts when tickets close.').setRequired(false))
        .addStringOption((option) => option.setName('naming_format').setDescription('Example: ticket-{username}-{number}').setRequired(false).setMaxLength(80))
        .addIntegerOption((option) => option.setName('delete_seconds').setDescription('Seconds before deleting a closed ticket after transcript success.').setMinValue(3).setMaxValue(60).setRequired(false))
        .addStringOption((option) => option.setName('panel_title').setDescription('Public ticket panel title.').setRequired(false).setMaxLength(100))
        .addStringOption((option) => option.setName('panel_description').setDescription('Public ticket panel description.').setRequired(false).setMaxLength(800))
        .addStringOption((option) => option.setName('panel_color').setDescription('Panel accent color, example: #7869ff.').setRequired(false).setMaxLength(7))
        .addStringOption((option) => option.setName('display_mode').setDescription('Public panel component style.').setRequired(false).addChoices({ name: 'Buttons', value: 'BUTTONS' }, { name: 'Dropdown menu', value: 'DROPDOWN' }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('type-setup')
        .setDescription('Create or update a ticket type.')
        .addStringOption((option) => option.setName('name').setDescription('Ticket type name.').setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName('label').setDescription('Button label shown on the public panel.').setRequired(false).setMaxLength(80))
        .addChannelOption((option) => option.setName('category').setDescription('Category for channel-mode tickets.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addStringOption((option) => option.setName('ticket_mode').setDescription('Create private channels or private threads.').setRequired(false).addChoices({ name: 'Channels', value: 'CHANNEL' }, { name: 'Threads', value: 'THREAD' }))
        .addChannelOption((option) => option.setName('thread_host').setDescription('Host text channel for thread-mode tickets.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption((option) => option.setName('log_channel').setDescription('Transcript channel for this ticket type.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption((option) => option.setName('staff_role').setDescription('Role assigned to review this ticket type.').setRequired(false))
        .addStringOption((option) => option.setName('staff_team').setDescription('Permission Team assigned to review this ticket type.').setRequired(false).setMaxLength(80))
        .addRoleOption((option) => option.setName('escalated_role').setDescription('Role that receives escalated tickets.').setRequired(false))
        .addStringOption((option) => option.setName('escalated_team').setDescription('Permission Team that receives escalated tickets.').setRequired(false).setMaxLength(80))
        .addIntegerOption((option) => option.setName('ticket_limit').setDescription('Open ticket limit per user for this type.').setMinValue(1).setMaxValue(10).setRequired(false))
        .addStringOption((option) => option.setName('naming_format').setDescription('Example: {type}-{username}-{number}').setRequired(false).setMaxLength(80))
        .addBooleanOption((option) => option.setName('transcripts').setDescription('Generate transcripts for this type.').setRequired(false))
        .addStringOption((option) => option.setName('description').setDescription('Ticket type description.').setRequired(false).setMaxLength(400))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('question-add')
        .setDescription('Add a custom question to a ticket type.')
        .addStringOption((option) => option.setName('type').setDescription('Ticket type name.').setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName('question').setDescription('Question text.').setRequired(true).setMaxLength(120))
        .addBooleanOption((option) => option.setName('required').setDescription('Whether this question is required.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('question-clear')
        .setDescription('Clear all custom questions for a ticket type.')
        .addStringOption((option) => option.setName('type').setDescription('Ticket type name.').setRequired(true).setMaxLength(80))
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('type-delete')
        .setDescription('Delete a ticket type template. Open tickets must be closed first.')
        .addStringOption((option) => option.setName('type').setDescription('Ticket type name.').setRequired(true).setMaxLength(80))
        .addBooleanOption((option) => option.setName('confirm').setDescription('Must be true to delete the ticket type.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a public ticket launcher panel with ticket-type buttons.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the panel in. Defaults to current channel.').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((subcommand) => subcommand.setName('open').setDescription('Open the default support ticket modal.'))
    .addSubcommand((subcommand) => subcommand.setName('claim').setDescription('Claim the current ticket.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('priority')
        .setDescription('Set the current ticket priority.')
        .addStringOption((option) => option.setName('level').setDescription('Priority level.').setRequired(true).addChoices(
          { name: 'Low', value: 'LOW' },
          { name: 'Normal', value: 'NORMAL' },
          { name: 'High', value: 'HIGH' },
          { name: 'Urgent', value: 'URGENT' }
        ))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('escalate')
        .setDescription('Escalate the current ticket to the configured escalation role/team.')
        .addStringOption((option) => option.setName('reason').setDescription('Escalation reason.').setRequired(false).setMaxLength(500))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-user')
        .setDescription('Add a user to the current ticket.')
        .addUserOption((option) => option.setName('user').setDescription('User to add to the ticket.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('close')
        .setDescription('Close the current ticket.')
        .addStringOption((option) => option.setName('reason').setDescription('Close reason.').setRequired(false).setMaxLength(1000))
    ),
  actionKey: ActionKeys.TicketsPanel,
  moduleKey: ModuleKeys.TICKETS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['setup', 'type-setup', 'type-delete', 'question-add', 'question-clear'].includes(subcommand)) return ActionKeys.TicketsConfigure;
    if (subcommand === 'manager') return ActionKeys.TicketsManager;
    if (subcommand === 'panel') return ActionKeys.TicketsPostPanel;
    if (subcommand === 'open') return ActionKeys.TicketsOpen;
    if (subcommand === 'claim') return ActionKeys.TicketsClaim;
    if (subcommand === 'close') return ActionKeys.TicketsClose;
    if (['priority', 'escalate', 'add-user'].includes(subcommand)) return ActionKeys.TicketsManage;
    return ActionKeys.TicketsManager;
  },
  isPublic(interaction) {
    return interaction.options.getSubcommand() === 'open';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'manager') return replyPrivate(interaction, await buildTicketsPanel(interaction.guildId));

    if (subcommand === 'setup') {
      const config = await tickets.updateConfig(interaction.guildId, {
        categoryId: interaction.options.getChannel('category')?.id || null,
        logChannelId: interaction.options.getChannel('log_channel')?.id || null,
        staffRoleId: interaction.options.getRole('staff_role')?.id || null,
        staffTeamName: interaction.options.getString('staff_team') || null,
        escalatedRoleId: interaction.options.getRole('escalated_role')?.id || null,
        escalatedTeamName: interaction.options.getString('escalated_team') || null,
        ticketMode: interaction.options.getString('ticket_mode') || null,
        threadHostChannelId: interaction.options.getChannel('thread_host')?.id || null,
        ticketLimit: interaction.options.getInteger('ticket_limit') || null,
        transcriptEnabled: interaction.options.getBoolean('transcripts'),
        namingFormat: interaction.options.getString('naming_format') || null,
        closeDeleteSeconds: interaction.options.getInteger('delete_seconds') || null,
        panelTitle: interaction.options.getString('panel_title') || null,
        panelDescription: interaction.options.getString('panel_description') || null,
        panelColor: interaction.options.getString('panel_color') || null,
        panelDisplayMode: interaction.options.getString('display_mode') || null
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Ticket Settings Updated', body: `Ticket settings updated by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'ticket', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Defaults Configured', [`Mode: **${config.ticket_mode || 'CHANNEL'}**`,
        `Category: ${config.category_id ? `<#${config.category_id}>` : 'Not set'}`,
        `Thread Host: ${config.thread_host_channel_id ? `<#${config.thread_host_channel_id}>` : 'Not set'}`,
        `Staff Role: ${config.staff_role_id ? `<@&${config.staff_role_id}>` : 'Not set'}`,
        `Staff Team: ${config.staff_team_id ? 'Configured' : 'Not set'}`,
        `Escalation Role: ${config.escalated_role_id ? `<@&${config.escalated_role_id}>` : 'Not set'}`,
        `Escalation Team: ${config.escalated_team_id ? 'Configured' : 'Not set'}`, `Log Channel: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set'}`, `Naming: \`${config.naming_format}\``, formatRefreshSummary(refresh)].filter(Boolean).join('\n'))] });
    }

    if (subcommand === 'type-setup') {
      const type = await tickets.setupType(interaction.guildId, {
        name: interaction.options.getString('name', true),
        label: interaction.options.getString('label') || null,
        categoryId: interaction.options.getChannel('category')?.id || null,
        ticketMode: interaction.options.getString('ticket_mode') || null,
        threadHostChannelId: interaction.options.getChannel('thread_host')?.id || null,
        logChannelId: interaction.options.getChannel('log_channel')?.id || null,
        staffRoleId: interaction.options.getRole('staff_role')?.id || null,
        staffTeamName: interaction.options.getString('staff_team') || null,
        escalatedRoleId: interaction.options.getRole('escalated_role')?.id || null,
        escalatedTeamName: interaction.options.getString('escalated_team') || null,
        ticketLimit: interaction.options.getInteger('ticket_limit') || null,
        transcriptEnabled: interaction.options.getBoolean('transcripts'),
        namingFormat: interaction.options.getString('naming_format') || null,
        description: interaction.options.getString('description') || null
      });
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'ticket', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Type Saved', `Saved ticket type **${type.name}**. Use \`/ticket question-add\` to customize intake questions.${formatRefreshSummary(refresh)}`)] });
    }


    if (subcommand === 'type-delete') {
      const typeName = interaction.options.getString('type', true);
      const confirmed = interaction.options.getBoolean('confirm', true);
      if (!confirmed) return replyPrivate(interaction, { embeds: [createWarningEmbed('Delete Not Confirmed', 'Run the command again with `confirm:true` to delete this ticket type.')] });
      const result = await tickets.deleteType(interaction.guildId, typeName);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Not Deleted', result.reason)] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Ticket Type Deleted', body: `Ticket type **${result.type.name}** was deleted by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'ticket', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Type Deleted', `Deleted ticket type **${result.type.name}**.${formatRefreshSummary(refresh)}`)] });
    }

    if (subcommand === 'question-add') {
      const type = await tickets.addQuestion(interaction.guildId, interaction.options.getString('type', true), interaction.options.getString('question', true), interaction.options.getBoolean('required') ?? true);
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Not Found', 'Create the ticket type with `/ticket type-setup` first.')] });
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'ticket', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Question Added', `Added a question to **${type.name}**. Ticket modals support up to 4 custom questions plus subject.${formatRefreshSummary(refresh)}`)] });
    }

    if (subcommand === 'question-clear') {
      const type = await tickets.clearQuestions(interaction.guildId, interaction.options.getString('type', true));
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Not Found', 'That ticket type could not be found.')] });
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'ticket', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Questions Cleared', `Custom questions cleared for **${type.name}**.${formatRefreshSummary(refresh)}`)] });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const types = await tickets.listTypes(interaction.guildId);
      const message = await channel.send(await buildPublicTicketPanel(types, await tickets.getConfig(interaction.guildId)));
      await recordPublishedPanel({ guildId: interaction.guildId, panelType: 'ticket', panelRef: '*', channelId: channel.id, messageId: message.id });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Panel Posted', `Panel posted in <#${channel.id}>. Future ticket panel edits will update this message automatically.`)] });
    }

    if (subcommand === 'open') {
      const type = await tickets.ensureDefaultType(interaction.guildId);
      await interaction.showModal(buildTicketModal(type));
      return;
    }

    if (subcommand === 'claim') {
      const result = await tickets.claimTicket({ interaction, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Claimed', `Ticket #${result.ticket.ticket_number} is now assigned to you.`)] });
      await interaction.channel.send({ embeds: [createBaseEmbed({ title: 'Ticket Claimed', description: `This ticket was claimed by <@${interaction.user.id}>.`, color: SlickBotColors.INFO })] }).catch(() => {});
      return;
    }

    if (subcommand === 'priority') {
      const result = await tickets.setPriority({ interaction, logger: ctx.logger, priority: interaction.options.getString('level', true) });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Priority Updated', `Ticket #${result.ticket.ticket_number} priority set to **${result.ticket.priority}**.`)] });
    }

    if (subcommand === 'escalate') {
      const result = await tickets.escalateTicket({ interaction, logger: ctx.logger, reason: interaction.options.getString('reason') || 'No reason provided.' });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Escalated', result.reason)] });
      await interaction.channel.send({ content: result.roleIds.map((roleId) => `<@&${roleId}>`).join(' '), embeds: [createBaseEmbed({ title: 'Ticket Escalated', description: `This ticket has been escalated by <@${interaction.user.id}>.`, color: SlickBotColors.WARNING })] }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Escalated', `Ticket #${result.ticket.ticket_number} was escalated.`)] });
    }

    if (subcommand === 'add-user') {
      const user = interaction.options.getUser('user', true);
      const result = await tickets.addUserToTicket({ interaction, user, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('User Not Added', result.reason)] });
      await interaction.channel.send({ embeds: [createBaseEmbed({ title: 'User Added', description: `<@${user.id}> was added to this ticket by <@${interaction.user.id}>.`, color: SlickBotColors.INFO })] }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Added', `<@${user.id}> can now access ticket #${result.ticket.ticket_number}.`)] });
    }

    if (subcommand === 'close') {
      const result = await tickets.closeTicket({ interaction, client: ctx.client, logger: ctx.logger, reason: interaction.options.getString('reason') || 'No reason provided.' });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Closed', `Ticket #${result.ticket.ticket_number} closed. Transcript sent: **${result.transcriptSent ? 'Yes' : 'No'}**.`)] });
      if (result.shouldDelete) scheduleTicketDeletion(interaction.channel, result.deleteSeconds || 10).catch((error) => console.error('Failed to schedule ticket deletion:', error));
      return;
    }
  }
};


async function scheduleTicketDeletion(channel, seconds = 10) {
  const { createWarningEmbed } = require('../modules/ui/uiService');
  if (!channel || typeof channel.send !== 'function') return;
  const total = Math.max(3, Math.min(Number(seconds) || 10, 60));
  const message = await channel.send({ embeds: [createWarningEmbed('Ticket Closing', `Ticket will close in **${total}** second(s).`)] }).catch(() => null);
  if (!message) return;
  for (let remaining = total - 1; remaining >= 1; remaining -= 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await message.edit({ embeds: [createWarningEmbed('Ticket Closing', `Ticket will close in **${remaining}** second(s).`)] }).catch(() => {});
  }
  await channel.delete('SlickBot ticket closed and transcript completed.').catch(() => {});
}
