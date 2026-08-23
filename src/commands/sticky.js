const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');
const {
  StickyMessageService,
  COLOR_PRESETS,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_THRESHOLD_MESSAGES
} = require('../modules/automation/stickyMessageService');

const stickyService = new StickyMessageService();

const colorChoiceList = Object.keys(COLOR_PRESETS).map((key) => ({
  name: key.charAt(0) + key.slice(1).toLowerCase(),
  value: key
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Manage persistent, auto-reposting sticky messages in server channels.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Create or update a sticky message for a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to pin the sticky message in.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('Embed description / rules text').setMaxLength(4000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('title').setDescription('Embed title (e.g. 📌 Channel Guidelines)').setMaxLength(256).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('message').setDescription('Plain text above the embed (supports @mentions)').setMaxLength(2000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('color').setDescription('Embed accent color').addChoices(...colorChoiceList).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('footer').setDescription('Custom embed footer text').setMaxLength(2048).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('image_url').setDescription('Embed main image URL (https://...)').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('thumbnail_url').setDescription('Embed thumbnail URL (https://...)').setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('cooldown').setDescription('Cooldown throttle in seconds (5-300, default: 10)').setMinValue(5).setMaxValue(300).setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('threshold').setDescription('Repost after N chat messages (1-100, default: 5)').setMinValue(1).setMaxValue(100).setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit an existing sticky message.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel with the sticky message.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option.setName('description').setDescription('New embed description').setMaxLength(4000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('title').setDescription('New embed title').setMaxLength(256).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('message').setDescription('New plain text message content').setMaxLength(2000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('color').setDescription('New embed accent color').addChoices(...colorChoiceList).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('footer').setDescription('New embed footer text').setMaxLength(2048).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('image_url').setDescription('New image URL').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('thumbnail_url').setDescription('New thumbnail URL').setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('cooldown').setDescription('New cooldown in seconds (5-300)').setMinValue(5).setMaxValue(300).setRequired(false)
        )
        .addIntegerOption((option) =>
          option.setName('threshold').setDescription('New chat message threshold (1-100)').setMinValue(1).setMaxValue(100).setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable or pause auto-reposting in this channel').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove and unpin a sticky message from a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to remove the sticky message from.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all configured sticky messages in this server.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('repost')
        .setDescription('Force an immediate repost of a sticky message at the bottom of a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Target channel (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Pause or resume auto-reposting for a channel sticky message.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to toggle sticky on or off.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('manager')
        .setDescription('Open the interactive Sticky Messages Manager dashboard.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset and clear all sticky messages for this server.')
    ),

  moduleKey: ModuleKeys.STICKY_MESSAGES,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return ActionKeys.StickyView;
    if (sub === 'repost') return ActionKeys.StickyRepost;
    if (sub === 'reset') return ActionKeys.StickyReset;
    return ActionKeys.StickyManage;
  },

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'manager') {
      return replyPrivate(interaction, await stickyService.buildManagerPanel(interaction.guildId));
    }

    if (sub === 'list') {
      const stickies = await stickyService.listStickies(interaction.guildId);
      if (!stickies.length) {
        return replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'Sticky Messages',
            description: 'No sticky messages are currently configured in this server. Use `/sticky set` to create one!',
            color: SlickBotColors.INFO
          })]
        });
      }

      const lines = stickies.map((s, idx) => {
        const statusBadge = s.enabled ? '🟢 Active' : '⏸️ Paused';
        const titlePart = s.embed_title ? ` · "${s.embed_title.slice(0, 40)}"` : '';
        return `**${idx + 1}.** <#${s.channel_id}> (${statusBadge})${titlePart}\n   ↳ Cooldown: **${s.cooldown_seconds}s** · Threshold: **${s.message_count_threshold} msgs**`;
      });

      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: `Configured Sticky Messages (${stickies.length})`,
          description: [
            ...lines,
            '',
            '*Manage stickies with `/sticky set`, `/sticky edit`, `/sticky toggle`, or `/sticky manager`.*'
          ].join('\n'),
          color: SlickBotColors.PRIMARY
        })]
      });
    }

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const title = interaction.options.getString('title', false);
      const desc = interaction.options.getString('description', false);
      const message = interaction.options.getString('message', false);
      const color = interaction.options.getString('color', false) || 'PRIMARY';
      const footer = interaction.options.getString('footer', false);
      const imageUrl = interaction.options.getString('image_url', false);
      const thumbnailUrl = interaction.options.getString('thumbnail_url', false);
      const cooldown = interaction.options.getInteger('cooldown', false) || DEFAULT_COOLDOWN_SECONDS;
      const threshold = interaction.options.getInteger('threshold', false) || DEFAULT_THRESHOLD_MESSAGES;

      const result = await stickyService.setSticky({
        guildId: interaction.guildId,
        channelId: channel.id,
        messageContent: message,
        embedTitle: title,
        embedDescription: desc,
        embedColor: color,
        embedFooter: footer,
        embedImageUrl: imageUrl,
        embedThumbnailUrl: thumbnailUrl,
        cooldownSeconds: cooldown,
        messageCountThreshold: threshold,
        createdByUserId: interaction.user.id,
        client: ctx.client
      });

      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Sticky Notice Failed', result.reason || 'Could not configure sticky message.')] });
      }

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'sticky-create',
        title: 'Sticky Message Configured',
        body: `Configured sticky message in <#${channel.id}> by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id,
        metadata: { channelId: channel.id, sticky: result.sticky }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Sticky Message Active',
          `Successfully configured and posted the sticky notice in <#${channel.id}>!\n\n` +
          `• **Throttle:** Every **${result.sticky.message_count_threshold}** chat messages (Min **${result.sticky.cooldown_seconds}s** cooldown)\n` +
          `• **Status:** 🟢 Active & auto-reposting`
        )]
      });
    }

    if (sub === 'edit') {
      const channel = interaction.options.getChannel('channel', true);
      const title = interaction.options.getString('title', false);
      const desc = interaction.options.getString('description', false);
      const message = interaction.options.getString('message', false);
      const color = interaction.options.getString('color', false);
      const footer = interaction.options.getString('footer', false);
      const imageUrl = interaction.options.getString('image_url', false);
      const thumbnailUrl = interaction.options.getString('thumbnail_url', false);
      const cooldown = interaction.options.getInteger('cooldown', false);
      const threshold = interaction.options.getInteger('threshold', false);
      const enabled = interaction.options.getBoolean('enabled', false);

      const updated = await stickyService.editSticky(
        interaction.guildId,
        channel.id,
        {
          embedTitle: title !== null ? title : undefined,
          embedDescription: desc !== null ? desc : undefined,
          messageContent: message !== null ? message : undefined,
          embedColor: color !== null ? color : undefined,
          embedFooter: footer !== null ? footer : undefined,
          embedImageUrl: imageUrl !== null ? imageUrl : undefined,
          embedThumbnailUrl: thumbnailUrl !== null ? thumbnailUrl : undefined,
          cooldownSeconds: cooldown !== null ? cooldown : undefined,
          messageCountThreshold: threshold !== null ? threshold : undefined,
          enabled: enabled !== null ? enabled : undefined
        },
        ctx.client
      );

      if (!updated) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Sticky Not Found', `No sticky message is configured in <#${channel.id}>. Use \`/sticky set\` to create one.`)] });
      }

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'sticky-update',
        title: 'Sticky Message Updated',
        body: `Updated sticky message in <#${channel.id}> by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id,
        metadata: { channelId: channel.id, sticky: updated }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Sticky Message Updated', `Successfully updated the sticky notice for <#${channel.id}>.`)]
      });
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel', true);
      const removed = await stickyService.removeSticky(interaction.guildId, channel.id, ctx.client);

      if (!removed) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Sticky Not Found', `No sticky message was configured in <#${channel.id}>.`)] });
      }

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'sticky-remove',
        title: 'Sticky Message Removed',
        body: `Removed sticky message in <#${channel.id}> by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id,
        metadata: { channelId: channel.id }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Sticky Message Removed', `Unpinned and removed the sticky message from <#${channel.id}>.`)]
      });
    }

    if (sub === 'repost') {
      const channel = interaction.options.getChannel('channel', false) || interaction.channel;
      const reposted = await stickyService.repostSticky(interaction.guildId, channel.id, ctx.client, { force: true });

      if (!reposted) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Repost Failed', `No active sticky message is configured for <#${channel.id}>.`)] });
      }

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Sticky Reposted', `Successfully reposted the sticky notice at the bottom of <#${channel.id}>!`)]
      });
    }

    if (sub === 'toggle') {
      const channel = interaction.options.getChannel('channel', true);
      const toggled = await stickyService.toggleSticky(interaction.guildId, channel.id, ctx.client);

      if (!toggled) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Sticky Not Found', `No sticky message is configured in <#${channel.id}>.`)] });
      }

      const statusText = toggled.enabled ? '🟢 Resumed auto-reposting' : '⏸️ Paused (Message unpinned)';
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Sticky Status Toggled', `Sticky notice in <#${channel.id}> is now **${statusText}**.`)]
      });
    }

    if (sub === 'reset') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CustomIds.StickyResetConfirmPrefix}${interaction.user.id}`)
          .setLabel('Confirm Sticky Reset')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚠️'),
        new ButtonBuilder()
          .setCustomId(`${CustomIds.StickyResetCancelPrefix}${interaction.user.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return replyPrivate(interaction, {
        embeds: [createWarningEmbed(
          'Confirm Sticky Messages Reset',
          'Are you sure you want to remove **all** sticky messages across this server? This will unpin and delete all active sticky messages.'
        )],
        components: [row]
      });
    }
  }
};
