const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ReportService } = require('../modules/support/supportService');
const { buildReportsPanel, buildPublicReportPanel } = require('../modules/support/supportUi');
const { createSuccessEmbed } = require('../modules/ui/uiService');

const reports = new ReportService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report system tools.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the report manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Set the report review channel.')
        .addChannelOption((option) => option.setName('review_channel').setDescription('Private staff report review channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a public report launcher panel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the panel in. Defaults to current channel.').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('Privately report a user to staff.')
        .addUserOption((option) => option.setName('user').setDescription('User being reported.').setRequired(true))
        .addStringOption((option) => option.setName('details').setDescription('What happened?').setRequired(true).setMaxLength(1800))
        .addStringOption((option) => option.setName('message_link').setDescription('Optional Discord message link.').setRequired(false).setMaxLength(300))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('issue')
        .setDescription('Privately report a general issue to staff.')
        .addStringOption((option) => option.setName('details').setDescription('What happened?').setRequired(true).setMaxLength(1800))
    ),
  actionKey: ActionKeys.ReportsPanel,
  moduleKey: ModuleKeys.REPORTS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') return ActionKeys.ReportsConfigure;
    if (subcommand === 'panel' || subcommand === 'manager') return ActionKeys.ReportsPanel;
    return ActionKeys.ReportsReview;
  },
  isPublic(interaction) {
    const subcommand = interaction.options.getSubcommand();
    return subcommand === 'user' || subcommand === 'issue';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'manager') {
      await replyPrivate(interaction, await buildReportsPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('review_channel', true);
      await reports.updateConfig(interaction.guildId, channel.id);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Report Settings Updated', body: `Report review channel set to <#${channel.id}> by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report System Configured', `Review channel set to <#${channel.id}>.`)] });
      return;
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.send(buildPublicReportPanel());
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Panel Posted', `Panel posted in <#${channel.id}>.`)] });
      return;
    }

    if (subcommand === 'user') {
      const targetUser = interaction.options.getUser('user', true);
      const details = interaction.options.getString('details', true);
      const messageLink = interaction.options.getString('message_link') || null;
      const report = await reports.createReport({ interaction, client: ctx.client, logger: ctx.logger, type: 'User Report', targetUser, details, messageLink });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Submitted', `Report #${report.report_number} was sent to staff.`)] });
      return;
    }

    if (subcommand === 'issue') {
      const details = interaction.options.getString('details', true);
      const report = await reports.createReport({ interaction, client: ctx.client, logger: ctx.logger, type: 'General Issue', details });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Submitted', `Report #${report.report_number} was sent to staff.`)] });
    }
  }
};
