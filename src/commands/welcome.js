const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const welcome = require('../modules/community/welcomeService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages and auto roles.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the welcome manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure the welcome message system.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel where welcome messages should be sent.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable welcome messages.').setRequired(false))
        .addStringOption((option) => option.setName('message').setDescription('Optional public message content. Supports {user}, {server}, {memberCount}.').setRequired(false).setMaxLength(1000))
        .addStringOption((option) => option.setName('title').setDescription('Embed title. Supports placeholders.').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('description').setDescription('Embed description. Supports placeholders.').setRequired(false).setMaxLength(1500))
        .addStringOption((option) => option.setName('color').setDescription('Embed accent color, such as #7869ff.').setRequired(false))
        .addBooleanOption((option) => option.setName('dm_enabled').setDescription('Whether to DM new members.').setRequired(false))
        .addStringOption((option) => option.setName('dm_message').setDescription('DM message. Supports placeholders.').setRequired(false).setMaxLength(1000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('auto-role-add')
        .setDescription('Add a role to assign when a user joins.')
        .addRoleOption((option) => option.setName('role').setDescription('Role to assign on join.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('auto-role-remove')
        .setDescription('Remove an auto role.')
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove from auto roles.').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('auto-role-list').setDescription('List configured auto roles.'))
    .addSubcommand((subcommand) => subcommand.setName('test').setDescription('Preview the welcome message using yourself.')),
  moduleKey: ModuleKeys.WELCOME,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'manager' || sub === 'auto-role-list') return ActionKeys.WelcomeView;
    if (sub === 'test') return ActionKeys.WelcomeTest;
    return ActionKeys.WelcomeConfigure;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'manager') {
      await replyPrivate(interaction, await welcome.buildWelcomePanel(interaction.guildId));
      return;
    }

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const config = await welcome.upsertWelcomeConfig({
        guildId: interaction.guildId,
        channelId: channel?.id,
        enabled: interaction.options.getBoolean('enabled') ?? undefined,
        message: interaction.options.getString('message') ?? undefined,
        title: interaction.options.getString('title') ?? undefined,
        description: interaction.options.getString('description') ?? undefined,
        color: interaction.options.getString('color') ?? undefined,
        dmEnabled: interaction.options.getBoolean('dm_enabled') ?? undefined,
        dmMessage: interaction.options.getString('dm_message') ?? undefined
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'welcome-config', title: 'Welcome Config Updated', body: `Updated by <@${interaction.user.id}>.`, actorUserId: interaction.user.id, metadata: { configId: config.id } });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Welcome Updated', `Welcome channel: ${config.channel_id ? `<#${config.channel_id}>` : 'Not set'}\nDM welcome: **${config.dm_enabled ? 'Enabled' : 'Disabled'}**`)] });
      return;
    }

    if (sub === 'auto-role-add') {
      const role = interaction.options.getRole('role', true);
      await welcome.addAutoRole(interaction.guildId, role.id, interaction.user.id);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'auto-role-config', title: 'Auto Role Added', body: `Role: <@&${role.id}>\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Auto Role Added', `<@&${role.id}> will be assigned to new members.`)] });
      return;
    }

    if (sub === 'auto-role-remove') {
      const role = interaction.options.getRole('role', true);
      await welcome.removeAutoRole(interaction.guildId, role.id);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'auto-role-config', title: 'Auto Role Removed', body: `Role: <@&${role.id}>\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Auto Role Removed', `<@&${role.id}> will no longer be assigned automatically.`)] });
      return;
    }

    if (sub === 'auto-role-list') {
      const roles = await welcome.listAutoRoles(interaction.guildId);
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Auto Roles', roles.length ? roles.map((roleId) => `• <@&${roleId}>`).join('\n') : 'No auto roles configured.')] });
      return;
    }

    if (sub === 'test') {
      const config = await welcome.getWelcomeConfig(interaction.guildId);
      if (!config?.channel_id) {
        await replyPrivate(interaction, { embeds: [createWarningEmbed('Welcome Not Configured', 'Set a welcome channel first with `/welcome setup`.')] });
        return;
      }
      const member = interaction.member;
      const channel = await interaction.guild.channels.fetch(config.channel_id).catch(() => null);
      if (!channel || typeof channel.send !== 'function') {
        await replyPrivate(interaction, { embeds: [createWarningEmbed('Channel Unavailable', 'The configured welcome channel could not be used.')] });
        return;
      }
      const embed = require('../modules/ui/uiService').createBaseEmbed({
        title: welcome.applyPlaceholders(config.embed_title || 'Welcome to {server}', member),
        description: welcome.applyPlaceholders(config.embed_description || 'Glad to have you here, {user}.', member),
        color: welcome.parseColor(config.embed_color),
        footer: 'SlickBot Welcome Test'
      });
      await channel.send({ content: config.message_template ? welcome.applyPlaceholders(config.message_template, member) : null, embeds: [embed] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Welcome Test Sent', `Sent a test welcome message to <#${channel.id}>.`)] });
    }
  }
};
