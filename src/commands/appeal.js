const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { AppealService } = require('../modules/support/supportService');
const { buildAppealsPanel, buildPublicAppealPanel } = require('../modules/support/supportUi');
const { createSuccessEmbed } = require('../modules/ui/uiService');
const { recordPublishedPanel } = require('../modules/panels/publishedPanelService');
const { refreshPublishedPanel, formatRefreshSummary } = require('../modules/panels/panelUpdateService');

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
        .addStringOption((option) => option.setName('panel_header_image').setDescription('Optional image/media URL posted above the appeal panel embed.').setRequired(false).setMaxLength(1800))
        .addStringOption((option) => option.setName('display_mode').setDescription('Public panel component style.').setRequired(false).addChoices({ name: 'Buttons', value: 'BUTTONS' }, { name: 'Dropdown menu', value: 'DROPDOWN' }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit one or more appeal settings without redoing full setup.')
        .addChannelOption((option) => option.setName('review_channel').setDescription('Private staff appeal review channel.').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addBooleanOption((option) => option.setName('dm_decision').setDescription('DM users when their appeal is approved or denied.').setRequired(false))
        .addBooleanOption((option) => option.setName('dm_include_submission').setDescription('Include original appeal submission in the decision DM.').setRequired(false))
        .addStringOption((option) => option.setName('panel_title').setDescription('Public appeal panel title.').setRequired(false).setMaxLength(100))
        .addStringOption((option) => option.setName('panel_description').setDescription('Public appeal panel description.').setRequired(false).setMaxLength(800))
        .addStringOption((option) => option.setName('panel_color').setDescription('Panel accent color, example: #5aa7ff.').setRequired(false).setMaxLength(7))
        .addStringOption((option) => option.setName('panel_header_image').setDescription('Optional image/media URL posted above the appeal panel embed.').setRequired(false).setMaxLength(1800))
        .addStringOption((option) => option.setName('display_mode').setDescription('Public panel component style.').setRequired(false).addChoices({ name: 'Buttons', value: 'BUTTONS' }, { name: 'Dropdown menu', value: 'DROPDOWN' }))
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
    if (subcommand === 'setup' || subcommand === 'edit') return ActionKeys.AppealsConfigure;
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
      const config = await appeals.updateConfig(interaction.guildId, { reviewChannelId: channel.id, dmDecisionEnabled: interaction.options.getBoolean('dm_decision') || false, dmIncludeSubmission: interaction.options.getBoolean('dm_include_submission') || false, panelTitle: interaction.options.getString('panel_title') || null, panelDescription: interaction.options.getString('panel_description') || null, panelColor: interaction.options.getString('panel_color') || null, panelHeaderImageUrl: interaction.options.getString('panel_header_image') || null, panelDisplayMode: interaction.options.getString('display_mode') || null });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Appeal Settings Updated', body: `Appeal review channel set to <#${channel.id}> by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'appeal', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal System Configured', [`Review Channel: <#${channel.id}>`, `DM Decisions: **${config.dm_decision_enabled ? 'Enabled' : 'Disabled'}**`, `Include Submission in DM: **${config.dm_include_submission ? 'Enabled' : 'Disabled'}**`, `Panel Header Image: ${config.panel_header_image_url ? 'Configured' : 'Not set'}`, formatRefreshSummary(refresh)].filter(Boolean).join('\n'))] });
    }

    if (subcommand === 'edit') {
      const channel = interaction.options.getChannel('review_channel');
      const dmDecision = interaction.options.getBoolean('dm_decision');
      const dmIncludeSubmission = interaction.options.getBoolean('dm_include_submission');
      const panelTitle = interaction.options.getString('panel_title');
      const panelDescription = interaction.options.getString('panel_description');
      const panelColor = interaction.options.getString('panel_color');
      const panelHeaderImageUrl = interaction.options.getString('panel_header_image');
      const panelDisplayMode = interaction.options.getString('display_mode');
      const hasAnyUpdate = Boolean(channel || dmDecision !== null || dmIncludeSubmission !== null || panelTitle || panelDescription || panelColor || panelHeaderImageUrl || panelDisplayMode);
      if (!hasAnyUpdate) return replyPrivate(interaction, { embeds: [createSuccessEmbed('No Appeal Settings Changed', 'No appeal setting options were provided.')] });
      const input = {
        reviewChannelId: channel?.id || null,
        panelTitle: panelTitle || null,
        panelDescription: panelDescription || null,
        panelColor: panelColor || null,
        panelHeaderImageUrl: panelHeaderImageUrl || null,
        panelDisplayMode: panelDisplayMode || null
      };
      if (dmDecision !== null) input.dmDecisionEnabled = dmDecision;
      if (dmIncludeSubmission !== null) input.dmIncludeSubmission = dmIncludeSubmission;
      const config = await appeals.updateConfig(interaction.guildId, input);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Appeal Settings Edited', body: `Appeal settings edited by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'appeal', '*').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Settings Updated', [`Review Channel: ${config.review_channel_id ? `<#${config.review_channel_id}>` : 'Not set'}`, `DM Decisions: **${config.dm_decision_enabled ? 'Enabled' : 'Disabled'}**`, `Include Submission in DM: **${config.dm_include_submission ? 'Enabled' : 'Disabled'}**`, `Panel Header Image: ${config.panel_header_image_url ? 'Configured' : 'Not set'}`, formatRefreshSummary(refresh)].filter(Boolean).join('\n'))] });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const message = await channel.send(buildPublicAppealPanel(await appeals.getConfig(interaction.guildId)));
      await recordPublishedPanel({ guildId: interaction.guildId, panelType: 'appeal', panelRef: '*', channelId: channel.id, messageId: message.id });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Panel Posted', `Panel posted in <#${channel.id}>. Future appeal panel edits will update this message automatically.`)] });
    }

    if (subcommand === 'submit') {
      const appeal = await appeals.submitAppeal({ interaction, client: ctx.client, logger: ctx.logger, caseNumber: interaction.options.getInteger('case_number') || null, reason: interaction.options.getString('reason', true), details: interaction.options.getString('details') || null });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Appeal Submitted', `Appeal #${appeal.appeal_number} was sent to staff.`)] });
    }
  }
};
