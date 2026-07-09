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
        .setDescription('Set appeal review settings.')
        .addChannelOption((option) => option.setName('review_channel').setDescription('Private staff appeal review channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addBooleanOption((option) => option.setName('dm_decision').setDescription('DM users when their appeal is approved or denied.').setRequired(false))
        .addBooleanOption((option) => option.setName('dm_include_submission').setDescription('Include original appeal submission in the decision DM.').setRequired(false))
        .addStringOption((option) => option.setName('panel_title').setDescription('Public appeal panel title.').setRequired(false).setMaxLength(100))
        .addStringOption((option) => option.setName('panel_description').setDescription('Public appeal panel description.').setRequired(false).setMaxLength(800))
        .addStringOption((option) => option.setName('panel_color').setDescription('Panel accent color, example: #5aa7ff.').setRequired(false).setMaxLength(7))
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
    if (subcommand === 'manager') return ActionKeys.AppealsManager;
    if (subcommand === 'panel') return ActionKeys.AppealsPostPanel;
    if (subcommand === 'submit') return ActionKeys.AppealsSubmit;
    return ActionKeys.AppealsReview;
  },
  isPublic(interaction) {
    return interaction.options.getSubcommand() === 'submit';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);

    if (subcommand === 'manager') return replyPrivate(interaction, await buildAppealsPanel(interaction.guildId));

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('review_channel', true);
      const config = await appeals.updateConfig(interaction.guildId, { reviewChannelId: channel.id, dmDecisionEnabled: interaction.options.getBoolean('dm_decision') || false, dmIncludeSubmission: interaction.options.getBoolean('dm_include_submission') || false, panelTitle: interaction.options.getString('panel_title') || null, panelDescription: interaction.options.getString('panel_description') || null, panelColor: interaction.options.getString('panel_color') || null });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Appeal Settings Updated', body: `Appeal review channel set to <#${channel.id}> by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal System Configured', [`Review Channel: <#${channel.id}>`, `DM Decisions: **${config.dm_decision_enabled ? 'Enabled' : 'Disabled'}**`, `Include Submission in DM: **${config.dm_include_submission ? 'Enabled' : 'Disabled'}**`].join('\n'))] });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.send(buildPublicAppealPanel(await appeals.getConfig(interaction.guildId))); 
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Panel Posted', `Panel posted in <#${channel.id}>.`)] });
    }

    if (subcommand === 'submit') {
      const appeal = await appeals.submitAppeal({ interaction, client: ctx.client, logger: ctx.logger, caseNumber: interaction.options.getInteger('case_number') || null, reason: interaction.options.getString('reason', true), details: interaction.options.getString('details') || null });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Submitted', `Appeal #${appeal.appeal_number} was sent to staff.`)] });
    }
  }
};
