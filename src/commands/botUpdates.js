const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { BotUpdatesService } = require('../modules/status/botUpdatesService');
const packageInfo = require('../../package.json');

const updates = new BotUpdatesService();

function roleSummary(roleIds) {
  return roleIds.length ? roleIds.map((roleId) => `<@&${roleId}>`).join(', ') : 'None';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot-updates')
    .setDescription('Configure and send SlickBot update announcements.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('View Bot Updates configuration.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure bot update announcements.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel where bot update messages should be posted.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
        .addRoleOption((option) => option.setName('role_1').setDescription('Optional role to ping for bot updates.').setRequired(false))
        .addRoleOption((option) => option.setName('role_2').setDescription('Optional additional role to ping.').setRequired(false))
        .addRoleOption((option) => option.setName('role_3').setDescription('Optional additional role to ping.').setRequired(false))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable bot update announcements.').setRequired(false))
        .addBooleanOption((option) => option.setName('ping_roles').setDescription('Whether configured roles should be pinged.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('channel')
        .setDescription('Set the bot update announcement channel.')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel where bot update messages should be posted.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('role-add')
        .setDescription('Add a role ping for bot update announcements.')
        .addRoleOption((option) => option.setName('role').setDescription('Role to ping.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('role-remove')
        .setDescription('Remove a role ping from bot update announcements.')
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove.').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('roles').setDescription('List configured bot update ping roles.'))
    .addSubcommand((subcommand) => subcommand.setName('clear-roles').setDescription('Remove all bot update ping roles.'))
    .addSubcommand((subcommand) => subcommand.setName('enable').setDescription('Enable bot update announcements.'))
    .addSubcommand((subcommand) => subcommand.setName('disable').setDescription('Disable bot update announcements.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('preview')
        .setDescription('Preview the bot update message without posting it publicly.')
        .addStringOption((option) => option.setName('version').setDescription('Version to preview. Defaults to current version.').setRequired(false).setMaxLength(32))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('send')
        .setDescription('Send the current bot update announcement now.')
        .addStringOption((option) => option.setName('version').setDescription('Version to send. Defaults to current version.').setRequired(false).setMaxLength(32))
        .addBooleanOption((option) => option.setName('force').setDescription('Send even if this version was already announced.').setRequired(false))
    ),
  moduleKey: ModuleKeys.BOT_UPDATES,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['panel', 'roles', 'preview'].includes(subcommand)) return ActionKeys.BotUpdatesView;
    if (subcommand === 'send') return ActionKeys.BotUpdatesSend;
    return ActionKeys.BotUpdatesConfigure;
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'panel') {
      return replyPrivate(interaction, await updates.buildStatusPanel(interaction.guildId));
    }

    if (subcommand === 'setup') {
      const roleIds = ['role_1', 'role_2', 'role_3']
        .map((name) => interaction.options.getRole(name)?.id)
        .filter(Boolean);
      const result = await updates.setup(interaction.guildId, {
        channelId: interaction.options.getChannel('channel', true).id,
        enabled: interaction.options.getBoolean('enabled') ?? true,
        pingRolesEnabled: interaction.options.getBoolean('ping_roles') ?? true,
        roleIds
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'bot-update-config', title: 'Bot Updates Configured', body: `Updated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Bot Updates Configured', [`Channel: <#${result.config.channel_id}>`, `Enabled: **${result.config.enabled ? 'Yes' : 'No'}**`, `Ping Roles: ${roleSummary(result.roleIds)}`].join('\n'))]
      });
    }

    if (subcommand === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      await updates.setChannel(interaction.guildId, channel.id);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Bot Update Channel Set', `Bot update announcements will post in <#${channel.id}>.`)] });
    }

    if (subcommand === 'role-add') {
      const role = interaction.options.getRole('role', true);
      const roleIds = await updates.addRole(interaction.guildId, role.id);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Bot Update Role Added', `Ping Roles: ${roleSummary(roleIds)}`)] });
    }

    if (subcommand === 'role-remove') {
      const role = interaction.options.getRole('role', true);
      const roleIds = await updates.removeRole(interaction.guildId, role.id);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Bot Update Role Removed', `Ping Roles: ${roleSummary(roleIds)}`)] });
    }

    if (subcommand === 'roles') {
      const roleIds = await updates.getRoleIds(interaction.guildId);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Bot Update Ping Roles', `Ping Roles: ${roleSummary(roleIds)}`)] });
    }

    if (subcommand === 'clear-roles') {
      await updates.clearRoles(interaction.guildId);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Bot Update Roles Cleared', 'No roles will be pinged for bot updates.')] });
    }

    if (subcommand === 'enable' || subcommand === 'disable') {
      const enabled = subcommand === 'enable';
      await updates.setEnabled(interaction.guildId, enabled);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Bot Updates ${enabled ? 'Enabled' : 'Disabled'}`, `Bot update announcements are now **${enabled ? 'enabled' : 'disabled'}**.`)] });
    }

    if (subcommand === 'preview') {
      const version = interaction.options.getString('version') || packageInfo.version;
      const { config, roleIds } = await updates.getConfigWithRoles(interaction.guildId);
      return replyPrivate(interaction, updates.buildPayload({ version, config, roleIds, preview: true }));
    }

    if (subcommand === 'send') {
      const version = interaction.options.getString('version') || packageInfo.version;
      const force = interaction.options.getBoolean('force') ?? false;
      const result = await updates.sendUpdate(interaction.guild, ctx.logger, { version, force, actorUserId: interaction.user.id, reason: 'manual' });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Bot Update Not Sent', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Bot Update Sent', `Posted SlickBot v${result.version} in <#${result.channelId}>.`)] });
    }
  }
};
