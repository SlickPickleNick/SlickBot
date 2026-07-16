const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { LockdownService, DEFAULT_PRESET, formatBool } = require('../modules/safety/lockdownService');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { replyPrivate } = require('../utils/reply');
const { truncate } = require('../utils/format');

const lockdown = new LockdownService();

const channelTypes = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildCategory
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Configure and run server lockdown presets.')
    .addSubcommand((sub) => sub.setName('manager').setDescription('Open the Lockdown manager panel.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View active lockdown and configured presets.'))
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Create or update a lockdown preset.')
      .addStringOption((option) => option.setName('preset').setDescription('Preset name.').setMaxLength(80).setRequired(false).setAutocomplete(true))
      .addChannelOption((option) => option.setName('updates_channel').setDescription('Announcement/updates channel referenced in lockdown embeds.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
      .addStringOption((option) => option.setName('title').setDescription('Lockdown embed title.').setMaxLength(120).setRequired(false))
      .addStringOption((option) => option.setName('description').setDescription('Lockdown embed description.').setMaxLength(1500).setRequired(false))
      .addRoleOption((option) => option.setName('ping_role').setDescription('Optional role to ping in affected channels.').setRequired(false)))
    .addSubcommand((sub) => sub.setName('preset-list').setDescription('List lockdown presets.'))
    .addSubcommand((sub) => sub
      .setName('preset-delete')
      .setDescription('Disable a lockdown preset.')
      .addStringOption((option) => option.setName('preset').setDescription('Preset name.').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('channel-add')
      .setDescription('Add or update a channel in a lockdown preset.')
      .addChannelOption((option) => option.setName('channel').setDescription('Channel to control during lockdown.').addChannelTypes(...channelTypes).setRequired(true))
      .addStringOption((option) => option.setName('preset').setDescription('Preset name.').setMaxLength(80).setRequired(false).setAutocomplete(true))
      .addBooleanOption((option) => option.setName('hide_channel').setDescription('Deny @everyone View Channel in this channel.').setRequired(false))
      .addBooleanOption((option) => option.setName('disable_messages').setDescription('Deny @everyone message/thread permissions for text/forum channels. Default for text: true.').setRequired(false))
      .addBooleanOption((option) => option.setName('disable_connect').setDescription('Deny @everyone Connect for voice/stage channels. Default for voice: true.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('channel-remove')
      .setDescription('Remove a channel from a lockdown preset.')
      .addChannelOption((option) => option.setName('channel').setDescription('Channel to remove.').addChannelTypes(...channelTypes).setRequired(true))
      .addStringOption((option) => option.setName('preset').setDescription('Preset name.').setRequired(false).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('channel-list')
      .setDescription('List channels controlled by a preset.')
      .addStringOption((option) => option.setName('preset').setDescription('Preset name.').setRequired(false).setAutocomplete(true)))
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Start a lockdown from a preset.')
      .addStringOption((option) => option.setName('preset').setDescription('Preset to start.').setRequired(true).setAutocomplete(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason for starting lockdown.').setMaxLength(1000).setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('end')
      .setDescription('End the active lockdown and restore previous permissions.')
      .addStringOption((option) => option.setName('reason').setDescription('Reason or notes for ending lockdown.').setMaxLength(1000).setRequired(false)))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Reset Lockdown setup and testing data. Requires confirmation.')),
  moduleKey: ModuleKeys.LOCKDOWN,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand(false);
    if (sub === 'start') return ActionKeys.LockdownStart;
    if (sub === 'end') return ActionKeys.LockdownEnd;
    if (sub === 'reset') return ActionKeys.LockdownReset;
    if (['setup', 'channel-add', 'channel-remove', 'preset-delete'].includes(sub)) return ActionKeys.LockdownConfigure;
    return ActionKeys.LockdownView;
  },
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = interaction.guildId ? await lockdown.autocompletePresets(interaction.guildId, focused).catch(() => []) : [];
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand(false);

    if (sub === 'manager') {
      await interaction.reply({ ...(await lockdown.buildManagerPanel(interaction.guildId)), ephemeral: true });
      return;
    }

    if (sub === 'status') {
      await interaction.reply({ ...(await lockdown.buildManagerPanel(interaction.guildId)), ephemeral: true });
      return;
    }

    if (sub === 'setup') {
      const preset = await lockdown.upsertPreset({
        guildId: interaction.guildId,
        name: interaction.options.getString('preset') || DEFAULT_PRESET,
        updatesChannelId: interaction.options.getChannel('updates_channel')?.id,
        announcementTitle: interaction.options.getString('title') ?? undefined,
        announcementBody: interaction.options.getString('description') ?? undefined,
        pingRoleId: interaction.options.getRole('ping_role')?.id
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'lockdown-config', title: 'Lockdown Preset Configured', body: `Preset: **${preset.name}**`, actorUserId: interaction.user.id, metadata: { presetId: preset.id } }).catch(() => {});
      await interaction.reply({ embeds: [createSuccessEmbed('Lockdown Preset Saved', `Preset **${preset.name}** was saved. Add controlled channels with \`/lockdown channel-add\`.`)], ephemeral: true });
      return;
    }

    if (sub === 'preset-list') {
      const presets = await lockdown.listPresets(interaction.guildId);
      const description = presets.length ? presets.map((preset) => `• **${preset.name}** — ${preset.channel_count || 0} channel(s)${preset.updates_channel_id ? ` · updates <#${preset.updates_channel_id}>` : ''}`).join('\n') : 'No presets configured yet.';
      await interaction.reply({ embeds: [createBaseEmbed({ title: 'Lockdown Presets', description, color: SlickBotColors.INFO, footer: 'SlickBot Lockdown' })], ephemeral: true });
      return;
    }

    if (sub === 'preset-delete') {
      const result = await lockdown.deletePreset(interaction.guildId, interaction.options.getString('preset', true));
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Preset Not Deleted', result.reason)] });
      await interaction.reply({ embeds: [createSuccessEmbed('Lockdown Preset Deleted', `Preset **${result.preset.name}** was disabled.`)], ephemeral: true });
      return;
    }

    if (sub === 'channel-add') {
      const channel = interaction.options.getChannel('channel', true);
      const result = await lockdown.addChannel({
        guild: interaction.guild,
        presetName: interaction.options.getString('preset') || DEFAULT_PRESET,
        channel,
        denyView: interaction.options.getBoolean('hide_channel') ?? false,
        denySend: interaction.options.getBoolean('disable_messages') ?? undefined,
        denyConnect: interaction.options.getBoolean('disable_connect') ?? undefined
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'lockdown-config', title: 'Lockdown Channel Added', body: `Preset: **${result.preset.name}**\nChannel: <#${channel.id}>`, actorUserId: interaction.user.id, metadata: { presetId: result.preset.id, channelId: channel.id } }).catch(() => {});
      await interaction.reply({ embeds: [createSuccessEmbed('Lockdown Channel Saved', [`Preset: **${result.preset.name}**`, `Channel: <#${channel.id}>`, `Hide Channel: **${formatBool(result.entry.deny_view)}**`, `Disable Messages: **${formatBool(result.entry.deny_send)}**`, `Disable Connect: **${formatBool(result.entry.deny_connect)}**`].join('\n'))], ephemeral: true });
      return;
    }

    if (sub === 'channel-remove') {
      const channel = interaction.options.getChannel('channel', true);
      const result = await lockdown.removeChannel({ guildId: interaction.guildId, presetName: interaction.options.getString('preset') || DEFAULT_PRESET, channelId: channel.id });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Channel Not Removed', result.reason)] });
      await interaction.reply({ embeds: [createSuccessEmbed('Lockdown Channel Removed', `<#${channel.id}> was removed from **${result.preset.name}**.`)], ephemeral: true });
      return;
    }

    if (sub === 'channel-list') {
      const result = await lockdown.listPresetChannels(interaction.guildId, interaction.options.getString('preset') || DEFAULT_PRESET);
      const lines = result.channels.length ? result.channels.map((entry) => `• <#${entry.channel_id}> — hide **${formatBool(entry.deny_view)}**, messages **${formatBool(entry.deny_send)}**, connect **${formatBool(entry.deny_connect)}**`).join('\n') : 'No channels configured for this preset.';
      await interaction.reply({ embeds: [createBaseEmbed({ title: `Lockdown Channels • ${result.preset.name}`, description: truncate(lines, 3800), color: SlickBotColors.INFO, footer: 'SlickBot Lockdown' })], ephemeral: true });
      return;
    }

    if (sub === 'start') {
      await interaction.deferReply({ ephemeral: true });
      const result = await lockdown.startLockdown({
        guild: interaction.guild,
        presetName: interaction.options.getString('preset', true),
        actorUser: interaction.user,
        reason: interaction.options.getString('reason') || 'No reason provided.',
        logger: ctx.logger
      });
      if (!result.ok) return interaction.editReply({ embeds: [createWarningEmbed('Lockdown Not Started', result.reason)] });
      await interaction.editReply({ embeds: [lockdown.buildStartSummary(result)] });
      return;
    }

    if (sub === 'end') {
      await interaction.deferReply({ ephemeral: true });
      const result = await lockdown.endLockdown({
        guild: interaction.guild,
        actorUser: interaction.user,
        reason: interaction.options.getString('reason') || 'No reason provided.',
        logger: ctx.logger
      });
      if (!result.ok) return interaction.editReply({ embeds: [createWarningEmbed('Lockdown Not Ended', result.reason)] });
      await interaction.editReply({ embeds: [lockdown.buildEndSummary(result)] });
      return;
    }

    if (sub === 'reset') {
      const confirmation = await lockdown.buildResetConfirmation(interaction.guildId, interaction.user.id);
      if (!confirmation.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Lockdown Reset Blocked', confirmation.reason)] });
      await interaction.reply({ ...confirmation.payload, ephemeral: true });
      return;
    }
  }
};
