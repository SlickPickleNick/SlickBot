const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const { createMockGuild, createMockUser, createMockMember, createMockChannel } = require('../helpers/mockDiscord');
const {
  AchievementService,
  ACHIEVEMENT_KEYS,
  normalizeAchievementKey,
  DEFAULT_UNLOCK_MESSAGE
} = require('../../src/modules/community/achievementService');

const mockDb = new MockDatabase();

test('Achievement Keys and Normalization', async (t) => {
  await t.test('normalizeAchievementKey matches supported achievement keys', () => {
    assert.equal(normalizeAchievementKey('messages_sent'), ACHIEVEMENT_KEYS.MESSAGES_SENT);
    assert.equal(normalizeAchievementKey('voice_time'), ACHIEVEMENT_KEYS.VOICE_TIME);
    assert.equal(normalizeAchievementKey('non_existent_key'), null);
  });

  await t.test('DEFAULT_UNLOCK_MESSAGE is defined', () => {
    assert.ok(DEFAULT_UNLOCK_MESSAGE.includes('{user}'));
  });
});

test('AchievementService Caching and Config Lookups', async (t) => {
  let service;
  const guildId = '400000000000000001';
  const channelId = '300000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new AchievementService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('getConfig caches guild achievement configuration', async () => {
    let queryCount = 0;
    mockDb.addHandler('achievement_configs', () => {
      queryCount++;
      return { rows: [{ guild_id: guildId, enabled: true, unlock_message: DEFAULT_UNLOCK_MESSAGE, dm_enabled: false }], rowCount: 1 };
    });

    const first = await service.getConfig(guildId);
    assert.equal(first.enabled, true);
    assert.equal(first.dm_enabled, false);
    assert.equal(queryCount, 1);

    const second = await service.getConfig(guildId);
    assert.equal(second.enabled, true);
    assert.equal(queryCount, 1); // Served from cache
  });

  await t.test('isMessageChannelIgnored checks and caches ignored channels', async () => {
    let queryCount = 0;
    mockDb.addHandler('achievement_ignored_message_channels', () => {
      queryCount++;
      return { rows: [{ channel_id: channelId }], rowCount: 1 };
    });

    const first = await service.isMessageChannelIgnored(guildId, channelId);
    assert.equal(first, true);
    assert.equal(queryCount, 1);

    const second = await service.isMessageChannelIgnored(guildId, channelId);
    assert.equal(second, true);
    assert.equal(queryCount, 1); // Served from cache
  });
});

