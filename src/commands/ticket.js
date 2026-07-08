const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { TicketService, buildTicketModal } = require('../modules/support/supportService');
const { buildTicketsPanel, buildPublicTicketPanel } = require('../modules/support/supportUi');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');

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
        .addRoleOption((option) => option.setName('staff_role').setDescription('Default staff role that can view ticket channels.').setRequired(false))
        .addIntegerOption((option) => option.setName('ticket_limit').setDescription('Default open ticket limit per user.').setMinValue(1).setMaxValue(10).setRequired(false))
        .addBooleanOption((option) => option.setName('transcripts').setDescription('Generate transcripts when tickets close.').setRequired(false))
        .addStringOption((option) => option.setName('naming_format').setDescription('Example: ticket-{username}-{number}').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('type-setup')
        .setDescription('Create or update a ticket type.')
        .addStringOption((option) => option.setName('name').setDescription('Ticket type name.').setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName('label').setDescription('Button label shown on the public panel.').setRequired(false).setMaxLength(80))
        .addChannelOption((option) => option.setName('category').setDescription('Category for this ticket type.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
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
        .setName('close')
        .setDescription('Close the current ticket.')
        .addStringOption((option) => option.setName('reason').setDescription('Close reason.').setRequired(false).setMaxLength(1000))
    ),
  actionKey: ActionKeys.TicketsPanel,
  moduleKey: ModuleKeys.TICKETS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['setup', 'type-setup', 'question-add', 'question-clear'].includes(subcommand)) return ActionKeys.TicketsConfigure;
    if (subcommand === 'panel' || subcommand === 'manager') return ActionKeys.TicketsPanel;
    if (subcommand === 'claim') return ActionKeys.TicketsClaim;
    if (subcommand === 'close') return ActionKeys.TicketsClose;
    if (['priority', 'escalate'].includes(subcommand)) return ActionKeys.TicketsManage;
    return ActionKeys.TicketsPanel;
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
        ticketLimit: interaction.options.getInteger('ticket_limit') || null,
        transcriptEnabled: interaction.options.getBoolean('transcripts'),
        namingFormat: interaction.options.getString('naming_format') || null
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Ticket Settings Updated', body: `Ticket settings updated by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Defaults Configured', [`Category: ${config.category_id ? `<#${config.category_id}>` : 'Not set'}`, `Log Channel: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set'}`, `Staff Role: ${config.staff_role_id ? `<@&${config.staff_role_id}>` : 'Not set'}`, `Naming: \`${config.naming_format}\``].join('\n'))] });
    }

    if (subcommand === 'type-setup') {
      const type = await tickets.setupType(interaction.guildId, {
        name: interaction.options.getString('name', true),
        label: interaction.options.getString('label') || null,
        categoryId: interaction.options.getChannel('category')?.id || null,
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
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Type Saved', `Saved ticket type **${type.name}**. Use \`/ticket question-add\` to customize intake questions.`)] });
    }

    if (subcommand === 'question-add') {
      const type = await tickets.addQuestion(interaction.guildId, interaction.options.getString('type', true), interaction.options.getString('question', true), interaction.options.getBoolean('required') ?? true);
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Not Found', 'Create the ticket type with `/ticket type-setup` first.')] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Question Added', `Added a question to **${type.name}**. Ticket modals support up to 4 custom questions plus subject.`)] });
    }

    if (subcommand === 'question-clear') {
      const type = await tickets.clearQuestions(interaction.guildId, interaction.options.getString('type', true));
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Type Not Found', 'That ticket type could not be found.')] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Questions Cleared', `Custom questions cleared for **${type.name}**.`)] });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const types = await tickets.listTypes(interaction.guildId);
      await channel.send(await buildPublicTicketPanel(types));
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Panel Posted', `Panel posted in <#${channel.id}>.`)] });
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

    if (subcommand === 'close') {
      const result = await tickets.closeTicket({ interaction, client: ctx.client, logger: ctx.logger, reason: interaction.options.getString('reason') || 'No reason provided.' });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Closed', `Ticket #${result.ticket.ticket_number} closed. Transcript sent: **${result.transcriptSent ? 'Yes' : 'No'}**.`)] });
    }
  }
};
