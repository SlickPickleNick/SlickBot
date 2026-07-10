const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { JoinToCreateService } = require('../modules/community/joinToCreateService');

const voiceRooms = new JoinToCreateService();
const publicSubcommands = new Set(['info', 'rename', 'limit', 'lock', 'unlock', 'permit', 'reject', 'transfer', 'claim']);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Join-to-create voice room tools.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the join-to-create manager panel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure automatic temporary voice rooms.')
        .addChannelOption((option) => option.setName('join_channel').setDescription('Voice channel members join to create a room.').addChannelTypes(ChannelType.GuildVoice).setRequired(false))
        .addChannelOption((option) => option.setName('category').setDescription('Category where temporary voice rooms are created.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable room creation.').setRequired(false))
        .addStringOption((option) => option.setName('name_template').setDescription("Room name. Variables: {displayname}, {username}.").setMaxLength(80).setRequired(false))
        .addIntegerOption((option) => option.setName('user_limit').setDescription('Default room limit. Use 0 for unlimited.').setMinValue(0).setMaxValue(99).setRequired(false))
        .addIntegerOption((option) => option.setName('bitrate_kbps').setDescription('Default bitrate in kbps, limited by the server.').setMinValue(8).setMaxValue(384).setRequired(false))
        .addBooleanOption((option) => option.setName('locked_by_default').setDescription('Create new rooms locked by default.').setRequired(false))
        .addBooleanOption((option) => option.setName('owner_controls').setDescription('Allow room owners to use member controls.').setRequired(false))
    )
    .addSubcommand((subcommand) => subcommand.setName('info').setDescription('Show information about your current temporary voice room.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('rename')
        .setDescription('Rename your temporary voice room.')
        .addStringOption((option) => option.setName('name').setDescription('New voice room name.').setRequired(true).setMaxLength(100))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('limit')
        .setDescription('Set the member limit for your temporary voice room.')
        .addIntegerOption((option) => option.setName('amount').setDescription('Maximum members. Use 0 for unlimited.').setRequired(true).setMinValue(0).setMaxValue(99))
    )
    .addSubcommand((subcommand) => subcommand.setName('lock').setDescription('Lock your temporary voice room.'))
    .addSubcommand((subcommand) => subcommand.setName('unlock').setDescription('Unlock your temporary voice room.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('permit')
        .setDescription('Allow a member to join your temporary voice room.')
        .addUserOption((option) => option.setName('user').setDescription('Member to permit.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reject')
        .setDescription('Remove and block a member from your temporary voice room.')
        .addUserOption((option) => option.setName('user').setDescription('Member to reject.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('transfer')
        .setDescription('Transfer your temporary voice room to another member inside it.')
        .addUserOption((option) => option.setName('user').setDescription('New room owner.').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('claim').setDescription('Claim the current temporary room when its owner is absent.'))
    .addSubcommand((subcommand) => subcommand.setName('cleanup').setDescription('Remove stale records and empty temporary voice rooms.')),
  moduleKey: ModuleKeys.JOIN_TO_CREATE,
  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') return ActionKeys.JoinToCreateConfigure;
    if (subcommand === 'manager') return ActionKeys.JoinToCreateView;
    if (subcommand === 'cleanup') return ActionKeys.JoinToCreateManage;
    return ActionKeys.JoinToCreateUse;
  },
  isPublic(interaction) {
    return publicSubcommands.has(interaction.options.getSubcommand());
  },
  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'manager') {
      return replyPrivate(interaction, await voiceRooms.buildManagerPanel(interaction.guild));
    }

    if (subcommand === 'setup') {
      const result = await voiceRooms.setup(interaction.guild, {
        triggerChannelId: interaction.options.getChannel('join_channel')?.id || null,
        categoryId: interaction.options.getChannel('category')?.id || null,
        enabled: interaction.options.getBoolean('enabled'),
        nameTemplate: interaction.options.getString('name_template') || null,
        userLimit: interaction.options.getInteger('user_limit'),
        bitrateKbps: interaction.options.getInteger('bitrate_kbps'),
        lockedByDefault: interaction.options.getBoolean('locked_by_default'),
        ownerControlsEnabled: interaction.options.getBoolean('owner_controls')
      });
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Join-to-Create Not Configured', result.reason)] });

      const config = result.config;
      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'join-to-create-config',
        title: 'Join-to-Create Configured',
        body: [
          `Updated By: <@${interaction.user.id}>`,
          `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
          `Join Channel: <#${config.trigger_channel_id}>`,
          `Room Category: ${config.category_id ? `<#${config.category_id}>` : 'Join channel category'}`,
          `Default Limit: **${config.user_limit || 'Unlimited'}**`,
          `Default Access: **${config.locked_by_default ? 'Locked' : 'Open'}**`
        ].join('\n'),
        actorUserId: interaction.user.id,
        metadata: { triggerChannelId: config.trigger_channel_id, categoryId: config.category_id, enabled: config.enabled }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Join-to-Create Configured',
          [
            `Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
            `Join Channel: <#${config.trigger_channel_id}>`,
            `Room Category: ${config.category_id ? `<#${config.category_id}>` : 'Uses the join channel category'}`,
            `Name Template: \`${config.name_template}\``,
            `Default Limit: **${config.user_limit || 'Unlimited'}**`,
            `Default Access: **${config.locked_by_default ? 'Locked' : 'Open'}**`,
            `Owner Controls: **${config.owner_controls_enabled ? 'Enabled' : 'Disabled'}**`
          ].join('\n')
        )]
      });
    }

    if (subcommand === 'info') {
      const result = await voiceRooms.buildRoomInfo(interaction);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Temporary Room Not Found', result.reason)] });
      return replyPrivate(interaction, result.payload);
    }

    if (subcommand === 'rename') {
      const result = await voiceRooms.renameRoom(interaction, interaction.options.getString('name', true), ctx.logger);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Room Not Renamed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Voice Room Renamed', `Your room is now named **${result.name}**.`)] });
    }

    if (subcommand === 'limit') {
      const result = await voiceRooms.setRoomLimit(interaction, interaction.options.getInteger('amount', true), ctx.logger);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Room Limit Not Changed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Voice Room Limit Updated', `Room limit: **${result.limit || 'Unlimited'}**.`)] });
    }

    if (subcommand === 'lock' || subcommand === 'unlock') {
      const locked = subcommand === 'lock';
      const result = await voiceRooms.setRoomLocked(interaction, locked, ctx.logger);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Room Access Not Changed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Voice Room ${locked ? 'Locked' : 'Unlocked'}`, locked ? 'New members cannot connect unless you permit them.' : 'The room now follows the category’s normal connection permissions.')] });
    }

    if (subcommand === 'permit' || subcommand === 'reject') {
      const allowed = subcommand === 'permit';
      const user = interaction.options.getUser('user', true);
      const result = await voiceRooms.setMemberAccess(interaction, user, allowed, ctx.logger);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Room Access Not Changed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Member ${allowed ? 'Permitted' : 'Rejected'}`, `<@${user.id}> ${allowed ? 'can now join' : 'can no longer join'} your temporary voice room.`)] });
    }

    if (subcommand === 'transfer') {
      const user = interaction.options.getUser('user', true);
      const result = await voiceRooms.transferOwnership(interaction, user, ctx.logger);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Ownership Not Transferred', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Voice Room Transferred', `<@${user.id}> now owns this temporary voice room.`)] });
    }

    if (subcommand === 'claim') {
      const result = await voiceRooms.claimOwnership(interaction, ctx.logger);
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Room Not Claimed', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Voice Room Claimed', 'You now own this temporary voice room.')] });
    }

    if (subcommand === 'cleanup') {
      const result = await voiceRooms.cleanupGuild(interaction.guild, ctx.logger);
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Join-to-Create Cleanup Complete',
          [`Records Scanned: **${result.scanned}**`, `Active Rooms: **${result.active}**`, `Empty Rooms Removed: **${result.deleted}**`, `Stale Records Removed: **${result.stale}**`].join('\n')
        )]
      });
    }
  }
};
