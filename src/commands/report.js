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
        .setDescription('Set the report review channel and optional pings.')
        .addChannelOption((option) => option.setName('review_channel').setDescription('Private staff report review channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption((option) => option.setName('ping_role').setDescription('Role to ping when a report is submitted.').setRequired(false))
        .addStringOption((option) => option.setName('ping_team').setDescription('Permission Team to ping when a report is submitted.').setRequired(false).setMaxLength(80))
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
    .addSubcommand((subcommand) => subcommand.setName('issue').setDescription('Privately report a general issue to staff.').addStringOption((option) => option.setName('details').setDescription('What happened?').setRequired(true).setMaxLength(1800))),
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

    if (subcommand === 'manager') return replyPrivate(interaction, await buildReportsPanel(interaction.guildId));

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('review_channel', true);
      const pingRole = interaction.options.getRole('ping_role');
      const pingTeam = interaction.options.getString('ping_team') || null;
      const config = await reports.updateConfig(interaction.guildId, { reviewChannelId: channel.id, pingRoleId: pingRole?.id || null, pingTeamName: pingTeam });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Report Settings Updated', body: `Report review channel set to <#${channel.id}> by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Report System Configured', [`Review Channel: <#${channel.id}>`, `Ping Role: ${config.ping_role_id ? `<@&${config.ping_role_id}>` : 'Not set'}`, `Ping Team: ${config.ping_team_id ? 'Configured' : 'Not set'}`].join('\n'))] });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.send(buildPublicReportPanel());
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Panel Posted', `Panel posted in <#${channel.id}>.`)] });
    }

    if (subcommand === 'user') {
      const targetUser = interaction.options.getUser('user', true);
      const details = interaction.options.getString('details', true);
      const messageLink = interaction.options.getString('message_link') || null;
      const report = await reports.createReport({ interaction, client: ctx.client, logger: ctx.logger, type: 'User Report', targetUser, details, messageLink });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Submitted', `Report #${report.report_number} was sent to staff.`)] });
    }

    if (subcommand === 'issue') {
      const details = interaction.options.getString('details', true);
      const report = await reports.createReport({ interaction, client: ctx.client, logger: ctx.logger, type: 'General Issue', details });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Report Submitted', `Report #${report.report_number} was sent to staff.`)] });
    }
  }
};
