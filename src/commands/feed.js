const { SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ModuleKeys } = require('../modules/moduleRegistry');
const { ActionKeys } = require('../modules/permissions/actionKeys');
const { replyPrivate } = require('../utils/reply');
const { createSuccessEmbed, createWarningEmbed, createBaseEmbed, SlickBotColors } = require('../modules/ui/uiService');
const { CustomIds } = require('../modules/ui/customIds');
const {
  SocialFeedService,
  PLATFORM_KEYS,
  PLATFORM_META
} = require('../modules/automation/socialFeedService');

const feeds = new SocialFeedService();

const platformChoices = Object.values(PLATFORM_KEYS).map((k) => ({
  name: PLATFORM_META[k].label,
  value: k
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feed')
    .setDescription('Manage social feeds and announcements for Twitch and YouTube.')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure Social Feeds defaults.')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable or disable social feeds notifications.').setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('default_channel')
            .setDescription('Default channel for social feed announcements.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option.setName('default_ping_role').setDescription('Default role to ping on announcements.').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Follow a creator or channel on Twitch or YouTube.')
        .addStringOption((option) =>
          option
            .setName('platform')
            .setDescription('Social platform')
            .setRequired(true)
            .addChoices(...platformChoices)
        )
        .addStringOption((option) =>
          option
            .setName('account')
            .setDescription('Username, handle, or channel ID (e.g. ninja, @mrbeast)')
            .setRequired(true)
            .setMaxLength(150)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Dedicated Discord announcement channel (defaults to module default)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option.setName('ping_role').setDescription('Role to ping when new content is posted').setRequired(false)
        )
        .addUserOption((option) =>
          option.setName('member').setDescription('Link this feed to a server member (optional)').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('custom_message').setDescription('Custom announcement template (supports {author}, {member}, {url}, etc.)').setMaxLength(1000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('shorts_message').setDescription('Custom announcement text specifically for YouTube Shorts').setMaxLength(1000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('video_message').setDescription('Custom announcement text for longform videos').setMaxLength(1000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('live_message').setDescription('Custom announcement text when streamer goes LIVE').setMaxLength(1000).setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Unfollow and remove a tracked social feed.')
        .addStringOption((option) =>
          option
            .setName('feed')
            .setDescription('Select the feed to remove')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Update an existing social feed configuration.')
        .addStringOption((option) =>
          option
            .setName('feed')
            .setDescription('Select the feed to edit')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('New Discord announcement channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option.setName('ping_role').setDescription('New role to ping').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('clear_ping_role').setDescription('Clear the configured ping role').setRequired(false)
        )
        .addUserOption((option) =>
          option.setName('member').setDescription('Link this feed to a server member').setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('clear_member').setDescription('Remove linked server member').setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('custom_message').setDescription('New custom announcement template').setMaxLength(1000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('shorts_message').setDescription('New custom text for YouTube Shorts').setMaxLength(1000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('video_message').setDescription('New custom text for longform videos').setMaxLength(1000).setRequired(false)
        )
        .addStringOption((option) =>
          option.setName('live_message').setDescription('New custom text for LIVE streams').setMaxLength(1000).setRequired(false)
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable or disable this specific feed').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('subscribe')
        .setDescription('Subscribe to alerts for a specific creator feed.')
        .addStringOption((option) =>
          option
            .setName('feed')
            .setDescription('Select the feed to subscribe to')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('unsubscribe')
        .setDescription('Unsubscribe from alerts for a specific creator feed.')
        .addStringOption((option) =>
          option
            .setName('feed')
            .setDescription('Select the feed to unsubscribe from')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('my-alerts')
        .setDescription('View your active creator feed notification subscriptions.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('directory')
        .setDescription('Manage the Live Stream sticky directory hub.')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Post Directory', value: 'post' },
              { name: 'Refresh Directory', value: 'refresh' },
              { name: 'Remove Directory', value: 'remove' }
            )
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the Live Directory into (for post action)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('View all followed social feeds in this server.')
        .addStringOption((option) =>
          option
            .setName('platform')
            .setDescription('Filter feeds by platform')
            .setRequired(false)
            .addChoices(...platformChoices)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send a test announcement for a tracked feed.')
        .addStringOption((option) =>
          option
            .setName('feed')
            .setDescription('Select the feed to test')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Test notification type')
            .setRequired(false)
            .addChoices(
              { name: 'Live Stream (Twitch)', value: 'LIVE' },
              { name: 'Longform Video (YouTube)', value: 'VIDEO' },
              { name: 'YouTube Short', value: 'SHORT' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Force an immediate poll across all tracked social feeds.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('manager')
        .setDescription('Open the interactive Social Feeds manager panel.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset and remove all social feed configurations for this server.')
    ),

  moduleKey: ModuleKeys.SOCIAL_FEEDS,
  getActionKey(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list' || sub === 'subscribe' || sub === 'unsubscribe' || sub === 'my-alerts') return ActionKeys.FeedsView;
    if (sub === 'check') return ActionKeys.FeedsCheck;
    if (sub === 'reset') return ActionKeys.FeedsReset;
    return ActionKeys.FeedsManage;
  },
  isPublic(interaction) {
    const sub = interaction.options.getSubcommand();
    return sub === 'list' || sub === 'subscribe' || sub === 'unsubscribe' || sub === 'my-alerts';
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'feed') {
      const feedList = await feeds.listFeeds(interaction.guildId);
      const queryText = String(focused.value || '').toLowerCase().trim();
      const filtered = feedList.filter((f) => {
        const name = `${f.account_name} ${f.platform} ${f.account_id}`.toLowerCase();
        return name.includes(queryText);
      });

      const choices = filtered.slice(0, 25).map((f) => {
        const meta = PLATFORM_META[f.platform] || { icon: '🌐' };
        return {
          name: `${meta.icon} [${f.platform}] ${f.account_name} (in #${f.channel_id ? interaction.guild?.channels?.cache?.get(f.channel_id)?.name || 'channel' : 'channel'})`,
          value: f.id
        };
      });

      await interaction.respond(choices).catch(() => {});
    }
  },

  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'manager') {
      return replyPrivate(interaction, await feeds.buildManagerPanel(interaction.guildId));
    }

    if (subcommand === 'setup') {
      const enabled = interaction.options.getBoolean('enabled', false);
      const defaultChannel = interaction.options.getChannel('default_channel', false);
      const defaultPingRole = interaction.options.getRole('default_ping_role', false);

      const config = await feeds.updateConfig(interaction.guildId, {
        enabled: enabled !== null ? enabled : undefined,
        defaultChannelId: defaultChannel ? defaultChannel.id : undefined,
        defaultPingRoleId: defaultPingRole ? defaultPingRole.id : undefined
      });

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'social-feed-config',
        title: 'Social Feeds Configured',
        body: [
          `Updated by: <@${interaction.user.id}>`,
          `Module Status: **${config.enabled ? 'Enabled' : 'Disabled'}**`,
          `Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : '*None*'}`,
          `Default Ping Role: ${config.default_ping_role_id ? `<@&${config.default_ping_role_id}>` : '*None*'}`
        ].join('\n'),
        actorUserId: interaction.user.id,
        metadata: { config }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Social Feeds Setup Updated',
          [
            `Status: **${config.enabled ? '✅ Enabled' : '⏸️ Disabled'}**`,
            `Default Channel: ${config.default_channel_id ? `<#${config.default_channel_id}>` : '*None*'}`,
            `Default Ping Role: ${config.default_ping_role_id ? `<@&${config.default_ping_role_id}>` : '*None*'}`,
            '',
            'Use `/feed add` to track social creators and channels across platforms!'
          ].join('\n')
        )]
      });
    }

    if (subcommand === 'add') {
      const platform = interaction.options.getString('platform', true);
      const account = interaction.options.getString('account', true);
      const channel = interaction.options.getChannel('channel', false);
      const pingRole = interaction.options.getRole('ping_role', false);
      const member = interaction.options.getUser('member', false);
      const customMessage = interaction.options.getString('custom_message', false);
      const shortsMessage = interaction.options.getString('shorts_message', false);
      const videoMessage = interaction.options.getString('video_message', false);
      const liveMessage = interaction.options.getString('live_message', false);

      const config = await feeds.getConfig(interaction.guildId);
      const targetChannelId = channel ? channel.id : config.default_channel_id || interaction.channelId;

      const result = await feeds.addFeed({
        guildId: interaction.guildId,
        platform,
        account,
        channelId: targetChannelId,
        pingRoleId: pingRole ? pingRole.id : config.default_ping_role_id,
        discordUserId: member ? member.id : null,
        customMessage,
        shortsMessage,
        videoMessage,
        liveMessage
      });

      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Feed Not Added', result.reason)] });
      }

      const meta = PLATFORM_META[result.feed.platform] || { label: result.feed.platform, icon: '🌐' };

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'social-feed-added',
        title: `${meta.label} Feed Added`,
        body: `Now following **${result.feed.account_name}** on ${meta.label}.\nAnnouncements: <#${result.feed.channel_id}>${result.feed.discord_user_id ? `\nMember: <@${result.feed.discord_user_id}>` : ''}`,
        actorUserId: interaction.user.id,
        metadata: { feed: result.feed }
      }).catch(() => {});

      // Asynchronously trigger check so live status and Creator Hub directory update immediately
      feeds.checkGuildFeeds(interaction.guildId, ctx.client, ctx.logger).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Social Feed Added',
          [
            `${meta.icon} **Platform:** ${meta.label}`,
            `👤 **Account:** [${result.feed.account_name}](${result.feed.account_url})`,
            result.feed.discord_user_id ? `👥 **Linked Member:** <@${result.feed.discord_user_id}>` : '',
            `📢 **Announcement Channel:** <#${result.feed.channel_id}>`,
            result.feed.ping_role_id ? `🔔 **Ping Role:** <@&${result.feed.ping_role_id}>` : '🔔 **Ping Role:** *None*',
            result.feed.shorts_message ? `⚡ **Shorts Custom Text:** Set` : '',
            result.feed.live_message ? `🔴 **Live Custom Text:** Set` : '',
            '',
            'SlickBot will automatically post updates whenever new content is detected.'
          ].filter(Boolean).join('\n')
        )]
      });
    }

    if (subcommand === 'remove') {
      const feedId = interaction.options.getString('feed', true);
      const removed = await feeds.removeFeed(interaction.guildId, feedId);

      if (!removed) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Feed Not Found', 'Could not find the requested social feed to remove.')] });
      }

      feeds.updateLiveDirectory(interaction.guildId, ctx.client).catch(() => {});

      const meta = PLATFORM_META[removed.platform] || { label: removed.platform, icon: '🌐' };

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'social-feed-removed',
        title: `${meta.label} Feed Removed`,
        body: `Unfollowed **${removed.account_name}** (${meta.label}).`,
        actorUserId: interaction.user.id,
        metadata: { feed: removed }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed('Social Feed Removed', `Unfollowed ${meta.icon} **${removed.account_name}** on **${meta.label}**.`)]
      });
    }

    if (subcommand === 'edit') {
      const feedId = interaction.options.getString('feed', true);
      const channel = interaction.options.getChannel('channel', false);
      const pingRole = interaction.options.getRole('ping_role', false);
      const clearPingRole = interaction.options.getBoolean('clear_ping_role', false);
      const member = interaction.options.getUser('member', false);
      const clearMember = interaction.options.getBoolean('clear_member', false);
      const customMessage = interaction.options.getString('custom_message', false);
      const shortsMessage = interaction.options.getString('shorts_message', false);
      const videoMessage = interaction.options.getString('video_message', false);
      const liveMessage = interaction.options.getString('live_message', false);
      const enabled = interaction.options.getBoolean('enabled', false);

      const updated = await feeds.editFeed(interaction.guildId, feedId, {
        channelId: channel ? channel.id : undefined,
        pingRoleId: pingRole ? pingRole.id : undefined,
        clearPingRole: Boolean(clearPingRole),
        discordUserId: member ? member.id : undefined,
        clearDiscordUser: Boolean(clearMember),
        customMessage: customMessage !== null ? customMessage : undefined,
        shortsMessage: shortsMessage !== null ? shortsMessage : undefined,
        videoMessage: videoMessage !== null ? videoMessage : undefined,
        liveMessage: liveMessage !== null ? liveMessage : undefined,
        enabled: enabled !== null ? enabled : undefined
      });

      if (!updated) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Feed Not Found', 'Could not find the requested social feed to update.')] });
      }

      const meta = PLATFORM_META[updated.platform] || { label: updated.platform, icon: '🌐' };

      await ctx.logger.log({
        guildId: interaction.guildId,
        eventKey: 'social-feed-updated',
        title: `${meta.label} Feed Updated`,
        body: `Updated feed settings for **${updated.account_name}** (${meta.label}).`,
        actorUserId: interaction.user.id,
        metadata: { feed: updated }
      }).catch(() => {});

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Social Feed Updated',
          [
            `${meta.icon} **Account:** [${updated.account_name}](${updated.account_url})`,
            updated.discord_user_id ? `👥 **Linked Member:** <@${updated.discord_user_id}>` : '',
            `📢 **Channel:** <#${updated.channel_id}>`,
            updated.ping_role_id ? `🔔 **Ping Role:** <@&${updated.ping_role_id}>` : '🔔 **Ping Role:** *None*',
            `⚡ **Feed Enabled:** **${updated.enabled ? 'Yes' : 'No'}**`
          ].filter(Boolean).join('\n')
        )]
      });
    }

    if (subcommand === 'subscribe') {
      const feedId = interaction.options.getString('feed', true);
      const result = await feeds.toggleSubscription(interaction.guildId, feedId, interaction.user.id);
      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Subscription Failed', result.reason || 'Feed not found.')] });
      }

      const meta = PLATFORM_META[result.feed.platform] || { icon: '🌐', label: result.feed.platform };
      if (result.subscribed) {
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed(
            'Alerts Subscribed',
            `🔔 You will now receive notifications when ${meta.icon} **${result.feed.account_name}** (${meta.label}) goes live or posts new content!`
          )]
        });
      } else {
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed(
            'Alerts Muted',
            `🔕 You have unsubscribed from notifications for ${meta.icon} **${result.feed.account_name}** (${meta.label}).`
          )]
        });
      }
    }

    if (subcommand === 'unsubscribe') {
      const feedId = interaction.options.getString('feed', true);
      const feed = await feeds.getFeed(interaction.guildId, feedId);
      if (!feed) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Feed Not Found', 'Could not find the requested social feed.')] });
      }

      await query(
        `DELETE FROM social_feed_subscribers WHERE feed_id = $1 AND user_id = $2`,
        [feed.id, interaction.user.id]
      );

      const meta = PLATFORM_META[feed.platform] || { icon: '🌐', label: feed.platform };
      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Alerts Muted',
          `🔕 You have unsubscribed from notifications for ${meta.icon} **${feed.account_name}** (${meta.label}).`
        )]
      });
    }

    if (subcommand === 'my-alerts') {
      const userSubs = await feeds.getUserSubscriptions(interaction.guildId, interaction.user.id);
      if (!userSubs.length) {
        return replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'Your Social Feed Alerts',
            description: 'You are not currently subscribed to any creator feeds.\n\nUse `/feed subscribe` or click the **🔔 Get Alerts** button on any announcement to get notified!',
            color: SlickBotColors.INFO
          })]
        });
      }

      const lines = userSubs.map((f, idx) => {
        const meta = PLATFORM_META[f.platform] || { icon: '🌐', label: f.platform };
        const memberText = f.discord_user_id ? ` · <@${f.discord_user_id}>` : '';
        return `**${idx + 1}.** ${meta.icon} **[${f.account_name}](${f.account_url})** (${meta.label})${memberText}\n   ↳ Announcements: <#${f.channel_id}>`;
      });

      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: `Your Subscribed Feeds (${userSubs.length})`,
          description: [
            'You will receive notification pings for the following creators:',
            '',
            ...lines,
            '',
            '*To unsubscribe from any feed, use `/feed unsubscribe` or click **Get Alerts** on their posts.*'
          ].join('\n'),
          color: SlickBotColors.PRIMARY
        })]
      });
    }

    if (subcommand === 'directory') {
      const action = interaction.options.getString('action', true);
      const channel = interaction.options.getChannel('channel', false);

      if (action === 'post') {
        const targetChannel = channel || interaction.channel;
        const res = await feeds.postLiveDirectory(interaction.guildId, targetChannel.id, ctx.client);
        if (!res.ok) {
          return replyPrivate(interaction, { embeds: [createWarningEmbed('Directory Post Failed', res.reason || 'Could not post Live Directory.')] });
        }
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed(
            'Live Directory Posted',
            `Successfully posted and linked the Live Stream Directory in <#${targetChannel.id}>!\nIt will update automatically whenever tracked creators go live or offline.`
          )]
        });
      }

      if (action === 'refresh') {
        const updated = await feeds.updateLiveDirectory(interaction.guildId, ctx.client);
        if (!updated) {
          return replyPrivate(interaction, { embeds: [createWarningEmbed('No Active Directory', 'No live directory message is currently active. Use `/feed directory action:Post Directory` to set one up.')] });
        }
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed('Live Directory Refreshed', 'Successfully refreshed the Live Stream Directory embed.')]
        });
      }

      if (action === 'remove') {
        await feeds.removeLiveDirectory(interaction.guildId, ctx.client);
        return replyPrivate(interaction, {
          embeds: [createSuccessEmbed('Live Directory Removed', 'Successfully removed the Live Stream Directory configuration.')]
        });
      }
    }

    if (subcommand === 'list') {
      const filterPlatform = interaction.options.getString('platform', false);
      const feedList = await feeds.listFeeds(interaction.guildId, filterPlatform);

      if (!feedList.length) {
        return replyPrivate(interaction, {
          embeds: [createBaseEmbed({
            title: 'Social Feeds',
            description: filterPlatform
              ? `No tracked feeds found for **${filterPlatform}**. Use \`/feed add\` to follow a channel.`
              : 'No social media feeds are currently tracked on this server. Use `/feed add` to get started!',
            color: SlickBotColors.INFO
          })]
        });
      }

      const lines = feedList.map((f, idx) => {
        const meta = PLATFORM_META[f.platform] || { icon: '🌐', label: f.platform };
        const statusBadge = f.enabled ? (f.last_status === 'LIVE' ? '🔴 LIVE' : '✅ Active') : '⏸️ Paused';
        const pingText = f.ping_role_id ? ` · <@&${f.ping_role_id}>` : '';
        const memberText = f.discord_user_id ? ` · <@${f.discord_user_id}>` : '';
        return `**${idx + 1}.** ${meta.icon} **[${f.account_name}](${f.account_url})** (${meta.label})${memberText}\n   ↳ Channel: <#${f.channel_id}>${pingText} · ${statusBadge}`;
      });

      return replyPrivate(interaction, {
        embeds: [createBaseEmbed({
          title: `Followed Social Feeds (${feedList.length})`,
          description: [
            filterPlatform ? `Filtered by: **${filterPlatform}**\n` : '',
            ...lines,
            '',
            '*Manage feeds with `/feed add`, `/feed edit`, `/feed remove`, or `/feed manager`.*'
          ].filter(Boolean).join('\n'),
          color: SlickBotColors.PRIMARY,
          footer: 'SlickBot Social Feeds'
        })]
      });
    }

    if (subcommand === 'test') {
      const feedId = interaction.options.getString('feed', true);
      const testType = interaction.options.getString('type', false);

      const feed = await feeds.getFeed(interaction.guildId, feedId);
      if (!feed) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Feed Not Found', 'Could not find the requested social feed.')] });
      }

      const result = await feeds.testFeedAnnouncement(ctx.client, feed, testType, ctx.logger);
      if (!result.ok) {
        return replyPrivate(interaction, { embeds: [createWarningEmbed('Test Announcement Failed', result.reason || 'Could not send test message to destination channel.')] });
      }

      return replyPrivate(interaction, {
        embeds: [createSuccessEmbed(
          'Test Announcement Sent',
          `Successfully posted a test announcement for **${feed.account_name}** in <#${feed.channel_id}>!`
        )]
      });
    }

    if (subcommand === 'check') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      const result = await feeds.checkGuildFeeds(interaction.guildId, ctx.client, ctx.logger);

      const lines = (result.results || []).map((r) => {
        const meta = PLATFORM_META[r.feed.platform] || { icon: '🌐', label: r.feed.platform };
        return `• ${meta.icon} **[${r.feed.account_name}](${r.feed.account_url})** (${meta.label}): ${r.note}`;
      });

      return interaction.editReply({
        embeds: [createSuccessEmbed(
          'Social Feeds Polling Complete',
          [
            `Checked **${result.checked}** active feed(s). Announcements posted: **${result.announced}**`,
            '',
            lines.length ? '**Results:**\n' + lines.join('\n') : '*No active feeds to check.*',
            '',
            '💡 *Tip: You can verify Discord channels, embeds, and role pings anytime with `/feed test`.*'
          ].join('\n')
        )]
      });
    }

    if (subcommand === 'reset') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CustomIds.FeedsResetConfirmPrefix}${interaction.user.id}`)
          .setLabel('Confirm Reset')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚠️'),
        new ButtonBuilder()
          .setCustomId(`${CustomIds.FeedsResetCancelPrefix}${interaction.user.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return replyPrivate(interaction, {
        embeds: [createWarningEmbed(
          'Confirm Social Feeds Reset',
          'Are you sure you want to reset the Social Feeds module? This will remove all tracked feeds, history, and configuration settings for this server.'
        )],
        components: [row]
      });
    }

    return replyPrivate(interaction, { embeds: [createWarningEmbed('Unknown Subcommand', 'This subcommand is not recognized.')] });
  }
};
