const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { ApplicationService } = require('../modules/support/supportService');
const { buildApplicationsPanel, buildPublicApplicationPanel } = require('../modules/support/supportUi');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');

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
        .setDescription('Submit an application using command fields.')
        .addStringOption((option) => option.setName('type').setDescription('Application type name.').setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName('why').setDescription('Why are you applying?').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('experience').setDescription('Relevant experience.').setRequired(true).setMaxLength(1000))
        .addStringOption((option) => option.setName('availability').setDescription('Availability or extra notes.').setRequired(false).setMaxLength(1000))
    ),
  actionKey: ActionKeys.ApplicationsPanel,
  moduleKey: ModuleKeys.APPLICATIONS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') return ActionKeys.ApplicationsConfigure;
    if (subcommand === 'panel' || subcommand === 'manager') return ActionKeys.ApplicationsPanel;
    return ActionKeys.ApplicationsReview;
  },
  isPublic(interaction) {
    return interaction.options.getSubcommand() === 'apply';
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild ? interaction.guild.name : null);
    await applications.ensureDefaultType(interaction.guildId);

    if (subcommand === 'manager') {
      await replyPrivate(interaction, await buildApplicationsPanel(interaction.guildId));
      return;
    }

    if (subcommand === 'setup') {
      const type = await applications.setupType(interaction.guildId, {
        name: interaction.options.getString('type', true),
        description: interaction.options.getString('description') || null,
        reviewChannelId: interaction.options.getChannel('review_channel', true).id,
        pendingRoleId: interaction.options.getRole('pending_role')?.id || null,
        approvedRoleId: interaction.options.getRole('approved_role')?.id || null,
        autoAssignApprovedRole: interaction.options.getBoolean('auto_assign') ?? false
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'setup', title: 'Application Type Updated', body: `${type.name} application settings updated by ${interaction.user.tag}.`, actorUserId: interaction.user.id }).catch(() => {});
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Type Configured', [
        `Type: **${type.name}**`,
        `Review Channel: <#${type.review_channel_id}>`,
        `Pending Role: ${type.pending_role_id ? `<@&${type.pending_role_id}>` : 'None'}`,
        `Approved Role: ${type.approved_role_id ? `<@&${type.approved_role_id}>` : 'None'}`,
        `Auto Assign: **${type.auto_assign_approved_role ? 'Yes' : 'No'}**`
      ].join('\n'))] });
      return;
    }

    if (subcommand === 'panel') {
      const typeName = interaction.options.getString('type', true);
      const type = await applications.getTypeByName(interaction.guildId, typeName);
      if (!type) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', `No application type named **${typeName}** exists. Use /application setup first.`)] });
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.send(buildPublicApplicationPanel(type));
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Panel Posted', `Panel posted in <#${channel.id}>.`)] });
      return;
    }

    if (subcommand === 'apply') {
      const typeName = interaction.options.getString('type', true);
      const type = await applications.getTypeByName(interaction.guildId, typeName);
      if (!type || !type.enabled) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Type Not Found', `No enabled application type named **${typeName}** exists.`)] });
      const result = await applications.submitApplication({
        interaction,
        client: ctx.client,
        logger: ctx.logger,
        applicationType: type,
        answers: {
          why: interaction.options.getString('why', true),
          experience: interaction.options.getString('experience', true),
          availability: interaction.options.getString('availability') || ''
        }
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Application Not Submitted', result.reason)] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Application Submitted', `Application #${result.submission.submission_number} was sent to staff.`)] });
    }
  }
};
