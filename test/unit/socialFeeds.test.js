const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SocialFeedService,
  PLATFORM_KEYS,
  PLATFORM_META,
  DEFAULT_TEMPLATES,
  normalizePlatform,
  normalizeAccountId,
  formatStreamDuration,
  applyFeedPlaceholders,
  classifyYouTubeVideo
} = require('../../src/modules/automation/socialFeedService');
const { MockDatabase } = require('../helpers/mockDb');
const { createMockInteraction, createMockGuild, createMockChannel, createMockUser } = require('../helpers/mockDiscord');
const feedCommand = require('../../src/commands/feed');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');

test('Social Feeds Utility and Helper Functions', async (t) => {
  await t.test('normalizePlatform recognizes valid platforms and aliases', () => {
    assert.equal(normalizePlatform('twitch'), PLATFORM_KEYS.TWITCH);
    assert.equal(normalizePlatform('TWITCH'), PLATFORM_KEYS.TWITCH);
    assert.equal(normalizePlatform('youtube'), PLATFORM_KEYS.YOUTUBE);
    assert.equal(normalizePlatform('tiktok'), null);
    assert.equal(normalizePlatform('x'), null);
    assert.equal(normalizePlatform('twitter'), null);
    assert.equal(normalizePlatform('instagram'), null);
    assert.equal(normalizePlatform(''), null);
  });

  await t.test('normalizeAccountId extracts usernames and channel IDs correctly', () => {
    assert.equal(normalizeAccountId(PLATFORM_KEYS.TWITCH, 'https://twitch.tv/ninja'), 'ninja');
    assert.equal(normalizeAccountId(PLATFORM_KEYS.TWITCH, 'ninja'), 'ninja');
    assert.equal(normalizeAccountId(PLATFORM_KEYS.YOUTUBE, 'https://youtube.com/@SlickNick'), 'slicknick');
    assert.equal(normalizeAccountId(PLATFORM_KEYS.YOUTUBE, 'UC1234567890abcdef123456'), 'uc1234567890abcdef123456');
  });

  await t.test('formatStreamDuration formats elapsed time accurately', () => {
    const start = new Date(Date.now() - (2 * 3600 * 1000 + 15 * 60 * 1000)); // 2h 15m ago
    const duration = formatStreamDuration(start, new Date());
    assert.equal(duration, '2 hrs, 15 mins');

    const shortStart = new Date(Date.now() - 45 * 60 * 1000); // 45m ago
    assert.equal(formatStreamDuration(shortStart, new Date()), '45 mins');

    const exact1h = new Date(Date.now() - 3600 * 1000); // 1h ago
    assert.equal(formatStreamDuration(exact1h, new Date()), '1 hr');

    const invalid = formatStreamDuration(new Date(Date.now() + 10000), new Date());
    assert.equal(invalid, 'Less than a minute');
  });

  await t.test('applyFeedPlaceholders substitutes all supported tokens', () => {
    const template = '🔴 {author} went live on {platform} playing {game}! Role: {role}, Type: {type}, Link: {url}, Streamed: {duration}';
    const output = applyFeedPlaceholders(template, {
      authorName: 'SlickNick',
      platform: 'Twitch',
      platformLabel: 'Twitch',
      gameName: 'Minecraft',
      pingRoleId: '123456789',
      itemType: 'LIVE',
      url: 'https://twitch.tv/slicknick',
      duration: '1 hr, 30 mins'
    });

    assert.ok(output.includes('SlickNick'));
    assert.ok(output.includes('Twitch'));
    assert.ok(output.includes('Minecraft'));
    assert.ok(output.includes('<@&123456789>'));
    assert.ok(output.includes('LIVE'));
    assert.ok(output.includes('https://twitch.tv/slicknick'));
    assert.ok(output.includes('1 hr, 30 mins'));
  });

  await t.test('classifyYouTubeVideo differentiates between Shorts and Longform videos', () => {
    assert.equal(classifyYouTubeVideo('Insane clutch! #shorts', 'Desc', 'https://youtube.com/watch?v=123'), 'SHORT');
    assert.equal(classifyYouTubeVideo('Normal Title', 'Check out this #short video', 'https://youtube.com/watch?v=123'), 'SHORT');
    assert.equal(classifyYouTubeVideo('Shorts URL', '', 'https://youtube.com/shorts/abc123xyz'), 'SHORT');
    assert.equal(classifyYouTubeVideo('Quick tip', '', '', 45), 'SHORT');
    assert.equal(classifyYouTubeVideo('Full gameplay walkthrough episode 1', 'Full 30 minute long video', 'https://youtube.com/watch?v=123', 1800), 'VIDEO');
  });
});

