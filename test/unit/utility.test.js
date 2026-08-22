const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UtilityService,
  DEFAULT_UTILITY_CONFIG,
  parseDurationToMs,
  renderProgressBar
} = require('../../src/modules/utility/utilityService');
const { MockDatabase } = require('../helpers/mockDb');
const { createMockUser, createMockMember, createMockRole, createMockChannel, createMockGuild } = require('../helpers/mockDiscord');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const utilityCmd = require('../../src/commands/utility');
const purgeCmd = require('../../src/commands/purge');
const userinfoCmd = require('../../src/commands/userinfo');
const serverinfoCmd = require('../../src/commands/serverinfo');
const roleinfoCmd = require('../../src/commands/roleinfo');
const channelinfoCmd = require('../../src/commands/channelinfo');
const avatarCmd = require('../../src/commands/avatar');
const bannerCmd = require('../../src/commands/banner');
const pollCmd = require('../../src/commands/poll');
const remindCmd = require('../../src/commands/remind');
const embedCmd = require('../../src/commands/embed');
const afkCmd = require('../../src/commands/afk');
const snipeCmd = require('../../src/commands/snipe');
const emojisCmd = require('../../src/commands/emojis');
const stickersCmd = require('../../src/commands/stickers');
const userInfoContextCmd = require('../../src/commands/userInfoContext');
const avatarContextCmd = require('../../src/commands/avatarContext');

const mockDb = new MockDatabase();

test('Utility Service & Helper Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('parseDurationToMs correctly parses various formats', () => {
    assert.equal(parseDurationToMs('30s'), 30000);
    assert.equal(parseDurationToMs('10m'), 600000);
    assert.equal(parseDurationToMs('2h'), 7200000);
    assert.equal(parseDurationToMs('1d'), 86400000);
    assert.equal(parseDurationToMs('2w'), 1209600000);
    assert.equal(parseDurationToMs('invalid'), null);
    assert.equal(parseDurationToMs(''), null);
    assert.equal(parseDurationToMs(null), null);
  });

  await t.test('renderProgressBar produces accurate visual representations', () => {
    assert.equal(renderProgressBar(0, 10), '░░░░░░░░░░');
    assert.equal(renderProgressBar(50, 10), '█████░░░░░');
    assert.equal(renderProgressBar(100, 10), '██████████');
    assert.equal(renderProgressBar(150, 10), '██████████');
    assert.equal(renderProgressBar(-20, 10), '░░░░░░░░░░');
  });

  await t.test('UtilityService getConfig returns defaults and upsertConfig updates settings', async () => {
    const utility = new UtilityService();
    mockDb.addHandler('utility_configs', () => ({ rows: [], rowCount: 0 }));

    const config = await utility.getConfig('guild_123');
    assert.equal(config.enabled, true);
    assert.equal(config.purge_enabled, true);
    assert.equal(config.polls_enabled, true);
    assert.equal(config.max_reminders_per_user, 10);

    mockDb.addHandler('INSERT INTO utility_configs', (text, params) => ({
      rows: [{ ...DEFAULT_UTILITY_CONFIG, guild_id: params[0], max_reminders_per_user: params[8] }],
      rowCount: 1
    }));

    const updated = await utility.upsertConfig('guild_123', { max_reminders_per_user: 25 });
    assert.equal(updated.max_reminders_per_user, 25);
  });

  await t.test('UtilityService Snipe Cache stores and retrieves deleted messages up to capacity', () => {
    const utility = new UtilityService();
    const channelId = 'chan_123';

    utility.recordDeletedMessage({
      channelId,
      content: 'Deleted hello',
      author: { id: 'user_1', tag: 'User#0001', displayAvatarURL: () => 'http://avatar' },
      attachments: new Map(),
      createdTimestamp: Date.now() - 10000
    });

    const snipe = utility.getSnipe(channelId);
    assert.ok(snipe);
    assert.equal(snipe.content, 'Deleted hello');
    assert.equal(snipe.author.id, 'user_1');

    // Add more messages to test capacity
    for (let i = 1; i <= 15; i++) {
      utility.recordDeletedMessage({
        channelId,
        content: `Message ${i}`,
        author: { id: 'user_1', tag: 'User#0001', displayAvatarURL: () => 'http://avatar' },
        createdTimestamp: Date.now()
      });
    }

    assert.equal(utility.snipeCache.get(channelId).length, 10);
    assert.equal(utility.getSnipe(channelId).content, 'Message 15');
  });

  await t.test('UtilityService AFK sets, retrieves, and clears records', async () => {
    const utility = new UtilityService();
    const guildId = 'guild_123';
    const user = { id: 'user_1', tag: 'User#0001' };

    mockDb.addHandler('INSERT INTO utility_afk_users', (text, params) => ({
      rows: [{ guild_id: params[0], user_id: params[1], user_tag: params[2], message: params[3], set_at: new Date() }],
      rowCount: 1
    }));

    const record = await utility.setAfk(guildId, user, 'Studying');
    assert.equal(record.message, 'Studying');

    mockDb.addHandler('SELECT * FROM utility_afk_users', () => ({
      rows: [{ guild_id: guildId, user_id: user.id, message: 'Studying', set_at: new Date() }],
      rowCount: 1
    }));

    const fetched = await utility.getAfk(guildId, user.id);
    assert.ok(fetched);
    assert.equal(fetched.message, 'Studying');

    mockDb.addHandler('DELETE FROM utility_afk_users', () => ({
      rows: [{ user_id: user.id }],
      rowCount: 1
    }));

    const cleared = await utility.clearAfk(guildId, user.id);
    assert.ok(cleared);
  });

  await t.test('UtilityService Reminders creates, limits, and cancels reminders', async () => {
    const utility = new UtilityService();
    const guildId = 'guild_123';
    const user = { id: 'user_1', tag: 'User#0001' };

    mockDb.addHandler('SELECT COUNT(*)::int AS count FROM utility_reminders', () => ({
      rows: [{ count: 0 }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO utility_reminders', (text, params) => ({
      rows: [{ id: 'rem_abc', guild_id: params[0], user_id: params[1], reminder_text: params[4], status: 'PENDING' }],
      rowCount: 1
    }));

    const { reminder } = await utility.setReminder(guildId, user, 'chan_123', {
      durationMs: 60000,
      reminderText: 'Test Reminder',
      destinationType: 'DM'
    });

    assert.equal(reminder.id, 'rem_abc');
    assert.equal(reminder.reminder_text, 'Test Reminder');

    mockDb.addHandler('UPDATE utility_reminders SET status = \'CANCELLED\'', () => ({
      rows: [{ id: 'rem_abc', status: 'CANCELLED' }],
      rowCount: 1
    }));

    const cancelled = await utility.cancelReminder('rem_abc', user.id);
    assert.ok(cancelled);
    assert.equal(cancelled.status, 'CANCELLED');
  });

  await t.test('UtilityService Polls generates valid payloads and calculates votes', async () => {
    const utility = new UtilityService();
    const poll = {
      id: 'poll_123',
      question: 'Best Game?',
      status: 'OPEN',
      input_style: 'AUTO',
      multiple_votes: false,
      anonymous: false,
      expires_at: new Date(Date.now() + 3600000)
    };

    const options = [
      { id: 'opt_1', label: 'Minecraft', vote_count: 8 },
      { id: 'opt_2', label: 'Roblox', vote_count: 2 }
    ];

    const payload = utility.buildPollPayload(poll, options, 10, ['opt_1']);
    assert.ok(payload.embeds);
    assert.ok(payload.components);
    assert.ok(payload.embeds[0].data.title.includes('Best Game?'));
    assert.ok(payload.embeds[0].data.description.includes('80%'));
    assert.ok(payload.embeds[0].data.description.includes('20%'));
  });

  await t.test('UtilityService buildEmojiListPayload and buildStickerListPayload format payloads accurately', async () => {
    const utility = new UtilityService();
    const mockGuild = createMockGuild({ id: 'guild_123', name: 'Test Guild', premiumTier: 2, premiumSubscriptionCount: 7 });

    mockGuild.emojis = {
      cache: new Map([
        ['e1', { id: 'e1', name: 'cool', animated: false, toString: () => '<:cool:e1>' }],
        ['e2', { id: 'e2', name: 'hype', animated: true, toString: () => '<a:hype:e2>' }]
      ])
    };

    mockGuild.stickers = {
      cache: new Map([
        ['s1', { id: 's1', name: 'Popcat', format: 1, tags: 'cat', description: 'Popcat sticker', url: 'https://cdn.discordapp.com/stickers/s1.png' }]
      ])
    };

    const emojiPayload = await utility.buildEmojiListPayload(mockGuild, 1);
    assert.ok(emojiPayload.embeds);
    assert.ok(emojiPayload.embeds[0].data.title.includes('Server Emojis'));
    assert.ok(emojiPayload.embeds[0].data.description.includes('Tier 2'));
    assert.ok(emojiPayload.embeds[0].data.description.includes('<:cool:e1>'));
    assert.ok(emojiPayload.embeds[0].data.description.includes('<a:hype:e2>'));
    assert.ok(emojiPayload.components.length > 0);

    const stickerPayload = await utility.buildStickerListPayload(mockGuild, 1);
    assert.ok(stickerPayload.embeds);
    assert.ok(stickerPayload.embeds[0].data.title.includes('Server Stickers'));
    assert.ok(stickerPayload.embeds[0].data.description.includes('Popcat'));
    assert.ok(stickerPayload.embeds[0].data.description.includes('PNG'));
    assert.ok(stickerPayload.components.length > 0);
  });
});

