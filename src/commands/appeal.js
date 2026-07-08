const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { AppealService } = require('../modules/support/supportService');
const { buildAppealsPanel, buildPublicAppealPanel } = require('../modules/support/supportUi');
const { createSuccessEmbed } = require('../modules/ui/uiService');

const appeals = new AppealService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Appeal system tools.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the appeal manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Set the appeal review channel.')
        .addChannelOption((option) => option.setName('review_channel').setDescription('Private staff appeal review channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a public appeal launcher panel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the panel in. Defaults to current channel.').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('submit')
        .setDescription('Submit an appeal.')
        .addStringOption((option) => option.setName('reason').setDescription('Why should staff review this?').setRequired(true).setMaxLength(1000))
        .addIntegerOption((option) => option.setName('case_number').setDescription('Case number if known.').setRequired(false).setMinValue(1))
        .addStringOption((option) => option.setName('details').setDescription('Additional context.').setRequired(false).setMaxLength(1000))
    ),
  actionKey: ActionKeys.AppealsPanel,
  moduleKey: ModuleKeys.APPEALS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') return ActionKeys.AppealsConfigure;
    if (subcommand === 'panel' || subcommand === 'manager') return ActionKeys.AppealsPanel;
    return ActionKeys.AppealsReview;
  },
  isPublic(interaction) {
    return interaction.options.getSubcommand() === 'submit';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'manager') {
      await replyPrivate(interaction, await buildAppealsPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('review_channel', true);
      await appeals.updateConfig(interaction.guildId, channel.id);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Appeal Settings Updated', body: `Appeal review channel set to <#${channel.id}> by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal System Configured', `Review channel set to <#${channel.id}>.`)] });
      return;
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.send(buildPublicAppealPanel());
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Panel Posted', `Panel posted in <#${channel.id}>.`)] });
      return;
    }

    if (subcommand === 'submit') {
      const appeal = await appeals.submitAppeal({
        interaction,
        client: ctx.client,
        logger: ctx.logger,
        caseNumber: interaction.options.getInteger('case_number') || null,
        reason: interaction.options.getString('reason', true),
        details: interaction.options.getString('details') || null
      });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Submitted', `Appeal #${appeal.appeal_number} was sent to staff.`)] });
    }
  }
};
