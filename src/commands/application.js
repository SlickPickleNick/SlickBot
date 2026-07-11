const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ApplicationService } = require('../modules/support/supportService');
const { buildApplicationsPanel, buildPublicApplicationPanel } = require('../modules/support/supportUi');
const { createBaseEmbed, createSuccessEmbed, createWarningEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { recordPublishedPanel } = require('../modules/panels/publishedPanelService');
const { refreshPublishedPanel, formatRefreshSummary } = require('../modules/panels/panelUpdateService');

const applications = new ApplicationService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('application')
    .setDescription('Application system tools.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the application manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Create or update an application type.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
        .addChannelOption((option) => option.setName('review_channel').setDescription('Private staff review channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption((option) => option.setName('pending_role').setDescription('Role assigned while pending.').setRequired(false))
        .addRoleOption((option) => option.setName('approved_role').setDescription('Role assigned when approved.').setRequired(false))
        .addBooleanOption((option) => option.setName('auto_assign').setDescription('Automatically assign approved role.').setRequired(false))
        .addStringOption((option) => option.setName('description').setDescription('Panel/application description.').setRequired(false).setMaxLength(500))
        .addStringOption((option) => option.setName('confirmation_message').setDescription('DM message after user submits. Use {number} and {type}.').setRequired(false).setMaxLength(800))
        .addStringOption((option) => option.setName('panel_title').setDescription('Public application panel title.').setRequired(false).setMaxLength(100))
        .addStringOption((option) => option.setName('panel_description').setDescription('Public application panel description.').setRequired(false).setMaxLength(800))
        .addStringOption((option) => option.setName('panel_color').setDescription('Panel accent color, example: #7869ff.').setRequired(false).setMaxLength(7))
        .addStringOption((option) => option.setName('panel_header_image').setDescription('Optional image/media URL posted above the application panel embed.').setRequired(false).setMaxLength(1800))
        .addStringOption((option) => option.setName('display_mode').setDescription('Public panel component style.').setRequired(false).addChoices({ name: 'Buttons', value: 'BUTTONS' }, { name: 'Dropdown menu', value: 'DROPDOWN' }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('question-add')
        .setDescription('Add a custom DM question to an application type.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName('question').setDescription('Question text.').setRequired(true).setMaxLength(300))
        .addBooleanOption((option) => option.setName('required').setDescription('Whether this question is required.').setRequired(false))
        .addIntegerOption((option) => option.setName('order').setDescription('Display order.').setMinValue(1).setMaxValue(50).setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('question-list')
        .setDescription('List custom questions for an application type.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('question-clear')
        .setDescription('Clear all custom questions for an application type.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete an application type template and its related questions/submissions.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
        .addBooleanOption((option) => option.setName('confirm').setDescription('Must be true to delete the application type.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a public application panel.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the panel in. Defaults to current channel.').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('apply')
        .setDescription('Start a DM-based application.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
    ),
  actionKey: ActionKeys.ApplicationsPanel,
  moduleKey: ModuleKeys.APPLICATIONS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['setup', 'delete', 'question-add', 'question-clear'].includes(subcommand)) return ActionKeys.ApplicationsConfigure;
    if (subcommand === 'manager' || subcommand === 'question-list') return ActionKeys.ApplicationsManager;
    if (subcommand === 'panel') return ActionKeys.ApplicationsPostPanel;
    if (subcommand === 'apply') return ActionKeys.ApplicationsApply;
    return ActionKeys.ApplicationsReview;
  },
  isPublic(interaction) {
    return interaction.options.getSubcommand() === 'apply';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
    await applications.ensureDefaultType(interaction.guildId);

    if (subcommand === 'manager') return replyPrivate(interaction, await buildApplicationsPanel(interaction.guildId));

    if (subcommand === 'setup') {
      const type = await applications.setupType(interaction.guildId, {
        name: interaction.options.getString('type', true),
        reviewChannelId: interaction.options.getChannel('review_channel', true).id,
        pendingRoleId: interaction.options.getRole('pending_role')?.id || null,
        approvedRoleId: interaction.options.getRole('approved_role')?.id || null,
        autoAssignApprovedRole: interaction.options.getBoolean('auto_assign') || false,
        description: interaction.options.getString('description') || null,
        submissionConfirmationMessage: interaction.options.getString('confirmation_message') || null,
        panelTitle: interaction.options.getString('panel_title') || null,
        panelDescription: interaction.options.getString('panel_description') || null,
        panelColor: interaction.options.getString('panel_color') || null,
        panelHeaderImageUrl: interaction.options.getString('panel_header_image') || null,
        panelDisplayMode: interaction.options.getString('display_mode') || null
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Application Settings Updated', body: `${type.name} application settings updated by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'application', type.id).catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Type Configured', `Application type **${type.name}** is ready. Use \`/application question-add\` to customize the DM questions.${formatRefreshSummary(refresh)}`)] });
    }


    if (subcommand === 'delete') {
      const typeName = interaction.options.getString('type', true);
      const confirmed = interaction.options.getBoolean('confirm', true);
      if (!confirmed) return replyPrivate(interaction, { embeds: [createWarningEmbed('Delete Not Confirmed', 'Run the command again with `confirm:true` to delete this application type.')] });
      const result = await applications.deleteType(interaction.guildId, typeName);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Deleted', result.reason)] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Application Type Deleted', body: `Application type **${result.type.name}** was deleted by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'application', result.type.id).catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Type Deleted', `Deleted application type **${result.type.name}**.${formatRefreshSummary(refresh)}`)] });
    }

    if (subcommand === 'question-add') {
      const question = await applications.addQuestion(interaction.guildId, interaction.options.getString('type', true), interaction.options.getString('question', true), interaction.options.getBoolean('required') ?? true, interaction.options.getInteger('order') || null);
      if (!question) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', 'Create the application type with `/application setup` first.')] });
      const type = await applications.getTypeByName(interaction.guildId, interaction.options.getString('type', true));
      const refresh = type ? await refreshPublishedPanel(ctx.client, interaction.guildId, 'application', type.id).catch(() => null) : null;
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Question Added', `Question added at order **${question.display_order}**.${formatRefreshSummary(refresh)}`)] });
    }

    if (subcommand === 'question-list') {
      const type = await applications.getTypeByName(interaction.guildId, interaction.options.getString('type', true));
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', 'That application type could not be found.')] });
      const questions = await applications.getQuestions(type.id);
      const lines = questions.length ? questions.map((q, idx) => `${idx + 1}. ${q.required ? '**Required**' : 'Optional'} — ${q.question_text}`).join('\n') : 'No questions configured.';
      return replyPrivate(interaction, { embeds: [createBaseEmbed({ title: `${type.name} Questions`, description: lines, color: SlickBotColors.INFO })] });
    }

    if (subcommand === 'question-clear') {
      const type = await applications.clearQuestions(interaction.guildId, interaction.options.getString('type', true));
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', 'That application type could not be found.')] });
      const refresh = await refreshPublishedPanel(ctx.client, interaction.guildId, 'application', type.id).catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Questions Cleared', `Questions cleared for **${type.name}**.${formatRefreshSummary(refresh)}`)] });
    }

    if (subcommand === 'panel') {
      const type = await applications.getTypeByName(interaction.guildId, interaction.options.getString('type', true));
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', 'Create it with `/application setup` first.')] });
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const message = await channel.send(buildPublicApplicationPanel(type));
      await recordPublishedPanel({ guildId: interaction.guildId, panelType: 'application', panelRef: type.id, channelId: channel.id, messageId: message.id });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Panel Posted', `Panel posted in <#${channel.id}>. Future edits for **${type.name}** will update this message automatically.`)] });
    }

    if (subcommand === 'apply') {
      const type = await applications.getTypeByName(interaction.guildId, interaction.options.getString('type', true));
      if (!type || !type.enabled) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Unavailable', 'This application type is not currently available.')] });
      const result = await applications.startApplicationDm({ interaction, client: ctx.client, logger: ctx.logger, applicationType: type });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Started', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Started', `I sent you a DM with the first question. Question count: **${result.questionCount}**.`)] });
    }
  }
};