test('AchievementService Setup and Configuration', async (t) => {
  let service;
  const guildId = '400000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new AchievementService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('setup enables DM notifications when dmEnabled is passed', async () => {
    mockDb.addHandler('SELECT * FROM achievement_configs', () => ({
      rows: [{ guild_id: guildId, enabled: true, dm_enabled: false }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO achievement_configs', (text, params) => {
      return {
        rows: [{
          guild_id: params[0],
          enabled: params[1],
          announcement_channel_id: params[2],
          afk_channel_id: params[3],
          unlock_message: params[4],
          unlock_image_url: params[5],
          dm_enabled: params[6]
        }],
        rowCount: 1
      };
    });

    const config = await service.setup(guildId, { dmEnabled: true, announcementChannelId: '300000000000000001' });
    assert.equal(config.dm_enabled, true);
    assert.equal(config.announcement_channel_id, '300000000000000001');
  });

  await t.test('setTier saves and updates custom per-tier image URL', async () => {
    mockDb.addHandler('SELECT xp_reward, role_reward_id, image_url', () => ({
      rows: [{ xp_reward: 25, role_reward_id: null, image_url: null, enabled: true }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO achievement_tiers', (text, params) => {
      return {
        rows: [{
          guild_id: params[0],
          achievement_key: params[1],
          tier_level: params[2],
          tier_name: params[3],
          threshold_value: params[4],
          xp_reward: params[5],
          role_reward_id: params[6],
          image_url: params[7],
          enabled: params[8]
        }],
        rowCount: 1
      };
    });

    const tier = await service.setTier({
      guildId,
      achievementKey: ACHIEVEMENT_KEYS.MESSAGES_SENT,
      level: 1,
      threshold: 50,
      xpReward: 25,
      imageUrl: 'https://example.com/bronze.png'
    });

    assert.equal(tier.image_url, 'https://example.com/bronze.png');
    assert.equal(tier.tier_name, 'Bronze');
  });

  await t.test('configureOneTimeAchievement updates image URL', async () => {
    mockDb.addHandler('SELECT * FROM achievement_definitions', () => ({
      rows: [{
        guild_id: guildId,
        achievement_key: ACHIEVEMENT_KEYS.SERVER_BOOSTING,
        name: 'Server Booster',
        one_time_xp_reward: 250,
        image_url: null
      }],
      rowCount: 1
    }));

    mockDb.addHandler('UPDATE achievement_definitions', (text, params) => {
      return {
        rows: [{
          guild_id: params[0],
          achievement_key: params[1],
          name: 'Server Booster',
          image_url: params[6]
        }],
        rowCount: 1
      };
    });

    const definition = await service.configureOneTimeAchievement({
      guildId,
      achievementKey: ACHIEVEMENT_KEYS.SERVER_BOOSTING,
      imageUrl: 'https://example.com/booster.png'
    });

    assert.equal(definition.image_url, 'https://example.com/booster.png');
  });
});

test('Achievement Unlock Notifications and Image Precedence', async (t) => {
  let service;
  const guildId = '400000000000000001';
  const userId = '100000000000000001';
  const channelId = '300000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new AchievementService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('sendUnlockAnnouncement sends to both channel and DM with tier-specific image', async () => {
    mockDb.addHandler('achievement_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        announcement_channel_id: channelId,
        dm_enabled: true,
        unlock_image_url: 'https://example.com/global_fallback.png',
        unlock_message: DEFAULT_UNLOCK_MESSAGE
      }],
      rowCount: 1
    }));

    const mockChannel = createMockChannel({ id: channelId });
    const dmSentMessages = [];
    const mockUser = createMockUser({
      id: userId,
      send: async (payload) => {
        dmSentMessages.push(payload);
        return { id: 'mock-dm-msg-id' };
      }
    });
    const mockMember = createMockMember({ user: mockUser });
    const mockGuild = createMockGuild({
      id: guildId,
      initialChannels: [mockChannel],
      initialMembers: [mockMember]
    });
    mockGuild.client = { users: { fetch: async () => mockUser } };

    const tier = {
      tier_level: 2,
      tier_name: 'Silver',
      threshold_value: 250,
      xp_reward: 75,
      image_url: 'https://example.com/silver.png'
    };

    const sent = await service.sendUnlockAnnouncement({
      guild: mockGuild,
      channel: mockChannel,
      userId,
      achievementKey: ACHIEVEMENT_KEYS.MESSAGES_SENT,
      definition: { name: 'Message Maven' },
      tier,
      xpReward: 75
    });

    assert.equal(sent, true);
    assert.equal(mockChannel.sentMessages.length, 1);
    assert.equal(dmSentMessages.length, 1);

    // Verify channel embed uses tier image URL over global fallback
    const channelEmbed = mockChannel.sentMessages[0].embeds[0];
    assert.equal(channelEmbed.data.image.url, 'https://example.com/silver.png');

    // Verify DM embed uses tier image URL
    const dmEmbed = dmSentMessages[0].embeds[0];
    assert.equal(dmEmbed.data.image.url, 'https://example.com/silver.png');
  });

  await t.test('sendUnlockAnnouncement falls back to global image when tier has none', async () => {
    mockDb.addHandler('achievement_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        announcement_channel_id: channelId,
        dm_enabled: false,
        unlock_image_url: 'https://example.com/global_fallback.png',
        unlock_message: DEFAULT_UNLOCK_MESSAGE
      }],
      rowCount: 1
    }));

    const mockChannel = createMockChannel({ id: channelId });
    const mockGuild = createMockGuild({
      id: guildId,
      initialChannels: [mockChannel]
    });

    const tier = {
      tier_level: 1,
      tier_name: 'Bronze',
      threshold_value: 50,
      xp_reward: 25,
      image_url: null
    };

    const sent = await service.sendUnlockAnnouncement({
      guild: mockGuild,
      channel: mockChannel,
      userId,
      achievementKey: ACHIEVEMENT_KEYS.MESSAGES_SENT,
      definition: { name: 'Message Maven' },
      tier,
      xpReward: 25
    });

    assert.equal(sent, true);
    assert.equal(mockChannel.sentMessages.length, 1);
    const channelEmbed = mockChannel.sentMessages[0].embeds[0];
    assert.equal(channelEmbed.data.image.url, 'https://example.com/global_fallback.png');
  });

  await t.test('sendUnlockAnnouncement handles DM error gracefully without failing', async () => {
    mockDb.addHandler('achievement_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        announcement_channel_id: channelId,
        dm_enabled: true,
        unlock_message: DEFAULT_UNLOCK_MESSAGE
      }],
      rowCount: 1
    }));

    const mockChannel = createMockChannel({ id: channelId });
    const mockUser = createMockUser({
      id: userId,
      send: async () => {
        throw new Error('Cannot send messages to this user');
      }
    });
    const mockMember = createMockMember({ user: mockUser });
    const mockGuild = createMockGuild({
      id: guildId,
      initialChannels: [mockChannel],
      initialMembers: [mockMember]
    });
    mockGuild.client = { users: { fetch: async () => mockUser } };

    const tier = {
      tier_level: 1,
      tier_name: 'Bronze',
      threshold_value: 50,
      xp_reward: 25
    };

    // Should not throw error despite DM throwing
    const sent = await service.sendUnlockAnnouncement({
      guild: mockGuild,
      channel: mockChannel,
      userId,
      achievementKey: ACHIEVEMENT_KEYS.MESSAGES_SENT,
      definition: { name: 'Message Maven' },
      tier,
      xpReward: 25
    });

    assert.equal(sent, true);
    assert.equal(mockChannel.sentMessages.length, 1);
  });
});
