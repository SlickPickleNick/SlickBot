const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { TicketService } = require('../modules/support/supportService');
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
        .setDescription('Configure the ticket system.')
        .addChannelOption((option) => option.setName('category').setDescription('Category where ticket channels should be created.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addChannelOption((option) => option.setName('log_channel').setDescription('Channel where ticket transcripts should be sent.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addRoleOption((option) => option.setName('staff_role').setDescription('Staff role that can view ticket channels.').setRequired(false))
        .addIntegerOption((option) => option.setName('ticket_limit').setDescription('Open ticket limit per user.').setMinValue(1).setMaxValue(10).setRequired(false))
        .addBooleanOption((option) => option.setName('transcripts').setDescription('Generate transcripts when tickets close.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a public ticket launcher panel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the panel in. Defaults to current channel.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addStringOption((option) => option.setName('type').setDescription('Ticket panel label/type.').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('open')
        .setDescription('Open a support ticket.')
        .addStringOption((option) => option.setName('subject').setDescription('Ticket subject.').setRequired(true).setMaxLength(100))
        .addStringOption((option) => option.setName('details').setDescription('Describe what you need help with.').setRequired(true).setMaxLength(1500))
    )
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
        .setName('close')
        .setDescription('Close the current ticket.')
        .addStringOption((option) => option.setName('reason').setDescription('Close reason.').setRequired(false).setMaxLength(1000))
    ),
  actionKey: ActionKeys.TicketsPanel,
  moduleKey: ModuleKeys.TICKETS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') return ActionKeys.TicketsConfigure;
    if (subcommand === 'panel' || subcommand === 'manager') return ActionKeys.TicketsPanel;
    if (subcommand === 'claim') return ActionKeys.TicketsClaim;
    if (subcommand === 'close') return ActionKeys.TicketsClose;
    if (subcommand === 'priority') return ActionKeys.TicketsManage;
    return ActionKeys.TicketsPanel;
  },
  isPublic(interaction) {
    return interaction.options.getSubcommand() === 'open';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'manager') {
      await replyPrivate(interaction, await buildTicketsPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'setup') {
      const config = await tickets.updateConfig(interaction.guildId, {
        categoryId: interaction.options.getChannel('category')?.id || null,
        logChannelId: interaction.options.getChannel('log_channel')?.id || null,
        staffRoleId: interaction.options.getRole('staff_role')?.id || null,
        ticketLimit: interaction.options.getInteger('ticket_limit') || null,
        transcriptEnabled: interaction.options.getBoolean('transcripts')
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Ticket Settings Updated', body: `Ticket settings updated by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Ticket System Configured', [
          `Category: ${config.category_id ? `<#${config.category_id}>` : 'Not set'}`,
          `Log Channel: ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'Not set'}`,
          `Staff Role: ${config.staff_role_id ? `<@&${config.staff_role_id}>` : 'Not set'}`,
          `Ticket Limit: **${config.ticket_limit}**`,
          `Transcripts: **${config.transcript_enabled ? 'Enabled' : 'Disabled'}**`
        ].join('\n'))]
      });
      return;
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const type = interaction.options.getString('type') || 'Admin Support';
      await channel.send(buildPublicTicketPanel(type));
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Panel Posted', `Panel posted in <#${channel.id}>.`)] });
      return;
    }

    if (subcommand === 'open') {
      const result = await tickets.createTicket({
        interaction,
        client: ctx.client,
        logger: ctx.logger,
        subject: interaction.options.getString('subject', true),
        details: interaction.options.getString('details', true)
      });
      if (!result.ok) {
        await replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Created', result.reason)] });
        return;
      }
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Created', `Your ticket was created: <#${result.channel.id}>.`)] });
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
      const priority = interaction.options.getString('level', true);
      const result = await tickets.setPriority({ interaction, logger: ctx.logger, priority });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Priority Updated', `Ticket #${result.ticket.ticket_number} priority set to **${priority}**.`)] });
      return;
    }

    if (subcommand === 'close') {
      const reason = interaction.options.getString('reason') || 'No reason provided.';
      const result = await tickets.closeTicket({ interaction, client: ctx.client, logger: ctx.logger, reason });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ticket Not Found', result.reason)] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Ticket Closed', `Ticket #${result.ticket.ticket_number} closed. Transcript sent: **${result.transcriptSent ? 'Yes' : 'No'}**.`)] });
    }
  }
};
