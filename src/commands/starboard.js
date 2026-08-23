const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { CustomIds } = require('../modules/ui/customIds');
const { replyPrivate, replyPublic } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { StarboardService, getStarTier } = require('../modules/community/starboardService');
const { buildStarboardPanel } = require('../modules/community/starboardUi');

const starboardService = new StarboardService();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure and view the Starboard community Hall of Fame.')
    .addSubcommand((sub) =>
      sub
        .setName('manager')
        .setDescription('Open the interactive Starboard manager panel.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Open the Starboard Control Center.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('View the current Starboard configuration and statistics.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure Starboard showcase channel and settings.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Showcase channel where starred messages are posted.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('threshold')
            .setDescription('Number of reaction stars required to pin a message (1 - 50).')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Reaction emoji to trigger starboard (e.g. ⭐, 🌟, ✨).')
            .setMaxLength(64)
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('allow_self_star')
            .setDescription('Whether authors can star their own messages.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('allow_nsfw')
            .setDescription('Whether messages from NSFW channels are allowed.')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-channel')
        .setDescription('Set the Starboard showcase channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Showcase channel for starred messages.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-threshold')
        .setDescription('Set the star count threshold.')
        .addIntegerOption((option) =>
          option
            .setName('count')
            .setDescription('Minimum stars required (1 - 50).')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-emoji')
        .setDescription('Set the Starboard trigger emoji.')
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Emoji to monitor for stars (e.g. ⭐, 🌟, ✨).')
            .setMaxLength(64)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('View the community Hall of Fame leaderboard.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset Starboard configuration and history.')
    ),

  moduleKey: ModuleKeys.STARBOARD,

  getActionKey(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'leaderboard') return ActionKeys.StarboardView;
    if (subcommand === 'reset') return ActionKeys.StarboardReset;
    return ActionKeys.StarboardManage;
  },

  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (subcommand === 'manager' || subcommand === 'panel') {
      const panel = await buildStarboardPanel(guildId, 'OVERVIEW');
      await replyPrivate(interaction, panel);
      return;
    }

    if (subcommand === 'status') {
      const panel = await buildStarboardPanel(guildId, 'OVERVIEW');
      await replyPrivate(interaction, panel);
      return;
    }

    if (subcommand === 'leaderboard') {
      const panel = await buildStarboardPanel(guildId, 'LEADERBOARD');
      await replyPublic(interaction, panel);
      return;
    }

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const threshold = interaction.options.getInteger('threshold');
      const emoji = interaction.options.getString('emoji');
      const allowSelfStar = interaction.options.getBoolean('allow_self_star');
      const allowNsfw = interaction.options.getBoolean('allow_nsfw');

      const updates = { channel_id: channel.id, enabled: true };
      if (threshold !== null) updates.star_threshold = threshold;
      if (emoji) updates.star_emoji = emoji.trim();
      if (allowSelfStar !== null) updates.allow_self_star = allowSelfStar;
      if (allowNsfw !== null) updates.allow_nsfw = allowNsfw;

      const updated = await starboardService.upsertConfig(guildId, updates);
      await ctx.logger?.log?.({
        guildId,
        eventKey: 'starboard-setup',
        title: 'Starboard Configured',
        body: `Starboard configured to showcase in <#${channel.id}> with **${updated.star_threshold}** stars by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      }).catch(() => {});

      await replyPrivate(interaction, {
        embeds: [
          createSuccessEmbed(
            'Starboard Configured',
            `Showcase channel set to <#${channel.id}>.\nThreshold: **${updated.star_threshold}** ${updated.star_emoji}\nSelf-Stars: **${updated.allow_self_star ? 'Enabled' : 'Disabled'}**\nNSFW: **${updated.allow_nsfw ? 'Enabled' : 'Disabled'}**`
          )
        ]
      });
      return;
    }

    if (subcommand === 'set-channel') {
      const channel = interaction.options.getChannel('channel', true);
      await starboardService.upsertConfig(guildId, { channel_id: channel.id, enabled: true });
      await ctx.logger?.log?.({
        guildId,
        eventKey: 'starboard-channel-updated',
        title: 'Starboard Channel Updated',
        body: `Starboard showcase channel set to <#${channel.id}> by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      }).catch(() => {});

      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Starboard Channel Updated', `Starboard showcase channel set to <#${channel.id}>.`)]
      });
      return;
    }

    if (subcommand === 'set-threshold') {
      const count = interaction.options.getInteger('count', true);
      const updated = await starboardService.upsertConfig(guildId, { star_threshold: count });
      await ctx.logger?.log?.({
        guildId,
        eventKey: 'starboard-threshold-updated',
        title: 'Starboard Threshold Updated',
        body: `Starboard threshold updated to **${count}** stars by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      }).catch(() => {});

      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Starboard Threshold Updated', `Starboard star threshold set to **${count}** ${updated.star_emoji}.`)]
      });
      return;
    }

    if (subcommand === 'set-emoji') {
      const emoji = interaction.options.getString('emoji', true).trim();
      await starboardService.upsertConfig(guildId, { star_emoji: emoji });
      await ctx.logger?.log?.({
        guildId,
        eventKey: 'starboard-emoji-updated',
        title: 'Starboard Emoji Updated',
        body: `Starboard reaction emoji set to ${emoji} by ${interaction.user.tag}.`,
        actorUserId: interaction.user.id
      }).catch(() => {});

      await replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Starboard Emoji Updated', `Starboard reaction emoji set to ${emoji}.`)]
      });
      return;
    }

    if (subcommand === 'reset') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CustomIds.StarboardResetConfirmPrefix}${guildId}`)
          .setLabel('Confirm Reset')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${CustomIds.StarboardResetCancelPrefix}${guildId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await replyPrivate(interaction, {
        embeds: [
          createWarningEmbed(
            'Reset Starboard Configuration',
            'Are you sure you want to reset the Starboard module? This will clear all starboard settings and showcase entries for this server.'
          )
        ],
        components: [row]
      });
      return;
    }
  }
};
