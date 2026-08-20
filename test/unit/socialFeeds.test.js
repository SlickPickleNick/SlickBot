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
    assert.equal(normalizePlatform('tiktok'), PLATFORM_KEYS.TIKTOK);
    assert.equal(normalizePlatform('x'), null);
    assert.equal(normalizePlatform('twitter'), null);
    assert.equal(normalizePlatform('instagram'), null);
    assert.equal(normalizePlatform(''), null);
  });

  await t.test('normalizeAccountId extracts usernames and channel IDs correctly', () => {
    assert.equal(normalizeAccountId(PLATFORM_KEYS.TWITCH, 'https://twitch.tv/ninja'), 'ninja');
    assert.equal(normalizeAccountId(PLATFORM_KEYS.TWITCH, 'ninja'), 'ninja');
    assert.equal(normalizeAccountId(PLATFORM_KEYS.TIKTOK, 'https://tiktok.com/@tiktokcreator'), 'tiktokcreator');
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
    assert.equal(config1.guild_id, guildId);
    assert.equal(config1.enabled, true);
    assert.equal(queryCount, 1);

    const config2 = await service.getConfig(guildId);
    assert.equal(config2.guild_id, guildId);
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
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'check' } }), ActionKeys.FeedsCheck);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'reset' } }), ActionKeys.FeedsReset);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'setup' } }), ActionKeys.FeedsManage);
    assert.equal(feedCommand.getActionKey({ options: { getSubcommand: () => 'add' } }), ActionKeys.FeedsManage);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'list' } }), true);
    assert.equal(feedCommand.isPublic({ options: { getSubcommand: () => 'add' } }), false);
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

    db.uninstall();
  });

  await t.test('parseRssItems extracts videos, links, and media correctly', () => {
    const service = new SocialFeedService();
    const mockRssXml = `
      <rss version="2.0">
        <channel>
          <title>TikTok / SlickNick</title>
          <item>
            <title>Insane gaming moment in TikTok video!</title>
            <dc:creator>SlickNick</dc:creator>
            <description>&lt;p&gt;Insane gaming moment!&lt;/p&gt;&lt;img src="https://p16.tiktokcdn.com/media/preview.jpg" /&gt;</description>
            <pubDate>Thu, 20 Aug 2026 05:40:00 GMT</pubDate>
            <guid>https://www.tiktok.com/@SlickNick/video/7198765432109876543</guid>
            <link>https://www.tiktok.com/@SlickNick/video/7198765432109876543</link>
          </item>
        </channel>
      </rss>
    `;

    const items = service.parseRssItems(mockRssXml, 'SlickNick', 'https://www.tiktok.com');
    assert.equal(items.length, 1);
    assert.equal(items[0].itemId, '7198765432109876543');
    assert.equal(items[0].authorName, 'SlickNick');
    assert.ok(items[0].title.includes('Insane gaming moment'));
    assert.equal(items[0].thumbnailUrl, 'https://p16.tiktokcdn.com/media/preview.jpg');
    assert.equal(items[0].url, 'https://www.tiktok.com/@SlickNick/video/7198765432109876543');
    assert.equal(items[0].itemType, 'VIDEO');
  });
});
