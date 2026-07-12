const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { JoinCreateService } = require('../modules/voice/joinCreateService');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed, createInfoEmbed } = require('../modules/ui/uiService');

const service = new JoinCreateService();

function hubSummary(hub) {
  return [
    `Hub: **${hub.hub_name || 'Join to Create'}**`,
    `Source: <#${hub.source_channel_id}>`,
    `Status: **${hub.enabled ? 'Enabled' : 'Disabled'}**`,
    `Category: ${hub.category_id ? `<#${hub.category_id}>` : 'Source channel category'}`,
    `Name Template: \`${hub.name_template || "{username}'s Voice"}\``,
    `Default Limit: **${hub.user_limit || 0}**`,
    `Private: **${hub.private_enabled ? 'Enabled' : 'Disabled'}**`,
    `Empty Cleanup: **${hub.delete_when_empty ? `${hub.empty_delete_delay_seconds || 30}s` : 'Disabled'}**`
  ].join('\n');
}

async function logJoinCreate(ctx, interaction, title, body, metadata = {}, eventKey = 'join-create-config') {
  await ctx.logger.log({
    guildId: interaction.guildId,
    eventKey,
    title,
    body: [body, `Updated By: <@${interaction.user.id}>`].filter(Boolean).join('\n'),
    actorUserId: interaction.user.id,
    metadata
  }).catch(() => {});
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join-create')
    .setDescription('Configure and manage join-to-create voice channels.')
    .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('View the join-to-create manager.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Register or update an existing voice channel as a join-to-create hub.')
        .addChannelOption((option) => option.setName('source_channel').setDescription('Voice channel users join to create their room.').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .addChannelOption((option) => option.setName('category').setDescription('Category where temporary voice channels should be created.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addStringOption((option) => option.setName('name_template').setDescription("Temporary channel name. Supports {username}, {user}, {tag}, and {hub}.").setRequired(false).setMaxLength(80))
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable this hub.').setRequired(false))
        .addIntegerOption((option) => option.setName('user_limit').setDescription('Default user limit. Use 0 for no limit.').setRequired(false).setMinValue(0).setMaxValue(99))
        .addBooleanOption((option) => option.setName('private').setDescription('Create rooms as private by default.').setRequired(false))
        .addIntegerOption((option) => option.setName('delete_delay').setDescription('Seconds before empty rooms are deleted.').setRequired(false).setMinValue(5).setMaxValue(3600))
        .addRoleOption((option) => option.setName('staff_role').setDescription('Optional staff role that can access/manage private rooms.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create-hub')
        .setDescription('Create a new voice channel and register it as a join-to-create hub.')
        .addStringOption((option) => option.setName('name').setDescription('Name for the join-to-create hub voice channel.').setRequired(true).setMaxLength(80))
        .addChannelOption((option) => option.setName('category').setDescription('Category for the hub and temporary rooms.').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addStringOption((option) => option.setName('name_template').setDescription("Temporary channel name. Supports {username}, {user}, {tag}, and {hub}.").setRequired(false).setMaxLength(80))
        .addIntegerOption((option) => option.setName('user_limit').setDescription('Default user limit. Use 0 for no limit.').setRequired(false).setMinValue(0).setMaxValue(99))
        .addBooleanOption((option) => option.setName('private').setDescription('Create rooms as private by default.').setRequired(false))
        .addIntegerOption((option) => option.setName('delete_delay').setDescription('Seconds before empty rooms are deleted.').setRequired(false).setMinValue(5).setMaxValue(3600))
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List configured join-to-create hubs.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('View a join-to-create hub.')
        .addStringOption((option) => option.setName('hub').setDescription('Hub to view.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Enable a join-to-create hub.')
        .addStringOption((option) => option.setName('hub').setDescription('Hub to enable.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable a join-to-create hub.')
        .addStringOption((option) => option.setName('hub').setDescription('Hub to disable.').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a join-to-create hub configuration.')
        .addStringOption((option) => option.setName('hub').setDescription('Hub to delete.').setRequired(true).setAutocomplete(true))
        .addBooleanOption((option) => option.setName('delete_active').setDescription('Also delete active temporary channels from this hub.').setRequired(false))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('cleanup')
        .setDescription('Clean up tracked temporary voice channels.')
        .addBooleanOption((option) => option.setName('include_occupied').setDescription('Also delete occupied temporary channels. Use carefully.').setRequired(false))
    )
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
        .addIntegerOption((option) => option.setName('limit').setDescription('User limit. Use 0 for no limit.').setRequired(true).setMinValue(0).setMaxValue(99))
    )
    .addSubcommand((subcommand) => subcommand.setName('lock').setDescription('Lock your temporary voice channel.'))
    .addSubcommand((subcommand) => subcommand.setName('unlock').setDescription('Unlock your temporary voice channel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('permit')
        .setDescription('Permit a user to join your temporary voice channel.')
        .addUserOption((option) => option.setName('user').setDescription('User to permit.').setRequired(true))
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
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (['panel', 'list', 'view'].includes(sub)) return ActionKeys.JoinCreateView;
    if (['setup', 'create-hub'].includes(sub)) return ActionKeys.JoinCreateSetup;
    if (['enable', 'disable'].includes(sub)) return ActionKeys.JoinCreateEdit;
    if (sub === 'delete') return ActionKeys.JoinCreateDelete;
    if (sub === 'cleanup') return ActionKeys.JoinCreateCleanup;
    return ActionKeys.TempVoiceManage;
  },
  isPublic(interaction) {
    return ['rename', 'limit', 'lock', 'unlock', 'permit', 'remove', 'transfer', 'claim'].includes(interaction.options.getSubcommand());
  },
  async autocomplete(interaction) {
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const hubs = await service.listHubs(interaction.guildId).catch(() => []);
    const choices = hubs
      .filter((hub) => !focused || String(hub.hub_name || '').toLowerCase().includes(focused) || String(hub.source_channel_id || '').includes(focused))
      .slice(0, 25)
      .map((hub) => ({ name: `${hub.hub_name || 'Join to Create'}${hub.enabled ? '' : ' (disabled)'}`, value: hub.id }));
    await interaction.respond(choices).catch(() => {});
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      if (sub === 'panel') return replyPrivate(interaction, await service.buildManagerPanel(interaction.guild));

      if (sub === 'setup') {
        const source = interaction.options.getChannel('source_channel', true);
        const category = interaction.options.getChannel('category');
        const hub = await service.setup(interaction.guild, {
          sourceChannelId: source.id,
          categoryId: category?.id || null,
          hubName: source.name,
          enabled: interaction.options.getBoolean('enabled') ?? true,
          nameTemplate: interaction.options.getString('name_template') || null,
          userLimit: interaction.options.getInteger('user_limit') ?? 0,
          privateEnabled: interaction.options.getBoolean('private') ?? false,
          emptyDeleteDelaySeconds: interaction.options.getInteger('delete_delay') ?? 30,
          staffRoleId: interaction.options.getRole('staff_role')?.id || null,
          actorUserId: interaction.user.id
        });
        await logJoinCreate(ctx, interaction, 'Join-to-Create Hub Configured', hubSummary(hub), { hubId: hub.id, sourceChannelId: hub.source_channel_id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Join-to-Create Hub Configured', hubSummary(hub))] });
      }

      if (sub === 'create-hub') {
        const category = interaction.options.getChannel('category');
        const hub = await service.createHubChannel(interaction.guild, interaction.user.id, {
          name: interaction.options.getString('name', true),
          categoryId: category?.id || null,
          nameTemplate: interaction.options.getString('name_template') || null,
          userLimit: interaction.options.getInteger('user_limit') ?? 0,
          privateEnabled: interaction.options.getBoolean('private') ?? false,
          emptyDeleteDelaySeconds: interaction.options.getInteger('delete_delay') ?? 30
        });
        await logJoinCreate(ctx, interaction, 'Join-to-Create Hub Created', hubSummary(hub), { hubId: hub.id, sourceChannelId: hub.source_channel_id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Join-to-Create Hub Created', hubSummary(hub))] });
      }

      if (sub === 'list') {
        const hubs = await service.listHubs(interaction.guildId);
        const lines = hubs.length
          ? hubs.map((hub) => `• **${hub.hub_name || 'Join to Create'}** — ${hub.enabled ? 'Enabled' : 'Disabled'} · <#${hub.source_channel_id}> · ${hub.active_count || 0} active`).join('\n')
          : 'No join-to-create hubs configured yet.';
        return replyPrivate(interaction, { embeds: [createInfoEmbed('Join-to-Create Hubs', lines)] });
      }

      if (sub === 'view') {
        const embed = await service.buildHubEmbed(interaction.guildId, interaction.options.getString('hub', true));
        return replyPrivate(interaction, { embeds: [embed] });
      }

      if (sub === 'enable' || sub === 'disable') {
        const enabled = sub === 'enable';
        const hub = await service.setHubEnabled(interaction.guildId, interaction.options.getString('hub', true), enabled, interaction.user.id);
        if (!hub) return replyPrivate(interaction, { embeds: [createWarningEmbed('Hub Not Found', 'That join-to-create hub does not exist.')] });
        await logJoinCreate(ctx, interaction, `Join-to-Create Hub ${enabled ? 'Enabled' : 'Disabled'}`, hubSummary(hub), { hubId: hub.id, enabled });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Join-to-Create Hub ${enabled ? 'Enabled' : 'Disabled'}`, hubSummary(hub))] });
      }

      if (sub === 'delete') {
        const result = await service.deleteHub(interaction.guild, interaction.options.getString('hub', true), {
          deleteActive: interaction.options.getBoolean('delete_active') ?? false,
          actorUserId: interaction.user.id,
          logger: ctx.logger
        });
        if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Hub Not Deleted', result.reason)] });
        await logJoinCreate(ctx, interaction, 'Join-to-Create Hub Deleted', `Deleted hub **${result.hub.hub_name || 'Join to Create'}**. Active channels deleted: **${result.deletedActive || 0}**`, { hubId: result.hub.id });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Join-to-Create Hub Deleted', `Deleted **${result.hub.hub_name || 'Join to Create'}**. Active channels deleted: **${result.deletedActive || 0}**.`)] });
      }

      if (sub === 'cleanup') {
        const result = await service.cleanup(interaction.guild, ctx.logger, { includeOccupied: interaction.options.getBoolean('include_occupied') ?? false });
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Join-to-Create Cleanup Complete', [`Deleted: **${result.deleted}**`, `Marked Missing: **${result.markedMissing}**`, `Skipped Occupied: **${result.skippedOccupied}**`, result.failures.length ? `Failures: ${result.failures.map((item) => `${item.channelId}: ${item.reason}`).join('; ')}` : null].filter(Boolean).join('\n'))] });
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (sub === 'rename') {
        const result = await service.renameTemp(member, interaction.options.getString('name', true));
        await logJoinCreate(ctx, interaction, 'Temporary Voice Renamed', `Channel: <#${result.channel.id}>\nName: **${result.channel.name}**`, { channelId: result.channel.id }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Renamed', `Updated <#${result.channel.id}> to **${result.channel.name}**.`)] });
      }

      if (sub === 'limit') {
        const result = await service.setLimit(member, interaction.options.getInteger('limit', true));
        await logJoinCreate(ctx, interaction, 'Temporary Voice Limit Updated', `Channel: <#${result.channel.id}>\nLimit: **${result.temp.user_limit || 0}**`, { channelId: result.channel.id, userLimit: result.temp.user_limit || 0 }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Limit Updated', `<#${result.channel.id}> now has a user limit of **${result.temp.user_limit || 0}**.`)] });
      }

      if (sub === 'lock' || sub === 'unlock') {
        const locked = sub === 'lock';
        const result = await service.setLocked(member, locked);
        await logJoinCreate(ctx, interaction, `Temporary Voice ${locked ? 'Locked' : 'Unlocked'}`, `Channel: <#${result.channel.id}>`, { channelId: result.channel.id, locked }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed(`Temporary Voice ${locked ? 'Locked' : 'Unlocked'}`, `<#${result.channel.id}> is now **${locked ? 'locked' : 'unlocked'}**.`)] });
      }

      if (sub === 'permit') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.permitUser(member, target);
        await logJoinCreate(ctx, interaction, 'Temporary Voice User Permitted', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Permitted', `<@${target.id}> can now join <#${result.channel.id}>.`)] });
      }

      if (sub === 'remove') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.removeUser(member, target);
        await logJoinCreate(ctx, interaction, 'Temporary Voice User Removed', `Channel: <#${result.channel.id}>\nUser: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('User Removed', `<@${target.id}> was removed or blocked from <#${result.channel.id}>.`)] });
      }

      if (sub === 'transfer') {
        const target = await interaction.guild.members.fetch(interaction.options.getUser('user', true).id);
        const result = await service.transfer(member, target);
        await logJoinCreate(ctx, interaction, 'Temporary Voice Ownership Transferred', `Channel: <#${result.channel.id}>\nNew Owner: <@${target.id}>`, { channelId: result.channel.id, targetUserId: target.id }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Ownership Transferred', `<#${result.channel.id}> is now owned by <@${target.id}>.`)] });
      }

      if (sub === 'claim') {
        const result = await service.claim(member);
        await logJoinCreate(ctx, interaction, 'Temporary Voice Claimed', `Channel: <#${result.channel.id}>`, { channelId: result.channel.id }, 'join-create-control');
        return replyPrivate(interaction, { embeds: [createSuccessEmbed('Temporary Voice Claimed', `You now own <#${result.channel.id}>.`)] });
      }
    } catch (error) {
      return replyPrivate(interaction, { embeds: [createErrorEmbed('Join-to-Create Error', error instanceof Error ? error.message : String(error))] });
    }
  }
};
