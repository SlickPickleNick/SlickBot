const test = require('node:test');
const assert = require('node:assert/strict');
const {
  StarboardService,
  DEFAULT_STARBOARD_CONFIG,
  getStarTier,
  normalizeEmoji,
  matchStarEmoji
} = require('../../src/modules/community/starboardService');
const {
  buildStarboardPanel,
  buildStarboardThresholdModal,
  buildStarboardEmojiModal
} = require('../../src/modules/community/starboardUi');
const { MockDatabase } = require('../helpers/mockDb');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const starboardCmd = require('../../src/commands/starboard');
const { commands, commandMap } = require('../../src/commands');
const { validateCommandPayloads } = require('../../src/utils/commandValidation');
const { CustomIds } = require('../../src/modules/ui/customIds');

const mockDb = new MockDatabase();

test('Starboard / Community Hall of Fame Engine Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
    new StarboardService().clearAllCaches();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  const guildId = '100000000000000001';
  const showcaseChannelId = '200000000000000001';
  const generalChannelId = '200000000000000002';
  const authorUserId = '300000000000000001';

  await t.test('getConfig returns default settings when no record exists', async () => {
    const service = new StarboardService();
    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({ rows: [], rowCount: 0 }));

    const config = await service.getConfig(guildId);
    assert.equal(config.guild_id, guildId);
    assert.equal(config.enabled, true);
    assert.equal(config.channel_id, null);
    assert.equal(config.star_threshold, 3);
    assert.equal(config.star_emoji, '⭐');
    assert.equal(config.allow_self_star, false);
    assert.equal(config.allow_nsfw, false);
    assert.deepEqual(config.ignored_channels, []);
    assert.deepEqual(config.ignored_roles, []);
  });

  await t.test('upsertConfig updates settings and syncs cache', async () => {
    const service = new StarboardService();
    let savedRow = null;

    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({
      rows: savedRow ? [savedRow] : [],
      rowCount: savedRow ? 1 : 0
    }));

    mockDb.addHandler('INSERT INTO starboard_configs', (sql, params) => {
      savedRow = {
        guild_id: params[0],
        enabled: params[1],
        channel_id: params[2],
        star_threshold: params[3],
        star_emoji: params[4],
        allow_self_star: params[5],
        allow_nsfw: params[6],
        ignored_channels: params[7],
        ignored_roles: params[8],
        color: params[9]
      };
      return { rows: [savedRow], rowCount: 1 };
    });

    const updated = await service.upsertConfig(guildId, {
      channel_id: showcaseChannelId,
      star_threshold: 5,
      star_emoji: '🌟',
      allow_self_star: true,
      allow_nsfw: true,
      ignored_channels: ['999999999999999999'],
      ignored_roles: ['888888888888888888']
    });

    assert.equal(updated.channel_id, showcaseChannelId);
    assert.equal(updated.star_threshold, 5);
    assert.equal(updated.star_emoji, '🌟');
    assert.equal(updated.allow_self_star, true);
    assert.equal(updated.allow_nsfw, true);
    assert.deepEqual(updated.ignored_channels, ['999999999999999999']);
    assert.deepEqual(updated.ignored_roles, ['888888888888888888']);

    const cached = await service.getConfig(guildId);
    assert.equal(cached.star_threshold, 5);
    assert.equal(cached.star_emoji, '🌟');
  });

  await t.test('resetConfig clears database records and cache', async () => {
    const service = new StarboardService();
    let deletedConfig = false;
    let deletedEntries = false;

    mockDb.addHandler('DELETE FROM starboard_configs', () => {
      deletedConfig = true;
      return { rowCount: 1 };
    });
    mockDb.addHandler('DELETE FROM starboard_entries', () => {
      deletedEntries = true;
      return { rowCount: 5 };
    });

    const resetResult = await service.resetConfig(guildId);
    assert.equal(deletedConfig, true);
    assert.equal(deletedEntries, true);
    assert.equal(resetResult.star_threshold, 3);
    assert.equal(resetResult.channel_id, null);
  });

  await t.test('getStarTier, normalizeEmoji, and matchStarEmoji utility helpers', () => {
    // Star tier badges
    assert.equal(getStarTier(3, '⭐'), '⭐ **3**');
    assert.equal(getStarTier(5, '⭐'), '🌟 **5**');
    assert.equal(getStarTier(10, '⭐'), '💫 **10**');
    assert.equal(getStarTier(20, '⭐'), '✨ **20**');
    assert.equal(getStarTier(50, '⭐'), '🏆 **50**');
    assert.equal(getStarTier(7, '🔥'), '🔥 **7**');

    // Emoji normalization
    assert.equal(normalizeEmoji('⭐'), '⭐');
    assert.equal(normalizeEmoji({ name: 'custom_star' }), 'custom_star');

    // Matching
    assert.equal(matchStarEmoji('⭐', '⭐'), true);
    assert.equal(matchStarEmoji({ name: '⭐' }, '⭐'), true);
    assert.equal(matchStarEmoji({ name: 'custom_star', id: '123456' }, '<:custom_star:123456>'), true);
    assert.equal(matchStarEmoji({ name: 'heart' }, '⭐'), false);
  });

  await t.test('buildStarboardMessagePayload constructs embeds with jump link and media', () => {
    const service = new StarboardService();
    const mockMessage = {
      id: 'msg-12345',
      guildId,
      channelId: generalChannelId,
      content: 'Look at this awesome highlight!',
      author: {
        id: authorUserId,
        tag: 'AwesomeUser#0001',
        username: 'AwesomeUser',
        displayAvatarURL: () => 'https://cdn.discord.com/avatars/1/abc.png'
      },
      attachments: new Map([
        ['att-1', { url: 'https://cdn.discord.com/attachments/1/pic.png', name: 'pic.png', contentType: 'image/png' }]
      ]),
      createdAt: new Date('2026-08-23T12:00:00Z')
    };

    const payload = service.buildStarboardMessagePayload(mockMessage, 6, {
      color: '#FFA800',
      star_emoji: '⭐'
    });

    assert.equal(payload.content, '🌟 **6** <#200000000000000002>');
    assert.equal(payload.embeds.length, 1);
    const embed = payload.embeds[0].data;
    assert.equal(embed.author.name, 'AwesomeUser#0001');
    assert.equal(embed.description, 'Look at this awesome highlight!');
    assert.equal(embed.image.url, 'https://cdn.discord.com/attachments/1/pic.png');
    assert.match(embed.fields[0].value, /https:\/\/discord\.com\/channels\/100000000000000001\/200000000000000002\/msg-12345/i);
    assert.equal(embed.footer.text, 'Message ID: msg-12345');
  });

  await t.test('countQualifyingStars filters bots and respects allow_self_star', async () => {
    const service = new StarboardService();
    const mockReaction = {
      count: 4,
      message: {
        author: { id: authorUserId }
      },
      users: {
        fetch: async () =>
          new Map([
            ['user-1', { id: 'user-1', bot: false }],
            ['user-2', { id: 'user-2', bot: false }],
            ['user-bot', { id: 'user-bot', bot: true }],
            [authorUserId, { id: authorUserId, bot: false }]
          ])
      }
    };

    // 1. allow_self_star = false: ignores bot and author
    const countNoSelf = await service.countQualifyingStars(mockReaction, { allow_self_star: false });
    assert.equal(countNoSelf, 2);

    // 2. allow_self_star = true: ignores bot, includes author
    const countWithSelf = await service.countQualifyingStars(mockReaction, { allow_self_star: true });
    assert.equal(countWithSelf, 3);
  });

  await t.test('handleReactionAdd pins new message to starboard channel and logs event', async () => {
    const service = new StarboardService();
    let postedPayload = null;
    let insertedEntry = null;
    let logEvent = null;

    mockDb.addHandler('SELECT enabled FROM module_configs', () => ({
      rows: [{ module_key: ModuleKeys.STARBOARD, enabled: true }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        channel_id: showcaseChannelId,
        star_threshold: 3,
        star_emoji: '⭐',
        allow_self_star: false,
        allow_nsfw: false,
        ignored_channels: [],
        ignored_roles: []
      }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_entries', () => ({ rows: [], rowCount: 0 }));
    mockDb.addHandler('INSERT INTO starboard_entries', (sql, params) => {
      insertedEntry = {
        guild_id: params[0],
        original_channel_id: params[1],
        original_message_id: params[2],
        starboard_message_id: params[3],
        author_user_id: params[4],
        star_count: params[6]
      };
      return { rows: [insertedEntry], rowCount: 1 };
    });

    const mockStarboardChannel = {
      id: showcaseChannelId,
      isTextBased: () => true,
      send: async (p) => {
        postedPayload = p;
        return { id: 'starboard-msg-999' };
      }
    };

    const mockMessage = {
      id: 'msg-orig-100',
      guildId,
      channelId: generalChannelId,
      content: 'A truly memorable community quote!',
      author: { id: authorUserId, tag: 'Author#1111', username: 'Author' },
      channel: { id: generalChannelId, nsfw: false },
      guild: {
        id: guildId,
        channels: {
          cache: new Map([[showcaseChannelId, mockStarboardChannel]]),
          fetch: async () => mockStarboardChannel
        }
      }
    };

    const mockReaction = {
      emoji: { name: '⭐' },
      message: mockMessage,
      users: {
        fetch: async () =>
          new Map([
            ['user-1', { id: 'user-1', bot: false }],
            ['user-2', { id: 'user-2', bot: false }],
            ['user-3', { id: 'user-3', bot: false }]
          ])
      }
    };

    const mockLogger = {
      log: async (event) => { logEvent = event; }
    };

    await service.handleReactionAdd(mockReaction, { id: 'user-1', bot: false }, {}, mockLogger);

    assert.ok(postedPayload);
    assert.match(postedPayload.content, /⭐ \*\*3\*\* <#200000000000000002>/i);
    assert.ok(insertedEntry);
    assert.equal(insertedEntry.starboard_message_id, 'starboard-msg-999');
    assert.equal(insertedEntry.star_count, 3);
    assert.ok(logEvent);
    assert.equal(logEvent.eventKey, 'starboard-pinned');
  });

  await t.test('handleReactionAdd updates existing starboard post in-place', async () => {
    const service = new StarboardService();
    let editedPayload = null;
    let updatedEntry = null;

    mockDb.addHandler('SELECT enabled FROM module_configs', () => ({
      rows: [{ module_key: ModuleKeys.STARBOARD, enabled: true }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        channel_id: showcaseChannelId,
        star_threshold: 3,
        star_emoji: '⭐'
      }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_entries', () => ({
      rows: [{ id: 42, starboard_message_id: 'starboard-msg-999', star_count: 3 }],
      rowCount: 1
    }));
    mockDb.addHandler('UPDATE starboard_entries', (sql, params) => {
      updatedEntry = { star_count: params[0], id: params[1] };
      return { rowCount: 1 };
    });

    const mockStarboardMsg = {
      id: 'starboard-msg-999',
      edit: async (p) => { editedPayload = p; }
    };

    const mockStarboardChannel = {
      id: showcaseChannelId,
      isTextBased: () => true,
      messages: {
        fetch: async () => mockStarboardMsg
      }
    };

    const mockMessage = {
      id: 'msg-orig-100',
      guildId,
      channelId: generalChannelId,
      content: 'A truly memorable community quote!',
      author: { id: authorUserId, tag: 'Author#1111' },
      channel: { id: generalChannelId, nsfw: false },
      guild: {
        id: guildId,
        channels: {
          cache: new Map([[showcaseChannelId, mockStarboardChannel]]),
          fetch: async () => mockStarboardChannel
        }
      }
    };

    const mockReaction = {
      emoji: { name: '⭐' },
      message: mockMessage,
      users: {
        fetch: async () =>
          new Map([
            ['user-1', { id: 'user-1', bot: false }],
            ['user-2', { id: 'user-2', bot: false }],
            ['user-3', { id: 'user-3', bot: false }],
            ['user-4', { id: 'user-4', bot: false }],
            ['user-5', { id: 'user-5', bot: false }]
          ])
      }
    };

    await service.handleReactionAdd(mockReaction, { id: 'user-4', bot: false }, {}, {});

    assert.ok(editedPayload);
    assert.match(editedPayload.content, /🌟 \*\*5\*\* <#200000000000000002>/i);
    assert.ok(updatedEntry);
    assert.equal(updatedEntry.star_count, 5);
  });

  await t.test('handleReactionRemove deletes starboard post if stars drop below threshold', async () => {
    const service = new StarboardService();
    let deletedStarboardMsg = false;
    let deletedEntry = false;

    mockDb.addHandler('SELECT enabled FROM module_configs', () => ({
      rows: [{ module_key: ModuleKeys.STARBOARD, enabled: true }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        channel_id: showcaseChannelId,
        star_threshold: 3,
        star_emoji: '⭐'
      }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_entries', () => ({
      rows: [{ id: 42, starboard_message_id: 'starboard-msg-999', star_count: 3 }],
      rowCount: 1
    }));
    mockDb.addHandler('DELETE FROM starboard_entries', () => {
      deletedEntry = true;
      return { rowCount: 1 };
    });

    const mockStarboardMsg = {
      id: 'starboard-msg-999',
      delete: async () => { deletedStarboardMsg = true; }
    };

    const mockStarboardChannel = {
      id: showcaseChannelId,
      isTextBased: () => true,
      messages: {
        fetch: async () => mockStarboardMsg
      }
    };

    const mockMessage = {
      id: 'msg-orig-100',
      guildId,
      channelId: generalChannelId,
      content: 'A quote losing stars',
      author: { id: authorUserId, tag: 'Author#1111' },
      channel: { id: generalChannelId },
      guild: {
        id: guildId,
        channels: {
          cache: new Map([[showcaseChannelId, mockStarboardChannel]]),
          fetch: async () => mockStarboardChannel
        }
      }
    };

    const mockReaction = {
      emoji: { name: '⭐' },
      message: mockMessage,
      users: {
        fetch: async () =>
          new Map([
            ['user-1', { id: 'user-1', bot: false }],
            ['user-2', { id: 'user-2', bot: false }]
          ])
      }
    };

    await service.handleReactionRemove(mockReaction, { id: 'user-3', bot: false }, {}, {});

    assert.equal(deletedStarboardMsg, true);
    assert.equal(deletedEntry, true);
  });

  await t.test('handleMessageDelete deletes showcase post when original message is deleted', async () => {
    const service = new StarboardService();
    let deletedStarboardMsg = false;
    let deletedEntry = false;

    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({
      rows: [{ guild_id: guildId, channel_id: showcaseChannelId }],
      rowCount: 1
    }));
    mockDb.addHandler('SELECT * FROM starboard_entries', () => ({
      rows: [{ id: 42, original_message_id: 'msg-orig-100', starboard_message_id: 'starboard-msg-999' }],
      rowCount: 1
    }));
    mockDb.addHandler('DELETE FROM starboard_entries', () => {
      deletedEntry = true;
      return { rowCount: 1 };
    });

    const mockStarboardMsg = {
      id: 'starboard-msg-999',
      delete: async () => { deletedStarboardMsg = true; }
    };

    const mockStarboardChannel = {
      id: showcaseChannelId,
      messages: {
        fetch: async () => mockStarboardMsg
      }
    };

    const mockMessage = {
      id: 'msg-orig-100',
      guild: {
        id: guildId,
        channels: {
          cache: new Map([[showcaseChannelId, mockStarboardChannel]])
        }
      }
    };

    await service.handleMessageDelete(mockMessage, {}, {});

    assert.equal(deletedStarboardMsg, true);
    assert.equal(deletedEntry, true);
  });

  await t.test('buildStarboardPanel renders OVERVIEW, EXCLUSIONS, and LEADERBOARD tabs', async () => {
    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({
      rows: [{
        guild_id: guildId,
        enabled: true,
        channel_id: showcaseChannelId,
        star_threshold: 4,
        star_emoji: '⭐',
        allow_self_star: false,
        allow_nsfw: false,
        ignored_channels: ['chan-1'],
        ignored_roles: ['role-1']
      }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM starboard_entries', () => ({
      rows: [
        {
          id: 1,
          guild_id: guildId,
          original_channel_id: generalChannelId,
          original_message_id: 'msg-1',
          star_count: 12,
          author_user_id: authorUserId,
          content: 'Legendary server quote'
        }
      ],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT author_user_id, author_tag', () => ({
      rows: [
        { author_user_id: authorUserId, author_tag: 'TopAuthor#0001', total_stars: 12, post_count: 1 }
      ],
      rowCount: 1
    }));

    // 1. Overview tab
    const overviewPanel = await buildStarboardPanel(guildId, 'OVERVIEW');
    assert.equal(overviewPanel.embeds.length, 1);
    assert.match(overviewPanel.embeds[0].data.title, /Starboard Control Center/i);
    assert.match(overviewPanel.embeds[0].data.fields[1].value, /<#200000000000000001>/i);
    assert.equal(overviewPanel.components.length, 3); // Nav + ChannelSelect + Actions

    // 2. Exclusions tab
    const exclusionsPanel = await buildStarboardPanel(guildId, 'EXCLUSIONS');
    assert.match(exclusionsPanel.embeds[0].data.title, /Channel & Role Exclusions/i);
    assert.equal(exclusionsPanel.components.length, 3); // Nav + ChannelExempt + RoleExempt

    // 3. Leaderboard tab
    const leaderboardPanel = await buildStarboardPanel(guildId, 'LEADERBOARD');
    assert.match(leaderboardPanel.embeds[0].data.title, /Community Hall of Fame/i);
    assert.match(leaderboardPanel.embeds[0].data.fields[0].value, /Legendary server quote/i);
  });

  await t.test('buildStarboardThresholdModal and buildStarboardEmojiModal construct valid modals', () => {
    const thresholdModal = buildStarboardThresholdModal({ star_threshold: 5 });
    assert.equal(thresholdModal.data.title, 'Tune Starboard Star Threshold');
    assert.equal(thresholdModal.components.length, 1);

    const emojiModal = buildStarboardEmojiModal({ star_emoji: '🌟' });
    assert.equal(emojiModal.data.title, 'Set Starboard Reaction Emoji');
    assert.equal(emojiModal.components.length, 1);
  });

  await t.test('/starboard command metadata, action keys, and validation', () => {
    assert.equal(starboardCmd.data.name, 'starboard');
    assert.equal(starboardCmd.moduleKey, ModuleKeys.STARBOARD);

    const makeInteraction = (subcommand) => ({
      options: { getSubcommand: () => subcommand }
    });

    assert.equal(starboardCmd.getActionKey(makeInteraction('leaderboard')), ActionKeys.StarboardView);
    assert.equal(starboardCmd.getActionKey(makeInteraction('reset')), ActionKeys.StarboardReset);
    assert.equal(starboardCmd.getActionKey(makeInteraction('setup')), ActionKeys.StarboardManage);
    assert.equal(starboardCmd.getActionKey(makeInteraction('manager')), ActionKeys.StarboardManage);
    assert.equal(starboardCmd.getActionKey(makeInteraction('set-channel')), ActionKeys.StarboardManage);
    assert.equal(starboardCmd.getActionKey(makeInteraction('set-threshold')), ActionKeys.StarboardManage);
    assert.equal(starboardCmd.getActionKey(makeInteraction('set-emoji')), ActionKeys.StarboardManage);

    // Command registry export
    assert.equal(commandMap.has('starboard'), true);

    const payloads = commands.map((c) => c.data.toJSON());
    const errors = validateCommandPayloads(payloads);
    assert.deepEqual(errors, []);
  });

  await t.test('/starboard command execution for setup, set-channel, set-threshold, set-emoji', async () => {
    let replyPayload = null;
    let savedUpdates = null;

    mockDb.addHandler('SELECT * FROM starboard_configs', () => ({ rows: [], rowCount: 0 }));
    mockDb.addHandler('INSERT INTO starboard_configs', (sql, params) => {
      savedUpdates = { channel_id: params[2], star_threshold: params[3], star_emoji: params[4] };
      return { rows: [savedUpdates], rowCount: 1 };
    });

    const mockChannel = { id: showcaseChannelId, name: 'starboard' };
    const mockInteraction = {
      guildId,
      user: { id: 'mod-1', tag: 'Mod#0001' },
      options: {
        getSubcommand: () => 'setup',
        getChannel: () => mockChannel,
        getInteger: (name) => (name === 'threshold' ? 5 : null),
        getString: (name) => (name === 'emoji' ? '🌟' : null),
        getBoolean: () => null
      },
      reply: async (payload) => { replyPayload = payload; }
    };

    const ctx = {
      logger: { log: async () => {} }
    };

    await starboardCmd.execute(mockInteraction, ctx);

    assert.ok(replyPayload);
    assert.match(replyPayload.embeds[0].data.title, /Starboard Configured/i);
    assert.equal(savedUpdates.channel_id, showcaseChannelId);
    assert.equal(savedUpdates.star_threshold, 5);
    assert.equal(savedUpdates.star_emoji, '🌟');
  });

  await t.test('Setup Center getModuleStatus evaluates STARBOARD readiness', async () => {
    const { getModuleStatus } = require('../../src/modules/ui/panels');

    // 1. Unconfigured -> NEEDS_CONFIG
    mockDb.addHandler('SELECT enabled, channel_id, star_threshold, star_emoji FROM starboard_configs', () => ({
      rows: [],
      rowCount: 0
    }));
    const statusUnconfigured = await getModuleStatus(guildId, { module_key: ModuleKeys.STARBOARD, enabled: true });
    assert.equal(statusUnconfigured.state, 'NEEDS_CONFIG');

    // 2. Configured -> READY
    mockDb.addHandler('SELECT enabled, channel_id, star_threshold, star_emoji FROM starboard_configs', () => ({
      rows: [{ enabled: true, channel_id: showcaseChannelId, star_threshold: 4, star_emoji: '⭐' }],
      rowCount: 1
    }));
    const statusReady = await getModuleStatus(guildId, { module_key: ModuleKeys.STARBOARD, enabled: true });
    assert.equal(statusReady.state, 'READY');
    assert.match(statusReady.note, /Threshold: 4 ⭐/i);

    // 3. Disabled -> DISABLED
    const statusDisabled = await getModuleStatus(guildId, { module_key: ModuleKeys.STARBOARD, enabled: false });
    assert.equal(statusDisabled.state, 'DISABLED');
  });

  await t.test('Onboarding step starboard_channel execution', async () => {
    const { ONBOARDING_STEPS } = require('../../src/modules/onboarding/onboardingService');
    const step = ONBOARDING_STEPS[ModuleKeys.STARBOARD][0];
    assert.equal(step.id, 'starboard_channel');

    let savedChannelId = null;
    mockDb.addHandler('INSERT INTO starboard_configs', (sql, params) => {
      savedChannelId = params[1];
      return { rowCount: 1 };
    });

    const mockGuild = {
      id: guildId,
      channels: {
        cache: new Map([
          ['chan-star', { id: 'chan-star', name: 'starboard' }]
        ]),
        create: async (opts) => ({ id: 'chan-created-star', name: opts.name })
      }
    };

    // applyDefault picks up existing starboard channel
    const defaultRes = await step.applyDefault(mockGuild);
    assert.match(defaultRes.result, /Assigned existing <#chan-star>/i);
    assert.equal(savedChannelId, 'chan-star');

    // applySelection applies explicit selection
    await step.applySelection(mockGuild, 'chan-custom-99');
    assert.equal(savedChannelId, 'chan-custom-99');

    // autoCreate creates #starboard
    const autoRes = await step.autoCreate(mockGuild);
    assert.match(autoRes.created, /starboard/i);
    assert.equal(savedChannelId, 'chan-created-star');
  });
});
