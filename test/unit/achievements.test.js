const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
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
      return { rows: [{ guild_id: guildId, enabled: true, unlock_message: DEFAULT_UNLOCK_MESSAGE }], rowCount: 1 };
    });

    const first = await service.getConfig(guildId);
    assert.equal(first.enabled, true);
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
