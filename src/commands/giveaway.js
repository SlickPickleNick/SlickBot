const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { GiveawayService } = require('../modules/community/giveawayService');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');

const giveaways = new GiveawayService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage SlickBot giveaways.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the giveaway manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure giveaway defaults.')
        .addChannelOption((option) => option.setName('default_channel').setDescription('Default channel for giveaways.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addRoleOption((option) => option.setName('ping_role').setDescription('Optional role to ping when giveaways start.').setRequired(false))
        .addRoleOption((option) => option.setName('host_role').setDescription('Optional host role for your records.').setRequired(false))
        .addStringOption((option) => option.setName('panel_color').setDescription('Giveaway embed accent color, such as #7869ff.').setRequired(false).setMaxLength(7))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a giveaway.')
        .addStringOption((option) => option.setName('prize').setDescription('Giveaway prize.').setRequired(true).setMaxLength(200))
        .addStringOption((option) => option.setName('duration').setDescription('Duration, such as 30m, 2h, or 1d.').setRequired(true).setMaxLength(20))
        .addIntegerOption((option) => option.setName('winners').setDescription('Number of winners.').setMinValue(1).setMaxValue(20).setRequired(false))
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the giveaway. Defaults to configured channel/current channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addStringOption((option) => option.setName('description').setDescription('Optional giveaway details.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End a giveaway early and pick winners.')
        .addIntegerOption((option) => option.setName('number').setDescription('Giveaway number.').setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reroll')
        .setDescription('Reroll winners for a giveaway.')
        .addIntegerOption((option) => option.setName('number').setDescription('Giveaway number.').setRequired(true).setMinValue(1))
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List active giveaways.')),
  moduleKey: ModuleKeys.GIVEAWAYS,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'manager' || sub === 'list') return ActionKeys.GiveawaysView;
    if (sub === 'start') return ActionKeys.GiveawaysCreate;
    if (sub === 'end') return ActionKeys.GiveawaysEnd;
    if (sub === 'reroll') return ActionKeys.GiveawaysReroll;
    if (sub === 'setup') return ActionKeys.GiveawaysConfigure;
    return ActionKeys.GiveawaysView;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (sub === 'manager' || sub === 'list') {
      return replyPrivate(interaction, await giveaways.buildManagerPanel(interaction.guildId));
    }

    if (sub === 'setup') {
      const config = await giveaways.updateConfig(interaction.guildId, {
        defaultChannelId: interaction.options.getChannel('default_channel')?.id || null,
        pingRoleId: interaction.options.getRole('ping_role')?.id || null,
        hostRoleId: interaction.options.getRole('host_role')?.id || null,
        panelColor: interaction.options.getString('panel_color') || null
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'giveaway-config', title: 'Giveaway Settings Updated', body: `Giveaway settings updated by <@${interaction.user.id}>.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Settings Saved', [`Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : 'Not set'}`, `Ping Role: ${config.ping_role_id ? `<@&${config.ping_role_id}>` : 'Not set'}`].join('\n'))] });
    }

    if (sub === 'start') {
      const result = await giveaways.startGiveaway({
        interaction,
        client: ctx.client,
        logger: ctx.logger,
        channel: interaction.options.getChannel('channel') || null,
        prize: interaction.options.getString('prize', true),
        description: interaction.options.getString('description') || null,
        duration: interaction.options.getString('duration', true),
        winnerCount: interaction.options.getInteger('winners') || 1
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Started', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Started', `Giveaway #${result.giveaway.giveaway_number} was posted in <#${result.channel.id}>.`)] });
    }

    if (sub === 'end') {
      const result = await giveaways.endGiveaway({ client: ctx.client, guildId: interaction.guildId, giveawayNumber: interaction.options.getInteger('number', true), actorUserId: interaction.user.id, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Ended', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Ended', `Giveaway #${result.giveaway.giveaway_number} ended. Winners: **${result.winners.length}**.`)] });
    }

    if (sub === 'reroll') {
      const result = await giveaways.endGiveaway({ client: ctx.client, guildId: interaction.guildId, giveawayNumber: interaction.options.getInteger('number', true), actorUserId: interaction.user.id, logger: ctx.logger, reroll: true });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Rerolled', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Rerolled', `Giveaway #${result.giveaway.giveaway_number} was rerolled. New winners: **${result.winners.length}**.`)] });
    }
  }
};
