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
    .setDescription('Create and manage SlickBot giveaways with entry gates.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the giveaway manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure giveaway defaults and entry gates.')
        .addChannelOption((option) => option.setName('default_channel').setDescription('Default channel for giveaways.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addRoleOption((option) => option.setName('ping_role').setDescription('Optional role to ping when giveaways start.').setRequired(false))
        .addRoleOption((option) => option.setName('host_role').setDescription('Optional host role for your records.').setRequired(false))
        .addRoleOption((option) => option.setName('default_required_role').setDescription('Default role required to enter giveaways.').setRequired(false))
        .addIntegerOption((option) => option.setName('default_min_level').setDescription('Default minimum server level to enter.').setMinValue(0).setMaxValue(1000).setRequired(false))
        .addIntegerOption((option) => option.setName('default_min_account_age').setDescription('Default minimum account age in days.').setMinValue(0).setMaxValue(3650).setRequired(false))
        .addStringOption((option) => option.setName('panel_color').setDescription('Giveaway embed accent color, such as #7869ff.').setRequired(false).setMaxLength(7))
        .addStringOption((option) => option.setName('panel_header_image').setDescription('Optional image/media URL posted above giveaway embeds.').setRequired(false).setMaxLength(1800))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a giveaway with optional entry requirements.')
        .addStringOption((option) => option.setName('prize').setDescription('Giveaway prize.').setRequired(true).setMaxLength(200))
        .addStringOption((option) => option.setName('duration').setDescription('Duration, such as 30m, 2h, or 1d.').setRequired(true).setMaxLength(20))
        .addIntegerOption((option) => option.setName('winners').setDescription('Number of winners (1-20).').setMinValue(1).setMaxValue(20).setRequired(false))
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the giveaway. Defaults to configured channel/current channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addRoleOption((option) => option.setName('required_role').setDescription('Role required to enter this giveaway.').setRequired(false))
        .addIntegerOption((option) => option.setName('min_level').setDescription('Minimum server level required to enter.').setMinValue(1).setMaxValue(1000).setRequired(false))
        .addIntegerOption((option) => option.setName('min_account_age').setDescription('Minimum Discord account age in days.').setMinValue(1).setMaxValue(3650).setRequired(false))
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
        .addIntegerOption((option) => option.setName('winners').setDescription('Number of winners to reroll.').setMinValue(1).setMaxValue(20).setRequired(false))
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
        defaultRequiredRoleId: interaction.options.getRole('default_required_role')?.id || null,
        defaultMinLevel: interaction.options.getInteger('default_min_level'),
        defaultMinAccountAgeDays: interaction.options.getInteger('default_min_account_age'),
        panelColor: interaction.options.getString('panel_color') || null,
        panelHeaderImageUrl: interaction.options.getString('panel_header_image') || null
      });
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'giveaway-config',
        title: 'Giveaway Settings Updated',
        body: `Giveaway settings updated by <@${interaction.user.id}>.`,
        actorUserId: interaction.user.id
      }).catch(() => {});

      const summary = [
        `Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : 'Not set'}`,
        `Ping Role: ${config.ping_role_id ? `<@&${config.ping_role_id}>` : 'Not set'}`,
        `Default Required Role: ${config.default_required_role_id ? `<@&${config.default_required_role_id}>` : 'None'}`,
        `Default Min Level: ${config.default_min_level ? `Level ${config.default_min_level}+` : 'None'}`,
        `Default Min Account Age: ${config.default_min_account_age_days ? `${config.default_min_account_age_days} day(s)` : 'None'}`,
        `Panel Header Image: ${config.panel_header_image_url ? 'Configured' : 'Not set'}`
      ].join('\n');

      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Settings Saved', summary)] });
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
        winnerCount: interaction.options.getInteger('winners') || 1,
        requiredRoleId: interaction.options.getRole('required_role')?.id || null,
        minLevel: interaction.options.getInteger('min_level'),
        minAccountAgeDays: interaction.options.getInteger('min_account_age')
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Started', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Started', `Giveaway #${result.giveaway.giveaway_number} was posted in <#${result.channel.id}>.`)] });
    }

    if (sub === 'end') {
      const result = await giveaways.endGiveaway({
        client: ctx.client,
        guildId: interaction.guildId,
        giveawayNumber: interaction.options.getInteger('number', true),
        actorUserId: interaction.user.id,
        logger: ctx.logger
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Ended', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Ended', `Giveaway #${result.giveaway.giveaway_number} ended. Winners: **${result.winners.length}**.`)] });
    }

    if (sub === 'reroll') {
      const winnersCount = interaction.options.getInteger('winners');
      const result = await giveaways.endGiveaway({
        client: ctx.client,
        guildId: interaction.guildId,
        giveawayNumber: interaction.options.getInteger('number', true),
        actorUserId: interaction.user.id,
        logger: ctx.logger,
        reroll: true,
        rerollCount: winnersCount
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Giveaway Not Rerolled', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Giveaway Rerolled', `Giveaway #${result.giveaway.giveaway_number} was rerolled. Selected winners: **${result.winners.length}**.`)] });
    }
  }
};
