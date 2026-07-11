const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed } = require('../modules/ui/uiService');
const { ServerStatsService } = require('../modules/community/serverStatsService');

const stats = new ServerStatsService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Configure and refresh live server statistic channels.')
    .addSubcommand((subcommand) => subcommand.setName('manager').setDescription('Open the server stats manager.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure live server statistic channels.')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable server stat updates.').setRequired(false))
        .addChannelOption((option) => option.setName('member_channel').setDescription('Channel to rename with total member count.').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addChannelOption((option) => option.setName('human_channel').setDescription('Channel to rename with human member count.').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addChannelOption((option) => option.setName('bot_channel').setDescription('Channel to rename with bot count.').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addChannelOption((option) => option.setName('voice_channel').setDescription('Channel to rename with current voice count.').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false))
        .addStringOption((option) => option.setName('member_template').setDescription('Example: Members: {members}').setRequired(false).setMaxLength(80))
        .addStringOption((option) => option.setName('human_template').setDescription('Example: Humans: {humans}').setRequired(false).setMaxLength(80))
        .addStringOption((option) => option.setName('bot_template').setDescription('Example: Bots: {bots}').setRequired(false).setMaxLength(80))
        .addStringOption((option) => option.setName('voice_template').setDescription('Example: In Voice: {voice}').setRequired(false).setMaxLength(80))
    )
    .addSubcommand((subcommand) => subcommand.setName('refresh').setDescription('Refresh configured server statistic channels now.')),
  moduleKey: ModuleKeys.SERVER_STATS,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') return ActionKeys.ServerStatsConfigure;
    if (sub === 'refresh') return ActionKeys.ServerStatsRefresh;
    return ActionKeys.ServerStatsView;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    if (sub === 'manager') {
      return replyPrivate(interaction, await stats.buildManagerPanel(interaction.guild));
    }

    if (sub === 'setup') {
      const config = await stats.setup(interaction.guildId, {
        enabled: interaction.options.getBoolean('enabled') ?? true,
        memberChannelId: interaction.options.getChannel('member_channel')?.id || null,
        humanChannelId: interaction.options.getChannel('human_channel')?.id || null,
        botChannelId: interaction.options.getChannel('bot_channel')?.id || null,
        voiceChannelId: interaction.options.getChannel('voice_channel')?.id || null,
        memberTemplate: interaction.options.getString('member_template') || null,
        humanTemplate: interaction.options.getString('human_template') || null,
        botTemplate: interaction.options.getString('bot_template') || null,
        voiceTemplate: interaction.options.getString('voice_template') || null
      });
      await ctx.logger.log({ guildId: interaction.guildId, eventKey: 'server-stats-config', title: 'Server Stats Configured', body: `Updated By: <@${interaction.user.id}>`, actorUserId: interaction.user.id }).catch(() => {});
      const result = await stats.updateStats(interaction.guild, ctx.logger, 'configuration').catch(() => null);
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Server Stats Configured', `Server stats are **${config.enabled ? 'enabled' : 'disabled'}**.${result?.ok ? ` Updated **${result.updated}** channel(s).${result.reason ? ` ${result.reason}` : ''}` : ''}`)] });
    }

    if (sub === 'refresh') {
      const result = await stats.updateStats(interaction.guild, ctx.logger, 'manual refresh');
      if (!result.ok) return replyPrivate(interaction, { embeds: [createWarningEmbed('Stats Not Updated', result.reason)] });
      return replyPrivate(interaction, { embeds: [createSuccessEmbed('Server Stats Refreshed', `Updated **${result.updated}** configured counter channel(s).`)] });
    }
  }
};
