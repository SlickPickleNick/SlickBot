const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { JoinCreateService } = require('../modules/voice/joinCreateService');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createErrorEmbed } = require('../modules/ui/uiService');

const service = new JoinCreateService();

async function logVcAction(ctx, interaction, title, body, metadata = {}) {
  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey: 'join-create-control',
    title,
    body: [body, `Actor: <@${interaction.user.id}>`].filter(Boolean).join('\n'),
    actorUserId: interaction.user.id,
    metadata
  }).catch(() => {});
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vc')
    .setDescription('Quick controls and settings for your temporary voice channel.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Open your interactive temporary voice control panel.'))
    .addSubcommand((subcommand) => subcommand.setName('controls').setDescription('Open your interactive temporary voice control panel.'))
    .addSubcommand((subcommand) => subcommand.setName('lock').setDescription('Lock your temporary voice channel.'))
    .addSubcommand((subcommand) => subcommand.setName('unlock').setDescription('Unlock your temporary voice channel.'))
    .addSubcommand((subcommand) => subcommand.setName('hide').setDescription('Hide your temporary voice channel from everyone.'))
    .addSubcommand((subcommand) => subcommand.setName('unhide').setDescription('Unhide your temporary voice channel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('rename')
        .setDescription('Rename your temporary voice channel.')
        .addStringOption((option) => option.setName('name').setDescription('New channel name.').setRequired(true).setMaxLength(80))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('limit')
        .setDescription('Set the user limit for your temporary voice channel.')
        .addIntegerOption((option) => option.setName('limit').setDescription('User limit (0 for no limit).').setRequired(true).setMinValue(0).setMaxValue(99))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bitrate')
        .setDescription('Set the audio bitrate for your temporary voice channel.')
        .addIntegerOption((option) => option.setName('kbps').setDescription('Bitrate in kbps (e.g. 64, 96, 128, 256, 384).').setRequired(true).setMinValue(8).setMaxValue(384))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('permit')
        .setDescription('Permit a user to view and join your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('User to permit.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('kick')
        .setDescription('Disconnect a user from your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('User to kick.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ban')
        .setDescription('Block and disconnect a user from your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('User to block/ban.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unban')
        .setDescription('Unblock a user from your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('User to unblock.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('User to remove.').setRequired(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('transfer')
        .setDescription('Transfer ownership of your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('New owner.').setRequired(true))
    )
    .addSubcommand((subcommand) => subcommand.setName('claim').setDescription('Claim an ownerless temporary voice channel you are currently in.')),
  moduleKey: ModuleKeys.JOIN_TO_CREATE,
  getActionKey() {
    return ActionKeys.TempVoiceManage;
  },
  isPublic() {
    return true;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (sub === 'panel' || sub === 'controls') {
        const panelPayload = await service.buildOwnerPanel(member);
        return replyPrivate(interaction, panelPayload);
      }

      if (sub === 'rename') {
        const result = await service.renameTemp(member, interaction.options.getString('name', true));
        await logVcAction(ctx, interaction, 'Temporary Voice Renamed', `Channel: <#${result.channel.id}>\nName: **${result.channel.name}**`, { channelId: result.channel.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Renamed', `✏️ Updated <#${result.channel.id}> to **${result.channel.name}**.`)] });
      }

      if (sub === 'limit') {
        const result = await service.setLimit(member, interaction.options.getInteger('limit', true));
        await logVcAction(ctx, interaction, 'Temporary Voice Limit Updated', `Channel: <#${result.channel.id}>\nLimit: **${result.temp.user_limit || 0}**`, { channelId: result.channel.id, userLimit: result.temp.user_limit || 0 });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Limit Updated', `👥 <#${result.channel.id}> now has a user limit of **${result.temp.user_limit || 0}**.`)] });
      }

      if (sub === 'bitrate') {
        const result = await service.setBitrate(member, interaction.options.getInteger('kbps', true));
        await logVcAction(ctx, interaction, 'Temporary Voice Bitrate Updated', `Channel: <#${result.channel.id}>\nBitrate: **${result.kbps} kbps**`, { channelId: result.channel.id, kbps: result.kbps });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Bitrate Updated', `🎚️ <#${result.channel.id}> bitrate set to **${result.kbps} kbps**.`)] });
      }

      if (sub === 'lock' || sub === 'unlock') {
        const locked = sub === 'lock';
        const result = await service.setLocked(member, locked);
        await logVcAction(ctx, interaction, `Temporary Voice ${locked ? 'Locked' : 'Unlocked'}`, `Channel: <#${result.channel.id}>`, { channelId: result.channel.id, locked });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Temporary Voice ${locked ? 'Locked' : 'Unlocked'}`, `<#${result.channel.id}> is now **${locked ? 'locked' : 'unlocked'}**.`)] });
      }

      if (sub === 'hide' || sub === 'unhide') {
        const hidden = sub === 'hide';
        const result = await service.setHidden(member, hidden);
        await logVcAction(ctx, interaction, `Temporary Voice ${hidden ? 'Hidden' : 'Unhidden'}`, `Channel: <#${result.channel.id}>`, { channelId: result.channel.id, hidden });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Temporary Voice ${hidden ? 'Hidden' : 'Visible'}`, `<#${result.channel.id}> is now **${hidden ? 'hidden from everyone' : 'visible to everyone'}**.`)] });
      }

      if (sub === 'permit') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.permitUser(member, target);
        await logVcAction(ctx, interaction, 'Temporary Voice User Permitted', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Permitted', `✅ <@${target.id}> can now view and join <#${result.channel.id}>.`)] });
      }

      if (sub === 'kick') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.kickUser(member, target);
        await logVcAction(ctx, interaction, 'Temporary Voice User Kicked', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Kicked', `🚪 <@${target.id}> was kicked from <#${result.channel.id}>.`)] });
      }

      if (sub === 'ban') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.banUser(member, target);
        await logVcAction(ctx, interaction, 'Temporary Voice User Blocked/Banned', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Blocked', `⛔ <@${target.id}> was blocked and banned from <#${result.channel.id}>.`)] });
      }

      if (sub === 'unban') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.unbanUser(member, target);
        await logVcAction(ctx, interaction, 'Temporary Voice User Unbanned', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Unbanned', `🔓 <@${target.id}> was unbanned from <#${result.channel.id}>.`)] });
      }

      if (sub === 'remove') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.removeUser(member, target);
        await logVcAction(ctx, interaction, 'Temporary Voice User Removed', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Removed', `<@${target.id}> was removed from <#${result.channel.id}>.`)] });
      }

      if (sub === 'transfer') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.transfer(member, target);
        await logVcAction(ctx, interaction, 'Temporary Voice Ownership Transferred', `Channel: <#${result.channel.id}>\nNew Owner: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Ownership Transferred', `👑 <#${result.channel.id}> is now owned by <@${target.id}>.`)] });
      }

      if (sub === 'claim') {
        const result = await service.claim(member);
        await logVcAction(ctx, interaction, 'Temporary Voice Claimed', `Channel: <#${result.channel.id}>`, { channelId: result.channel.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Claimed', `👑 You now own <#${result.channel.id}>.`)] });
      }
    } catch (error) {
      return replyPrivate(interaction, { embeds: [createErrorEmbed('Voice Action Error', error instanceof Error ? error.message : String(error))] });
    }
  }
};
