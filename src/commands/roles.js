const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const rolePanels = require('../modules/community/rolePanelService');
const { startRolePanelCreationFlow, startRoleBulkAddFlow } = require('../modules/panels/messagePanelFlow');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Create and manage self-assignable role panels.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the role panel manager.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel-wizard')
        .setDescription('Create or update a role panel through guided setup-channel messages.')
        .addStringOption((option) => option.setName('name').setDescription('Optional internal panel name. If blank, SlickBot will ask for it.').setRequired(false).setMaxLength(50))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create-panel')
        .setDescription('Create or update a button role panel.')
        .addStringOption((option) => option.setName('name').setDescription('Internal panel name.').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('title').setDescription('Panel title shown to users.').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('description').setDescription('Panel description shown to users.').setRequired(false).setMaxLength(1500))
        .addStringOption((option) => option.setName('mode').setDescription('Allow one or multiple roles from this panel.').setRequired(false).addChoices({ name: 'Multiple roles', value: 'MULTI' }, { name: 'Single role', value: 'SINGLE' }))
        .addStringOption((option) => option.setName('color').setDescription('Panel accent color, such as #7869ff.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete-panel')
        .setDescription('Delete a role panel template.')
        .addStringOption((option) => option.setName('name').setDescription('Panel name to delete.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-option')
        .setDescription('Add a role option to a panel.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name.').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to toggle.').setRequired(true))
        .addStringOption((option) => option.setName('label').setDescription('Optional button label. Leave blank for emoji-only buttons.').setRequired(false).setMaxLength(80))
        .addStringOption((option) => option.setName('emoji').setDescription('Optional button emoji. Required if you want no text and no auto color emoji.').setRequired(false))
        .addStringOption((option) => option.setName('description').setDescription('Optional internal description.').setRequired(false).setMaxLength(200))
        .addStringOption((option) => option.setName('button_color').setDescription('Requested button color hex, mapped to nearest Discord style.').setRequired(false).setMaxLength(7))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bulk-add')
        .setDescription('Bulk add role options to a panel from line-based text.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name.').setRequired(true))
        .addStringOption((option) => option.setName('entries').setDescription('Lines: @role|Label|emoji|#hex. Label can be blank.').setRequired(true).setMaxLength(4000))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bulk-add-wizard')
        .setDescription('Bulk add role options through guided setup-channel messages.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-option')
        .setDescription('Remove a role option from a panel.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name.').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove from the panel.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('post-panel')
        .setDescription('Post a role panel to a channel.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name.').setRequired(true))
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to post the panel in.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List configured role panels.')),
  moduleKey: ModuleKeys.REACTION_ROLES,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'manager' || sub === 'list') return ActionKeys.RolePanelsView;
    if (sub === 'post-panel') return ActionKeys.RolePanelsPost;
    return ActionKeys.RolePanelsConfigure;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'manager' || sub === 'list') {
      await replyPrivate(interaction, await rolePanels.buildRoleManagerPanel(interaction.guildId));
      return;
    }

    if (sub === 'panel-wizard') {
      return startRolePanelCreationFlow(interaction, { logger: ctx.logger, initialName: interaction.options.getString('name') || null });
    }

    if (sub === 'create-panel') {
      const panel = await rolePanels.createPanel({
        guildId: interaction.guildId,
        name: interaction.options.getString('name', true),
        title: interaction.options.getString('title') || undefined,
        description: interaction.options.getString('description') || undefined,
        mode: interaction.options.getString('mode') || 'MULTI',
        color: interaction.options.getString('color') || undefined
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'reaction-role-config', title: 'Role Panel Saved', body: `Panel: **${panel.name}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Panel Saved', `Panel **${panel.name}** is ready for role options.`)] });
      return;
    }

    if (sub === 'delete-panel') {
      const panel = await rolePanels.deletePanel(interaction.guildId, interaction.options.getString('name', true));
      if (!panel) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Not Found', 'No active role panel was found with that name.')] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'reaction-role-config', title: 'Role Panel Deleted', body: `Panel: **${panel.name}**\nUpdated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Panel Deleted', `Panel **${panel.name}** was disabled.`)] });
      return;
    }

    if (sub === 'add-option') {
      const result = await rolePanels.addOption({
        guildId: interaction.guildId,
        panelName: interaction.options.getString('panel', true),
        roleId: interaction.options.getRole('role', true).id,
        label: interaction.options.getString('label') || '',
        emoji: interaction.options.getString('emoji') || null,
        description: interaction.options.getString('description') || null,
        buttonColor: interaction.options.getString('button_color') || null
      });
      if (!result) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Not Found', 'Create the panel first with `/roles create-panel`.')] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'reaction-role-config', title: 'Role Option Added', body: `Panel: **${result.panel.name}**\nRole: <@&${result.option.role_id}>`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Option Added', `<@&${result.option.role_id}> was added to **${result.panel.name}**.`)] });
      return;
    }

    if (sub === 'bulk-add') {
      const panelName = interaction.options.getString('panel', true);
      const entries = rolePanels.parseBulkEntries(interaction.options.getString('entries', true));
      const valid = entries.filter((entry) => entry.valid);
      if (!valid.length) return replyPrivate(interaction, { embeds: [createWarningEmbed('No Valid Role Entries', 'Use one line per role in this format: `@role|Button Label|emoji|#5865f2`. Label can be blank. Role mentions or role IDs are accepted.')] });
      const added = await rolePanels.bulkAddOptions({ guildId: interaction.guildId, panelName, entries: valid });
      if (!added.length) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Not Found', 'Create the panel first with `/roles create-panel`.')] });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'reaction-role-config', title: 'Role Options Bulk Added', body: `Panel: **${panelName}**\nOptions Added: **${added.length}**`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Options Added', `Added **${added.length}** role option(s) to **${panelName}**. Invalid/skipped lines: **${entries.length - valid.length}**.`)] });
      return;
    }

    if (sub === 'bulk-add-wizard') {
      return startRoleBulkAddFlow(interaction, { panelName: interaction.options.getString('panel', true), logger: ctx.logger });
    }

    if (sub === 'remove-option') {
      const option = await rolePanels.removeOption({ guildId: interaction.guildId, panelName: interaction.options.getString('panel', true), roleId: interaction.options.getRole('role', true).id });
      if (!option) return replyPrivate(interaction, { embeds: [createWarningEmbed('Option Not Found', 'No matching role option was found.')] });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Option Removed', 'The role option was removed from the panel.')] });
      return;
    }

    if (sub === 'post-panel') {
      const panel = await rolePanels.getPanelByName(interaction.guildId, interaction.options.getString('panel', true));
      if (!panel) return replyPrivate(interaction, { embeds: [createWarningEmbed('Panel Not Found', 'No active role panel was found with that name.')] });
      const payload = await rolePanels.buildRolePanelMessage(panel);
      if (!payload.components.length) return replyPrivate(interaction, { embeds: [createWarningEmbed('No Role Options', 'Add at least one role option before posting this panel.')] });
      const channel = interaction.options.getChannel('channel', true);
      await channel.send(payload);
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'reaction-role-config', title: 'Role Panel Posted', body: `Panel: **${panel.name}**\nChannel: <#${channel.id}>\nPosted By: <@${interaction.user.id}>`, actorUserId: interaction.user.id });
      await replyPrivate(interaction, { embeds: [createSuccessEmbed('Role Panel Posted', `Posted **${panel.name}** to <#${channel.id}>.`)] });
    }
  }
};