test('Utility Slash Commands Metadata & ActionKeys', () => {
  assert.equal(utilityCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(purgeCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(userinfoCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(serverinfoCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(roleinfoCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(channelinfoCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(avatarCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(bannerCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(pollCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(remindCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(embedCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(afkCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(snipeCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(emojisCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(stickersCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(userInfoContextCmd.moduleKey, ModuleKeys.UTILITY);
  assert.equal(avatarContextCmd.moduleKey, ModuleKeys.UTILITY);

  assert.equal(purgeCmd.actionKey, ActionKeys.UtilityPurge);
  assert.equal(pollCmd.actionKey, ActionKeys.UtilityPollCreate);
  assert.equal(remindCmd.actionKey, ActionKeys.UtilityRemindUse);
  assert.equal(embedCmd.actionKey, ActionKeys.UtilityEmbedCreate);
  assert.equal(afkCmd.actionKey, ActionKeys.UtilityAfkUse);
  assert.equal(snipeCmd.actionKey, ActionKeys.UtilitySnipeView);
  assert.equal(emojisCmd.actionKey, ActionKeys.UtilityView);
  assert.equal(stickersCmd.actionKey, ActionKeys.UtilityView);
  assert.equal(emojisCmd.isPublic, true);
  assert.equal(stickersCmd.isPublic, true);

  // Check poll input_style option choices
  const pollJson = pollCmd.data.toJSON();
  const createSub = pollJson.options.find((o) => o.name === 'create');
  assert.ok(createSub);
  const inputStyleOpt = createSub.options.find((o) => o.name === 'input_style');
  assert.ok(inputStyleOpt);
  assert.equal(inputStyleOpt.choices.length, 3);
});
