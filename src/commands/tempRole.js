const { SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { TemporaryRoleService, formatDuration } = require('../modules/moderation/tempRoleService');

const tempRoles = new TemporaryRoleService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temp-role')
    .setDescription('Assign roles temporarily and let SlickBot remove them automatically.')
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Add a temporary role to a member.')
      .addUserOption((option) => option.setName('user').setDescription('Member to receive the role.').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Role to assign temporarily.').setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Duration, such as 30m, 2h, 7d, or 1w.').setMaxLength(40).setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Optional reason for staff records.').setMaxLength(500).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Remove an active temporary role assignment early.')
      .addUserOption((option) => option.setName('user').setDescription('Member with the temporary role.').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Temporary role to remove.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Optional reason for staff records.').setMaxLength(500).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('List active temporary roles for a member or the server.')
      .addUserOption((option) => option.setName('user').setDescription('Optional member filter.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('active')
      .setDescription('Open the Temporary Roles manager.')),
  moduleKey: ModuleKeys.TEMP_ROLES,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') return ActionKeys.TempRolesAdd;
    if (sub === 'remove') return ActionKeys.TempRolesRemove;
    return ActionKeys.TempRolesView;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'active') return replyPrivate(interaction, await tempRoles.buildManagerPanel(interaction.guildId));

    if (sub === 'list') {
      const user = interaction.options.getUser('user');
      const rows = await tempRoles.listActive(interaction.guildId, user?.id || null, 25);
      return replyPrivate(interaction, { embeds: [tempRoles.buildListEmbed(rows, user ? `Active Temporary Roles • ${user.tag || user.username}` : 'Active Temporary Roles')], deleteAfterSeconds: 30 });
    }

    if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const result = await tempRoles.addTemporaryRole({ guild: interaction.guild, user, role, durationText: interaction.options.getString('duration', true), actorUser: interaction.user, reason: interaction.options.getString('reason') || null, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Temporary Role Not Added', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Role Added', `<@&${role.id}> was added to <@${user.id}> for **${formatDuration(result.durationMs)}**.\nExpires: <t:${Math.floor(result.expiresAt.getTime() / 1000)}:f> (<t:${Math.floor(result.expiresAt.getTime() / 1000)}:R>)`)] });
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const result = await tempRoles.removeTemporaryRole({ guild: interaction.guild, user, role, actorUser: interaction.user, reason: interaction.options.getString('reason') || null, logger: ctx.logger });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Temporary Role Not Removed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Role Removed', `Removed <@&${role.id}> from <@${user.id}> and closed **${result.removed}** active assignment(s).`)] });
    }

    return replyPrivate(interaction, { embeds: [createWarningEmbed('Unsupported Temporary Role Action', 'This temporary role command is not available.')] });
  }
};
