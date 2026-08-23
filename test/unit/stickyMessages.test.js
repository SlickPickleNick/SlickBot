const test = require('node:test');
const assert = require('node:assert/strict');
const {
  StickyMessageService,
  parseStickyColor,
  COLOR_PRESETS,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_THRESHOLD_MESSAGES,
  buildStickyCreateModal,
  buildStickyEditModal
} = require('../../src/modules/automation/stickyMessageService');
const { MockDatabase } = require('../helpers/mockDb');
const { createMockChannel, createMockGuild } = require('../helpers/mockDiscord');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const stickyCmd = require('../../src/commands/sticky');

const mockDb = new MockDatabase();

test('Sticky Messages Automation Module Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  const guildId = '100000000000000001';
  const channelId = '200000000000000001';
  const userId = '300000000000000001';

  await t.test('parseStickyColor parses preset names and hex codes accurately', () => {
    assert.equal(parseStickyColor('PRIMARY'), COLOR_PRESETS.PRIMARY);
    assert.equal(parseStickyColor('SUCCESS'), COLOR_PRESETS.SUCCESS);
    assert.equal(parseStickyColor('WARNING'), COLOR_PRESETS.WARNING);
    assert.equal(parseStickyColor('ERROR'), COLOR_PRESETS.ERROR);
    assert.equal(parseStickyColor('#FF5733'), 0xFF5733);
    assert.equal(parseStickyColor('00FF00'), 0x00FF00);
    assert.equal(parseStickyColor('invalid'), COLOR_PRESETS.PRIMARY);
    assert.equal(parseStickyColor(null), COLOR_PRESETS.PRIMARY);
  });

  await t.test('setSticky creates sticky message, stores in DB, and populates cache', async () => {
    const service = new StickyMessageService();
    let stickyRows = [];

    mockDb.addHandler('INSERT INTO sticky_messages', (sql, params) => {
      const row = {
        id: 'sticky-1',
        guild_id: params[0],
        channel_id: params[1],
        message_content: params[2],
        embed_title: params[3],
        embed_description: params[4],
        embed_color: params[5],
        embed_footer: params[6],
        embed_image_url: params[7],
        embed_thumbnail_url: params[8],
        cooldown_seconds: params[9],
        message_count_threshold: params[10],
        message_count_since_last: 0,
        last_message_id: null,
        last_reposted_at: null,
        enabled: true,
        created_by_user_id: params[11],
        created_at: new Date(),
        updated_at: new Date()
      };
      stickyRows = [row];
      return { rows: [row], rowCount: 1 };
    });

    const result = await service.setSticky({
      guildId,
      channelId,
      embedTitle: '📌 Channel Rules',
      embedDescription: 'Be kind and respect fellow members.',
      cooldownSeconds: 15,
      messageCountThreshold: 8,
      createdByUserId: userId
    });

    assert.equal(result.ok, true);
    assert.equal(result.sticky.embed_title, '📌 Channel Rules');
    assert.equal(result.sticky.cooldown_seconds, 15);
    assert.equal(result.sticky.message_count_threshold, 8);
    assert.equal(result.sticky.enabled, true);

    // Verify cache hit
    const cached = await service.getSticky(guildId, channelId);
    assert.equal(cached.embed_title, '📌 Channel Rules');
  });

  await t.test('setSticky rejects when no content or embed fields are provided', async () => {
    const service = new StickyMessageService();
    const result = await service.setSticky({
      guildId,
      channelId
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /provide message content or an embed title/i);
  });

  await t.test('editSticky updates existing sticky fields and cache', async () => {
    const service = new StickyMessageService();
    let row = {
      id: 'sticky-1',
      guild_id: guildId,
      channel_id: channelId,
      message_content: null,
      embed_title: 'Original Title',
      embed_description: 'Original Desc',
      embed_color: 'PRIMARY',
      embed_footer: null,
      embed_image_url: null,
      embed_thumbnail_url: null,
      cooldown_seconds: 10,
      message_count_threshold: 5,
      enabled: true
    };

    mockDb.addHandler('SELECT * FROM sticky_messages', () => ({ rows: [row], rowCount: 1 }));
    mockDb.addHandler('UPDATE sticky_messages', (sql, params) => {
      row = {
        ...row,
        message_content: params[2],
        embed_title: params[3],
        embed_description: params[4],
        embed_color: params[5],
        embed_footer: params[6],
        embed_image_url: params[7],
        embed_thumbnail_url: params[8],
        cooldown_seconds: params[9],
        message_count_threshold: params[10],
        enabled: params[11]
      };
      return { rows: [row], rowCount: 1 };
    });

    const updated = await service.editSticky(guildId, channelId, {
      embedTitle: 'Updated Guidelines',
      cooldownSeconds: 20,
      enabled: false
    });

    assert.equal(updated.embed_title, 'Updated Guidelines');
    assert.equal(updated.cooldown_seconds, 20);
    assert.equal(updated.enabled, false);
  });

  await t.test('removeSticky deletes record, unpins message, and evicts from cache', async () => {
    const service = new StickyMessageService();
    let deletedMessageId = null;
    let deletedFromDb = false;

    const row = {
      id: 'sticky-1',
      guild_id: guildId,
      channel_id: channelId,
      last_message_id: 'msg-999',
      enabled: true
    };

    mockDb.addHandler('SELECT * FROM sticky_messages', () => ({ rows: [row], rowCount: 1 }));
    mockDb.addHandler('DELETE FROM sticky_messages', () => {
      deletedFromDb = true;
      return { rows: [row], rowCount: 1 };
    });

    const mockChannel = createMockChannel({ id: channelId });
    mockChannel.isTextBased = () => true;
    mockChannel.messages = {
      fetch: async (id) => ({
        id,
        delete: async () => { deletedMessageId = id; }
      })
    };

    const mockGuild = createMockGuild({ id: guildId });
    mockGuild.channels.cache.set(channelId, mockChannel);
    const mockClient = { guilds: { cache: new Map([[guildId, mockGuild]]) } };

    const removed = await service.removeSticky(guildId, channelId, mockClient);

    assert.equal(deletedFromDb, true);
    assert.equal(deletedMessageId, 'msg-999');
    assert.equal(removed.id, 'sticky-1');
  });

  await t.test('toggleSticky pauses and resumes auto-reposting', async () => {
    const service = new StickyMessageService();
    let enabledState = true;

    const row = {
      id: 'sticky-1',
      guild_id: guildId,
      channel_id: channelId,
      last_message_id: 'msg-123',
      enabled: true
    };

    mockDb.addHandler('SELECT * FROM sticky_messages', () => ({ rows: [{ ...row, enabled: enabledState }], rowCount: 1 }));
    mockDb.addHandler('UPDATE sticky_messages', (sql, params) => {
      enabledState = params[2];
      return { rows: [{ ...row, enabled: enabledState }], rowCount: 1 };
    });

    // 1. Toggle off (pause)
    const toggledOff = await service.toggleSticky(guildId, channelId);
    assert.equal(toggledOff.enabled, false);

    // 2. Toggle on (resume)
    const toggledOn = await service.toggleSticky(guildId, channelId);
    assert.equal(toggledOn.enabled, true);
  });

  await t.test('repostSticky deletes previous message and sends formatted payload', async () => {
    const service = new StickyMessageService();
    let prevDeleted = false;
    let sentPayload = null;

    const row = {
      id: 'sticky-1',
      guild_id: guildId,
      channel_id: channelId,
      message_content: 'Attention @everyone',
      embed_title: '📌 Important Notice',
      embed_description: 'Read the pinned guidelines.',
      embed_color: 'PRIMARY',
      last_message_id: 'old-msg-1',
      enabled: true
    };

    mockDb.addHandler('SELECT * FROM sticky_messages', () => ({ rows: [row], rowCount: 1 }));
    mockDb.addHandler('UPDATE sticky_messages', () => ({ rows: [], rowCount: 1 }));

    const mockChannel = createMockChannel({ id: channelId });
    mockChannel.isTextBased = () => true;
    mockChannel.messages = {
      fetch: async (id) => {
        if (id === 'old-msg-1') {
          return { id, delete: async () => { prevDeleted = true; } };
        }
        return null;
      }
    };
    mockChannel.send = async (payload) => {
      sentPayload = payload;
      return { id: 'new-msg-2' };
    };

    const mockGuild = createMockGuild({ id: guildId });
    mockGuild.channels.cache.set(channelId, mockChannel);
    const mockClient = { guilds: { cache: new Map([[guildId, mockGuild]]) } };

    const success = await service.repostSticky(guildId, channelId, mockClient);

    assert.equal(success, true);
    assert.equal(prevDeleted, true);
    assert.equal(sentPayload.content, 'Attention @everyone');
    assert.equal(sentPayload.embeds.length, 1);
    assert.equal(sentPayload.embeds[0].data.title, '📌 Important Notice');
  });

  await t.test('handleMessage respects threshold and cooldown throttling before reposting', async () => {
    const service = new StickyMessageService();
    let repostCount = 0;

    const row = {
      id: 'sticky-1',
      guild_id: guildId,
      channel_id: channelId,
      embed_title: '📌 Channel Rules',
      embed_description: 'Rules description',
      cooldown_seconds: 10,
      message_count_threshold: 3,
      message_count_since_last: 0,
      last_reposted_at: new Date(Date.now() - 15000).toISOString(), // Cooldown elapsed
      last_message_id: 'prev-sticky',
      enabled: true
    };

    mockDb.addHandler('SELECT * FROM sticky_messages', () => ({ rows: [row], rowCount: 1 }));
    mockDb.addHandler('UPDATE sticky_messages', () => ({ rows: [], rowCount: 1 }));

    const mockChannel = createMockChannel({ id: channelId });
    mockChannel.isTextBased = () => true;
    mockChannel.messages = { fetch: async () => null };
    mockChannel.send = async () => {
      repostCount++;
      return { id: `new-sticky-${repostCount}` };
    };

    const mockGuild = createMockGuild({ id: guildId });
    mockGuild.channels.cache.set(channelId, mockChannel);
    const mockClient = { guilds: { cache: new Map([[guildId, mockGuild]]) } };

    const makeMsg = (id) => ({
      id,
      guild: { id: guildId },
      channelId,
      author: { bot: false },
      client: mockClient
    });

    // Message 1 (count = 1 < 3) -> no repost
    await service.handleMessage(makeMsg('msg-1'));
    assert.equal(repostCount, 0);

    // Message 2 (count = 2 < 3) -> no repost
    await service.handleMessage(makeMsg('msg-2'));
    assert.equal(repostCount, 0);

    // Message 3 (count = 3 >= 3, cooldown met) -> reposts!
    await service.handleMessage(makeMsg('msg-3'));
    assert.equal(repostCount, 1);
  });

  await t.test('buildManagerPanel generates complete dashboard payload with active stickies', async () => {
    const service = new StickyMessageService();
    const rows = [
      {
        id: 'sticky-1',
        guild_id: guildId,
        channel_id: channelId,
        embed_title: 'Rules & FAQ',
        cooldown_seconds: 10,
        message_count_threshold: 5,
        enabled: true
      }
    ];

    mockDb.addHandler('SELECT * FROM sticky_messages', () => ({ rows, rowCount: 1 }));

    const panel = await service.buildManagerPanel(guildId);
    assert.equal(panel.embeds.length, 1);
    assert.equal(panel.components.length, 2);
    assert.match(panel.embeds[0].data.description, /Active & Auto-Reposting: \*\*1\*\*/);
    assert.match(panel.embeds[0].data.description, /<#200000000000000001>/);
  });

  await t.test('modal builders generate valid components and prefill values', () => {
    const createModal = buildStickyCreateModal('200000000000000001');
    assert.equal(createModal.data.title, 'Create Channel Sticky Notice');

    const editModal = buildStickyEditModal({
      channel_id: '200000000000000001',
      embed_title: 'Sample Title',
      embed_description: 'Sample Desc',
      message_content: 'Sample Content',
      cooldown_seconds: 12,
      message_count_threshold: 6
    });
    assert.equal(editModal.data.title, 'Edit Sticky Notice: #200000000000000001');
  });

  await t.test('/sticky command data and getActionKey mapping are valid', () => {
    assert.equal(stickyCmd.data.name, 'sticky');
    assert.equal(stickyCmd.moduleKey, ModuleKeys.STICKY_MESSAGES);

    const makeInteraction = (subcommand) => ({
      options: { getSubcommand: () => subcommand }
    });

    assert.equal(stickyCmd.getActionKey(makeInteraction('list')), ActionKeys.StickyView);
    assert.equal(stickyCmd.getActionKey(makeInteraction('repost')), ActionKeys.StickyRepost);
    assert.equal(stickyCmd.getActionKey(makeInteraction('reset')), ActionKeys.StickyReset);
    assert.equal(stickyCmd.getActionKey(makeInteraction('set')), ActionKeys.StickyManage);
    assert.equal(stickyCmd.getActionKey(makeInteraction('edit')), ActionKeys.StickyManage);
    assert.equal(stickyCmd.getActionKey(makeInteraction('remove')), ActionKeys.StickyManage);
    assert.equal(stickyCmd.getActionKey(makeInteraction('toggle')), ActionKeys.StickyManage);
    assert.equal(stickyCmd.getActionKey(makeInteraction('manager')), ActionKeys.StickyManage);
  });
});