test('SocialFeedService Database CRUD and Caching', async (t) => {
  const db = new MockDatabase();
  db.install();

  t.after(() => {
    db.uninstall();
  });

  const service = new SocialFeedService();
  const guildId = '400000000000000001';

  await t.test('getConfig returns default config and caches result', async () => {
    let queryCount = 0;
    db.addHandler('SELECT * FROM social_feed_configs', () => {
      queryCount++;
      return {
        rows: [{
          guild_id: guildId,
          enabled: true,
          default_channel_id: '300000000000000001',
          default_ping_role_id: null,
          check_interval_seconds: 120
        }],
        rowCount: 1
      };
    });

    const config1 = await service.getConfig(guildId);
    assert.equal(config1.enabled, true);
    assert.equal(config1.default_channel_id, '300000000000000001');

    const config2 = await service.getConfig(guildId);
    assert.equal(config2.enabled, true);
    assert.equal(queryCount, 1); // Served from cache
  });

  await t.test('addFeed validates input and inserts feed record', async () => {
    db.addHandler('INSERT INTO social_feeds', (text, params) => {
      return {
        rows: [{
          id: 'feed-uuid-1',
          guild_id: params[0],
          platform: params[1],
          account_id: params[2],
          account_name: params[3],
          account_url: params[4],
          channel_id: params[5],
          ping_role_id: params[6],
          custom_message: params[7],
          shorts_message: params[8],
          video_message: params[9],
          live_message: params[10],
          enabled: true,
          last_status: 'OFFLINE'
        }],
        rowCount: 1
      };
    });

    const result = await service.addFeed({
      guildId,
      platform: 'TWITCH',
      account: 'ninja',
      channelId: '300000000000000001',
      liveMessage: '🔴 {author} is now live!'
    });

    assert.equal(result.ok, true);
    assert.equal(result.feed.platform, 'TWITCH');
    assert.equal(result.feed.account_name, 'ninja');
    assert.equal(result.feed.channel_id, '300000000000000001');
  });

  await t.test('removeFeed deletes feed from database', async () => {
    db.addHandler('DELETE FROM social_feeds', () => {
      return {
        rows: [{ id: 'feed-uuid-1', account_name: 'ninja', platform: 'TWITCH' }],
        rowCount: 1
      };
    });

    const removed = await service.removeFeed(guildId, 'feed-uuid-1');
    assert.ok(removed);
    assert.equal(removed.account_name, 'ninja');
  });
});

test('Feed Slash Command Structure and Permissions', async (t) => {
  await t.test('feed command is registered with correct metadata and action keys', () => {
    assert.equal(feedCommand.data.name, 'feed');
    assert.equal(feedCommand.moduleKey, ModuleKeys.SOCIAL_FEEDS);

    const subcommands = feedCommand.data.options.map((opt) => opt.name);
    assert.ok(subcommands.includes('setup'));
    assert.ok(subcommands.includes('add'));
    assert.ok(subcommands.includes('remove'));
    assert.ok(subcommands.includes('edit'));
    assert.ok(subcommands.includes('list'));
    assert.ok(subcommands.includes('test'));
    assert.ok(subcommands.includes('check'));
    assert.ok(subcommands.includes('manager'));
    assert.ok(subcommands.includes('reset'));

    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'list' } }), ActionKeys.FeedsView);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'subscribe' } }), ActionKeys.FeedsView);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'unsubscribe' } }), ActionKeys.FeedsView);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'my-alerts' } }), ActionKeys.FeedsView);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'check' } }), ActionKeys.FeedsCheck);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'reset' } }), ActionKeys.FeedsReset);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'setup' } }), ActionKeys.FeedsManage);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'add' } }), ActionKeys.FeedsManage);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'directory' } }), ActionKeys.FeedsManage);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'list' } }), true);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'subscribe' } }), true);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'unsubscribe' } }), true);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'my-alerts' } }), true);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'add' } }), false);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'directory' } }), false);
  });

  await t.test('feed list outputs followed feeds cleanly', async () => {
    const db = new MockDatabase();
    db.install();

    db.addHandler('SELECT * FROM social_feeds', () => {
      return {
        rows: [
          {
            id: 'feed-1',
            guild_id: '400000000000000001',
            platform: 'TWITCH',
            account_id: 'ninja',
            account_name: 'Ninja',
            account_url: 'https://twitch.tv/ninja',
            channel_id: '300000000000000001',
            ping_role_id: null,
            discord_user_id: '500000000000000001',
            enabled: true,
            last_status: 'OFFLINE'
          }
        ],
        rowCount: 1
      };
    });

    const guild = createMockGuild();
    const channel = createMockChannel({ guildId: guild.id });
    const interaction = createMockInteraction({
      guild,
      channel,
      subcommand: 'list',
      options: {}
    });

    const ctx = {
      permissions: {},
      logger: { log: async () => {} }
    };

    await feedCommand.execute(interaction, ctx);
    assert.equal(interaction.replies.length, 1);
    const reply = interaction.replies[0];
    assert.ok(reply.embeds?.[0]?.data?.title?.includes('Followed Social Feeds'));
    assert.ok(reply.embeds?.[0]?.data?.description?.includes('Ninja'));
    assert.ok(reply.embeds?.[0]?.data?.description?.includes('500000000000000001'));

    db.uninstall();
  });
});

