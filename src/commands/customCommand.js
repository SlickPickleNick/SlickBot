const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../modules/ui/uiService');
const { CustomCommandService } = require('../modules/custom/customCommandService');

const service = new CustomCommandService();

function formatCommand(command) {
  return `\`${command.prefix || '!'}${command.name}\``;
}

function optionSummary(command) {
  return [
    `Trigger: ${formatCommand(command)}`,
    `Status: **${command.enabled ? 'Enabled' : 'Disabled'}**`,
    `Mode: **${command.embed_enabled ? 'Embed' : 'Plain Text'}**`,
    `Cooldown: **${command.cooldown_seconds || 0}s**`,
    `Allowed Channel: ${command.allowed_channel_id ? `<#${command.allowed_channel_id}>` : 'Any'}`,
    `Allowed Role: ${command.allowed_role_id ? `<@&${command.allowed_role_id}>` : 'Any'}`
  ].join('\n');
}

async function logConfig(ctx, interaction, title, command, action = 'updated') {
  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'custom-command-config',
    title,
    body: [`Command: ${formatCommand(command)}`, `Action: **${action}**`, `Updated By: <@${interaction.user.id}>`].join('\n'),
    actorUserId: interaction.user.id,
    metadata: { commandId: command.id, commandName: command.name, action }
  }).catch(() => {});
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('custom-command')
    .setDescription('Create and manage SlickBot custom chat commands.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('View custom command module status.'))
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List custom commands.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View a custom command.')
        .addStringOption((option) => option.setName('command').setDescription('Command trigger, such as rules or !rules.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a custom command.')
        .addStringOption((option) => option.setName('trigger').setDescription('Trigger name, such as rules or !rules.').setRequired(true).setMaxLength(40))
        .addStringOption((option) => option.setName('response').setDescription('Response text. Supports {user}, {username}, {server}, {channel}, {trigger}, and {uses}.').setRequired(true).setMaxLength(2000))
        .addBooleanOption((option) => option.setName('embed_mode').setDescription('Send the response as an embed instead of plain text.').setRequired(false))
        .addStringOption((option) => option.setName('embed_title').setDescription('Optional embed title.').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('embed_color').setDescription('Optional embed hex color, such as #7869FF.').setRequired(false).setMaxLength(7))
        .addIntegerOption((option) => option.setName('cooldown_seconds').setDescription('Per-user cooldown in seconds.').setRequired(false).setMinValue(0).setMaxValue(86400))
        .addChannelOption((option) => option.setName('allowed_channel').setDescription('Optional channel where this command can be used.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addRoleOption((option) => option.setName('allowed_role').setDescription('Optional role required to use this command.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit a custom command.')
        .addStringOption((option) => option.setName('command').setDescription('Existing command trigger.').setRequired(true).setAutocomplete(true))
        .addStringOption((option) => option.setName('new_trigger').setDescription('Rename the command trigger.').setRequired(false).setMaxLength(40))
        .addStringOption((option) => option.setName('response').setDescription('New response text.').setRequired(false).setMaxLength(2000))
        .addBooleanOption((option) => option.setName('embed_mode').setDescription('Enable or disable embed mode.').setRequired(false))
        .addStringOption((option) => option.setName('embed_title').setDescription('New embed title.').setRequired(false).setMaxLength(256))
        .addStringOption((option) => option.setName('embed_color').setDescription('New embed hex color, such as #7869FF.').setRequired(false).setMaxLength(7))
        .addIntegerOption((option) => option.setName('cooldown_seconds').setDescription('Per-user cooldown in seconds.').setRequired(false).setMinValue(0).setMaxValue(86400))
        .addChannelOption((option) => option.setName('allowed_channel').setDescription('Restrict usage to this channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addRoleOption((option) => option.setName('allowed_role').setDescription('Restrict usage to this role.').setRequired(false))
        .addBooleanOption((option) => option.setName('clear_channel').setDescription('Remove the channel restriction.').setRequired(false))
        .addBooleanOption((option) => option.setName('clear_role').setDescription('Remove the role restriction.').setRequired(false))
        .addBooleanOption((option) => option.setName('clear_title').setDescription('Clear the embed title.').setRequired(false))
        .addBooleanOption((option) => option.setName('clear_color').setDescription('Clear the embed color.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a custom command.')
        .addStringOption((option) => option.setName('command').setDescription('Command trigger to delete.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Enable a custom command.')
        .addStringOption((option) => option.setName('command').setDescription('Command trigger to enable.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable a custom command.')
        .addStringOption((option) => option.setName('command').setDescription('Command trigger to disable.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('test')
        .setDescription('Preview a custom command privately.')
        .addStringOption((option) => option.setName('command').setDescription('Command trigger to test.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('prefix')
        .setDescription('Set the custom command trigger prefix.')
        .addStringOption((option) => option.setName('prefix').setDescription('Prefix to use, such as ! or ?.').setRequired(true).setMinLength(1).setMaxLength(8))
    ),
  moduleKey: ModuleKeys.CUSTOM_COMMANDS,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (['panel', 'list', 'view', 'test'].includes(subcommand)) return ActionKeys.CustomCommandsView;
    if (subcommand === 'create') return ActionKeys.CustomCommandsCreate;
    if (subcommand === 'delete') return ActionKeys.CustomCommandsDelete;
    if (['enable', 'disable'].includes(subcommand)) return ActionKeys.CustomCommandsEnable;
    return ActionKeys.CustomCommandsEdit;
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused() || '';
    const commands = await service.listCommands(interaction.guildId, { includeDisabled: true, limit: 25 }).catch(() => []);
    const value = String(focused).toLowerCase().replace(/^!/, '');
    const choices = commands
      .filter((command) => !value || command.name.includes(value))
      .slice(0, 25)
      .map((command) => ({ name: `${command.prefix || '!'}${command.name}${command.enabled ? '' : ' (disabled)'}`, value: command.name }));
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      if (subcommand === 'panel') return replyPrivate(interaction, await service.buildManagerPanel(interaction.guildId));

      if (subcommand === 'list') {
        const config = await service.getConfig(interaction.guildId);
        const commands = await service.listCommands(interaction.guildId, { includeDisabled: true, limit: 50 });
        const lines = commands.length
          ? commands.map((command) => `• \`${config.prefix || '!'}${command.name}\` — ${command.enabled ? 'Enabled' : 'Disabled'} · ${command.embed_enabled ? 'Embed' : 'Text'} · ${command.usage_count || 0} use(s)`).join('\n')
          : 'No custom commands have been created yet.';
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Custom Commands', lines)] });
      }

      if (subcommand === 'view') {
        const embed = await service.buildCommandEmbed(interaction.guildId, interaction.options.getString('command', true));
        return replyPrivate(interaction, { embeds: [embed] });
      }

      if (subcommand === 'create') {
        const command = await service.createCommand(interaction.guildId, {
          name: interaction.options.getString('trigger', true),
          response: interaction.options.getString('response', true),
          embedEnabled: interaction.options.getBoolean('embed_mode') ?? false,
          embedTitle: interaction.options.getString('embed_title'),
          embedColor: interaction.options.getString('embed_color'),
          cooldownSeconds: interaction.options.getInteger('cooldown_seconds') ?? 0,
          allowedChannelId: interaction.options.getChannel('allowed_channel')?.id || null,
          allowedRoleId: interaction.options.getRole('allowed_role')?.id || null,
          actorUserId: interaction.user.id
        });
        await logConfig(ctx, interaction, 'Custom Command Created', command, 'created');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Custom Command Created', optionSummary(command))] });
      }

      if (subcommand === 'edit') {
        const command = await service.updateCommand(interaction.guildId, interaction.options.getString('command', true), {
          newName: interaction.options.getString('new_trigger'),
          response: interaction.options.getString('response'),
          embedEnabled: interaction.options.getBoolean('embed_mode'),
          embedTitle: interaction.options.getString('embed_title'),
          embedColor: interaction.options.getString('embed_color'),
          cooldownSeconds: interaction.options.getInteger('cooldown_seconds'),
          allowedChannelId: interaction.options.getChannel('allowed_channel')?.id || null,
          allowedRoleId: interaction.options.getRole('allowed_role')?.id || null,
          clearChannel: interaction.options.getBoolean('clear_channel') ?? false,
          clearRole: interaction.options.getBoolean('clear_role') ?? false,
          clearTitle: interaction.options.getBoolean('clear_title') ?? false,
          clearColor: interaction.options.getBoolean('clear_color') ?? false,
          actorUserId: interaction.user.id
        });
        await logConfig(ctx, interaction, 'Custom Command Updated', command, 'updated');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Custom Command Updated', optionSummary(command))] });
      }

      if (subcommand === 'delete') {
        const command = await service.deleteCommand(interaction.guildId, interaction.options.getString('command', true));
        await logConfig(ctx, interaction, 'Custom Command Deleted', command, 'deleted');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Custom Command Deleted', `${formatCommand(command)} was deleted.`)] });
      }

      if (subcommand === 'enable' || subcommand === 'disable') {
        const enabled = subcommand === 'enable';
        const command = await service.setEnabled(interaction.guildId, interaction.options.getString('command', true), enabled, interaction.user.id);
        await logConfig(ctx, interaction, `Custom Command ${enabled ? 'Enabled' : 'Disabled'}`, command, enabled ? 'enabled' : 'disabled');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Custom Command ${enabled ? 'Enabled' : 'Disabled'}`, optionSummary(command))] });
      }

      if (subcommand === 'test') {
        const command = await service.findCommand(interaction.guildId, interaction.options.getString('command', true));
        if (!command) return replyPrivate(interaction, { embeds: [createWarningEmbed('Custom Command Not Found', 'That custom command does not exist.')] });
        return replyPrivate(interaction, service.buildResponsePayload(command, null, { preview: true }));
      }

      if (subcommand === 'prefix') {
        const config = await service.setPrefix(interaction.guildId, interaction.options.getString('prefix', true));
        await ctx.logger.log({
          guildId: interaction.guildId,
          eventKey: 'custom-command-config',
          title: 'Custom Command Prefix Updated',
          body: [`Prefix: \`${config.prefix}\``, `Updated By: <@${interaction.user.id}>`].join('\n'),
          actorUserId: interaction.user.id,
          metadata: { prefix: config.prefix }
        }).catch(() => {});
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Custom Command Prefix Updated', `Members can now trigger custom commands with \`${config.prefix}\`, such as \`${config.prefix}rules\`.`)] });
      }
    } catch (error) {
      return replyPrivate(interaction, { embeds: [createErrorEmbed('Custom Command Error', error instanceof Error ? error.message : String(error))] });
    }
  }
};
