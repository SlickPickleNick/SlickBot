const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { ScheduledMessageService, formatTimestamp } = require('../modules/automation/scheduledMessageService');

const scheduler = new ScheduledMessageService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Create and manage scheduled SlickBot messages.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the scheduled messages manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure scheduled message defaults.')
        .addChannelOption((option) => option.setName('default_channel').setDescription('Default channel for scheduled messages.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable scheduled message sending.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a scheduled message.')
        .addStringOption((option) => option.setName('message').setDescription('Message content to send.').setRequired(true).setMaxLength(1500))
        .addStringOption((option) => option.setName('delay').setDescription('Delay before sending, such as 30m, 2h, 1d, or 1w.').setRequired(true).setMaxLength(20))
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to send in. Defaults to configured channel/current channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addStringOption((option) => option.setName('repeat').setDescription('Optional repeat mode.').setRequired(false).addChoices(
          { name: 'No Repeat', value: 'NONE' },
          { name: 'Daily', value: 'DAILY' },
          { name: 'Weekly', value: 'WEEKLY' }
        ))
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List upcoming scheduled messages.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel a scheduled message.')
        .addIntegerOption((option) => option.setName('number').setDescription('Scheduled message number.').setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('send-now')
        .setDescription('Send a scheduled message now.')
        .addIntegerOption((option) => option.setName('number').setDescription('Scheduled message number.').setRequired(true).setMinValue(1))
    ),
  moduleKey: ModuleKeys.SCHEDULED_MESSAGES,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'manager' || sub === 'list') return ActionKeys.ScheduledMessagesView;
    if (sub === 'create') return ActionKeys.ScheduledMessagesCreate;
    if (sub === 'cancel') return ActionKeys.ScheduledMessagesCancel;
    if (sub === 'send-now') return ActionKeys.ScheduledMessagesSendNow;
    return ActionKeys.ScheduledMessagesConfigure;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (sub === 'manager' || sub === 'list') {
      return replyPrivate(interaction, await scheduler.buildManagerPanel(interaction.guildId));
    }

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('default_channel');
      const config = await scheduler.updateConfig(interaction.guildId, {
        defaultChannelId: channel?.id || null,
        enabled: interaction.options.getBoolean('enabled') ?? true
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'scheduled-messages', title: 'Scheduled Messages Config Updated', body: `Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : 'Not set'}\nEnabled: **${config.enabled ? 'Yes' : 'No'}**`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Scheduled Messages Saved', `Default channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : 'not set'}. Module sending is **${config.enabled ? 'enabled' : 'disabled'}**.`)] });
    }

    if (sub === 'create') {
      const config = await scheduler.getConfig(interaction.guildId);
      const channel = interaction.options.getChannel('channel') || (config.default_channel_id ? await interaction.guild.channels.fetch(config.default_channel_id).catch(() => null) : interaction.channel);
      if (!channel || typeof channel.send !== 'function') return replyPrivate(interaction, { embeds: [createWarningEmbed('Channel Required', 'Choose a channel or configure a default scheduled message channel first.')] });
      const result = await scheduler.createScheduledMessage({
        guildId: interaction.guildId,
        channelId: channel.id,
        actorUserId: interaction.user.id,
        content: interaction.options.getString('message', true),
        delay: interaction.options.getString('delay', true),
        repeat: interaction.options.getString('repeat') || 'NONE'
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Schedule Not Created', result.reason)] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'scheduled-messages', title: 'Scheduled Message Created', body: `Schedule #${result.schedule.schedule_number}\nChannel: <#${channel.id}>\nSends: ${formatTimestamp(result.schedule.send_at)}`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Scheduled Message Created', `Schedule #${result.schedule.schedule_number} will send in <#${channel.id}> ${formatTimestamp(result.schedule.send_at)}.`)] });
    }

    if (sub === 'cancel') {
      const schedule = await scheduler.cancel(interaction.guildId, interaction.options.getInteger('number', true), interaction.user.id);
      if (!schedule) return replyPrivate(interaction, { embeds: [createWarningEmbed('Schedule Not Cancelled', 'That scheduled message was not found or is not active.')] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'scheduled-messages', title: 'Scheduled Message Cancelled', body: `Schedule #${schedule.schedule_number} was cancelled by <@${interaction.user.id}>.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Scheduled Message Cancelled', `Schedule #${schedule.schedule_number} has been cancelled.`)] });
    }

    if (sub === 'send-now') {
      const result = await scheduler.sendNow({ client: ctx.client, guildId: interaction.guildId, scheduleNumber: interaction.options.getInteger('number', true), actorUserId: interaction.user.id, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Schedule Not Sent', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Scheduled Message Sent', `Schedule #${result.schedule.schedule_number} was sent to <#${result.channel.id}>.`)] });
    }
  }
};