test('Social Feeds Subscriptions and Live Directory System', async (t) => {
  const db = new MockDatabase();
  db.install();

  t.after(() => {
    db.uninstall();
  });

  const service = new SocialFeedService();
  const guildId = '400000000000000001';
  const feedId = 'feed-123';
  const userId = '500000000000000001';

  await t.test('toggleSubscription toggles member subscription on and off', async () => {
    let subscriberRows = [];

    db.addHandler('SELECT * FROM social_feeds', () => {
      return {
        rows: [{
          id: feedId,
          guild_id: guildId,
          platform: 'TWITCH',
          account_id: 'shroud',
          account_name: 'Shroud',
          channel_id: '300000000000000001'
        }],
        rowCount: 1
      };
    });

    db.addHandler('SELECT id FROM social_feed_subscribers', (sql, params) => {
      const match = subscriberRows.find((r) => r.feed_id === params[0] && r.user_id === params[1]);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    });

    db.addHandler('INSERT INTO social_feed_subscribers', (sql, params) => {
      subscriberRows.push({ id: 'sub-1', guild_id: params[0], feed_id: params[1], user_id: params[2] });
      return { rows: [], rowCount: 1 };
    });

    db.addHandler('DELETE FROM social_feed_subscribers', (sql, params) => {
      subscriberRows = subscriberRows.filter((r) => !(r.feed_id === params[0] && r.user_id === params[1]));
      return { rows: [], rowCount: 1 };
    });

    // 1. First toggle -> subscribe
    const subResult = await service.toggleSubscription(guildId, feedId, userId);
    assert.equal(subResult.ok, true);
    assert.equal(subResult.subscribed, true);
    assert.equal(subResult.feed.account_name, 'Shroud');

    // 2. Second toggle -> unsubscribe
    const unsubResult = await service.toggleSubscription(guildId, feedId, userId);
    assert.equal(unsubResult.ok, true);
    assert.equal(unsubResult.subscribed, false);
  });

  await t.test('buildLiveDirectoryPayload generates valid embed for 0 and >0 live streams', async () => {
    // Case 1: 0 live streams
    db.addHandler('SELECT * FROM social_feeds', () => {
      return {
        rows: [{
          id: feedId,
          guild_id: guildId,
          platform: 'TWITCH',
          account_id: 'shroud',
          account_name: 'Shroud',
          account_url: 'https://twitch.tv/shroud',
          channel_id: '300000000000000001',
          enabled: true,
          last_status: 'OFFLINE'
        }],
        rowCount: 1
      };
    });

    const mockGuild = createMockGuild({ id: guildId, name: 'SlickBot Server' });
    const mockClient = { guilds: { cache: new Map([[guildId, mockGuild]]) } };

    const offlinePayload = await service.buildLiveDirectoryPayload(guildId, mockClient);
    assert.ok(offlinePayload.embeds[0].data.description.includes('No community creators are currently live'));

    // Case 2: 1 live stream
    db.addHandler('SELECT * FROM social_feeds', () => {
      return {
        rows: [{
          id: feedId,
          guild_id: guildId,
          platform: 'TWITCH',
          account_id: 'shroud',
          account_name: 'Shroud',
          account_url: 'https://twitch.tv/shroud',
          channel_id: '300000000000000001',
          discord_user_id: '500000000000000001',
          enabled: true,
          last_status: 'LIVE',
          live_started_at: new Date(Date.now() - 1800000)
        }],
        rowCount: 1
      };
    });

    const livePayload = await service.buildLiveDirectoryPayload(guildId, mockClient);
    assert.ok(livePayload.embeds[0].data.title.includes('1 Online'));
    assert.ok(livePayload.embeds[0].data.description.includes('Shroud'));
    assert.ok(livePayload.embeds[0].data.description.includes('500000000000000001'));
    assert.ok(livePayload.components.length > 0);
  });

  await t.test('handleStickyDirectoryRepost deletes old message and sends new sticky message', async () => {
    const config = {
      guild_id: guildId,
      live_directory_channel_id: '300000000000000001',
      live_directory_message_id: 'msg-old-1',
      live_directory_auto_sticky: true
    };

    db.addHandler('SELECT * FROM social_feed_configs', () => ({
      rows: [config],
      rowCount: 1
    }));

    db.addHandler('UPDATE social_feed_configs SET live_directory_message_id', (sql, params) => {
      config.live_directory_message_id = params[1];
      return { rows: [], rowCount: 1 };
    });

    let oldMessageDeleted = false;
    let newMessageSent = false;

    const mockChannel = {
      id: '300000000000000001',
      messages: {
        fetch: async (id) => {
          if (id === 'msg-old-1') {
            return {
              id: 'msg-old-1',
              delete: async () => { oldMessageDeleted = true; }
            };
          }
          return null;
        }
      },
      send: async (payload) => {
        newMessageSent = true;
        return { id: 'msg-new-2' };
      }
    };

    const mockGuild = createMockGuild({ id: guildId, name: 'SlickBot Server' });
    const mockMessage = {
      id: 'chat-msg-1',
      guild: mockGuild,
      channel: mockChannel,
      author: { id: 'user-1', bot: false }
    };
    const mockClient = { guilds: { cache: new Map([[guildId, mockGuild]]) } };

    await service.handleStickyDirectoryRepost(mockMessage, mockClient);
    assert.equal(oldMessageDeleted, true);
    assert.equal(newMessageSent, true);
    assert.equal(config.live_directory_message_id, 'msg-new-2');
  });

  await t.test('sendAnnouncement applies member avatar as thumbnail when discord_user_id is linked', async () => {
    db.addHandler('INSERT INTO social_feed_posts_history', () => ({ rows: [], rowCount: 1 }));
    db.addHandler('UPDATE social_feeds', () => ({ rows: [], rowCount: 1 }));
    db.addHandler('SELECT id FROM social_feed_subscribers', () => ({ rows: [], rowCount: 0 }));

    let sentPayload = null;
    const mockGuild = createMockGuild({ id: guildId });
    mockGuild.members = {
      cache: new Map([
        ['500000000000000001', {
          displayName: 'StreamerNick',
          user: {
            username: 'StreamerNick',
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/500/avatar.png'
          }
        }]
      ])
    };

    const mockChannel = {
      id: '300000000000000001',
      guild: mockGuild,
      isTextBased: () => true,
      send: async (payload) => {
        sentPayload = payload;
        return { id: 'announcement-msg-1' };
      }
    };

    mockGuild.channels = {
      cache: new Map([[mockChannel.id, mockChannel]])
    };

    const feed = {
      id: feedId,
      guild_id: guildId,
      platform: 'TWITCH',
      account_id: 'ninja',
      account_name: 'Ninja',
      channel_id: mockChannel.id,
      discord_user_id: '500000000000000001',
      ping_role_id: null,
      enabled: true
    };

    const updateData = {
      itemType: 'LIVE',
      title: 'Late Night Stream',
      url: 'https://twitch.tv/ninja',
      gameName: 'Fortnite',
      viewerCount: 15000,
      thumbnailUrl: 'https://static-cdn.jtvnw.net/preview.jpg'
    };

    const mockClient = { guilds: { cache: new Map([[guildId, mockGuild]]) } };
    const result = await service.sendAnnouncement(mockClient, feed, updateData, null);
    assert.equal(result.ok, true);
    assert.ok(sentPayload);
    assert.ok(sentPayload.embeds[0].data.thumbnail.url.includes('avatar.png'));
    assert.ok(sentPayload.embeds[0].data.footer.text.includes('StreamerNick'));
  });
});
