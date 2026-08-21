const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { buildEmbedComposerModal } = require('../modules/utility/utilityUi');
const { createWarningEmbed, createSuccessEmbed } = require('../modules/ui/uiService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create, preview, and publish custom formatted embeds.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Open the visual embed composer.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the embed to (defaults to current channel).')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option.setName('role_ping').setDescription('Optional role to ping with the embed.').setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edit an existing embed previously sent by SlickBot.')
        .addStringOption((option) =>
          option.setName('message_id').setDescription('The message ID of the SlickBot embed to edit.').setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where the embed is posted (defaults to current channel).')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    ),
  actionKey: ActionKeys.UtilityEmbedCreate,
  moduleKey: ModuleKeys.UTILITY,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'edit') return ActionKeys.UtilityEmbedEdit;
    return ActionKeys.UtilityEmbedCreate;
  },
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await ctx.permissions.ensureGuildConfig(interaction.guildId, interaction.guild?.name || null);

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel', false) || interaction.channel;
      const rolePing = interaction.options.getRole('role_ping', false);

      const modal = buildEmbedComposerModal({
        channelId: `${channel.id}${rolePing ? `:${rolePing.id}` : ''}`
      });

      await interaction.showModal(modal);
      return;
    }

    if (sub === 'edit') {
      const messageId = interaction.options.getString('message_id', true);
      const channel = interaction.options.getChannel('channel', false) || interaction.channel;

      const targetMsg = await channel.messages.fetch(messageId).catch(() => null);
      if (!targetMsg) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Message Not Found', `Could not find message \`${messageId}\` in <#${channel.id}>.`)]
        });
      }

      if (targetMsg.author.id !== ctx.client.user.id) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('Cannot Edit', 'SlickBot can only edit messages sent by itself.')]
        });
      }

      const existingEmbed = targetMsg.embeds[0];
      if (!existingEmbed) {
        return replyPrivate(interaction, {
          embeds: [createWarningEmbed('No Embed Found', 'The target message does not contain an embed.')]
        });
      }

      const modal = buildEmbedComposerModal({
        channelId: `${channel.id}:${messageId}`,
        title: existingEmbed.title || '',
        description: existingEmbed.description || '',
        color: existingEmbed.hexColor || '#7869ff',
        imageUrl: existingEmbed.image?.url || '',
        thumbnailUrl: existingEmbed.thumbnail?.url || ''
      });

      await interaction.showModal(modal);
      return;
    }
  }
};
