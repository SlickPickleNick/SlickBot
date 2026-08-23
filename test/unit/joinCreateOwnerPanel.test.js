const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const { JoinCreateService } = require('../../src/modules/voice/joinCreateService');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const joinCreateCmd = require('../../src/commands/joinCreate');
const vcCmd = require('../../src/commands/vc');
const { commands, commandMap } = require('../../src/commands');
const { validateCommandPayloads } = require('../../src/utils/commandValidation');
const { CustomIds } = require('../../src/modules/ui/customIds');

const mockDb = new MockDatabase();

test('Join-to-Create Temporary Voice Owner Panel Tests', async (t) => {
  let service;
  const guildId = '100000000000000001';
  const ownerUserId = '200000000000000001';
  const targetUserId = '300000000000000001';
  const channelId = '400000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new JoinCreateService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  await t.test('Slash command payload validation for joinCreate and vc commands', () => {
    const payload = commands.map((c) => (typeof c.data?.toJSON === 'function' ? c.data.toJSON() : c.data));
    const errors = validateCommandPayloads(payload);
    assert.deepEqual(errors, [], `Validation errors: ${errors.join(', ')}`);
    assert.ok(commandMap.has('join-create'));
    assert.ok(commandMap.has('vc'));
    assert.equal(joinCreateCmd.moduleKey, ModuleKeys.JOIN_TO_CREATE);
    assert.equal(vcCmd.moduleKey, ModuleKeys.JOIN_TO_CREATE);
  });

  await t.test('buildTempControlPayload renders 3 action rows with rich controls and stateful disabled buttons', () => {
    const tempUnlockedVisible = {
      channel_id: channelId,
      name: "Nick's Lounge",
      owner_user_id: ownerUserId,
      locked: false,
      hidden: false,
      user_limit: 5,
      empty_delete_delay_seconds: 30
    };

    const payload1 = service.buildTempControlPayload(tempUnlockedVisible);
    assert.ok(payload1.embeds?.[0]);
    assert.equal(payload1.components.length, 3);

    // Row 1: Access Controls & Personal Menu (Menu, Lock, Unlock, Hide, Unhide)
    const row1Btns = payload1.components[0].components;
    assert.equal(row1Btns.length, 5);
    assert.ok(row1Btns[0].data.custom_id.startsWith(CustomIds.JoinCreateOwnerPanelPrefix));
    assert.equal(row1Btns[1].data.disabled, false); // Lock is active
    assert.equal(row1Btns[2].data.disabled, true);  // Unlock is disabled (already unlocked)
    assert.equal(row1Btns[3].data.disabled, false); // Hide is active
    assert.equal(row1Btns[4].data.disabled, true);  // Unhide is disabled (already visible)

    // Row 2: Room Settings (Rename, Set Limit, Bitrate, Permit, Kick)
    const row2Btns = payload1.components[1].components;
    assert.equal(row2Btns.length, 5);
    assert.ok(row2Btns[0].data.custom_id.startsWith(CustomIds.JoinCreateRenamePrefix));
    assert.ok(row2Btns[1].data.custom_id.startsWith(CustomIds.JoinCreateLimitPrefix));
    assert.ok(row2Btns[2].data.custom_id.startsWith(CustomIds.JoinCreateBitratePrefix));
    assert.ok(row2Btns[3].data.custom_id.startsWith(CustomIds.JoinCreatePermitPrefix));
    assert.ok(row2Btns[4].data.custom_id.startsWith(CustomIds.JoinCreateKickPrefix));

    // Row 3: Moderation & Danger (Claim, Block/Ban, Transfer, Delete Room)
    const row3Btns = payload1.components[2].components;
    assert.equal(row3Btns.length, 4);
    assert.ok(row3Btns[0].data.custom_id.startsWith(CustomIds.JoinCreateClaimPrefix));
    assert.ok(row3Btns[1].data.custom_id.startsWith(CustomIds.JoinCreateBanPrefix));
    assert.ok(row3Btns[2].data.custom_id.startsWith(CustomIds.JoinCreateTransferPrefix));
    assert.ok(row3Btns[3].data.custom_id.startsWith(CustomIds.JoinCreateDeletePrefix));

    // Test locked and hidden state disabled toggles
    const tempLockedHidden = {
      channel_id: channelId,
      name: "Secret Study",
      owner_user_id: ownerUserId,
      locked: true,
      hidden: true,
      user_limit: 0,
      empty_delete_delay_seconds: 45
    };

    const payload2 = service.buildTempControlPayload(tempLockedHidden);
    const row1LockedBtns = payload2.components[0].components;
    assert.equal(row1LockedBtns[1].data.disabled, true);  // Lock disabled (already locked)
    assert.equal(row1LockedBtns[2].data.disabled, false); // Unlock enabled
    assert.equal(row1LockedBtns[3].data.disabled, true);  // Hide disabled (already hidden)
    assert.equal(row1LockedBtns[4].data.disabled, false); // Unhide enabled
  });

  await t.test('buildOwnerPanel returns personal ephemeral dashboard or fallback', async () => {
    let mockChannels = [];
    mockDb.addHandler('FROM join_create_temp_channels', (sql, params) => {
      const found = mockChannels.filter((c) => c.guild_id === params[0] && (c.owner_user_id === params[1] || c.channel_id === params[1]) && c.status === 'ACTIVE');
      return { rows: found, rowCount: found.length };
    });

    const fakeMember = {
      id: ownerUserId,
      user: { id: ownerUserId, tag: 'Nick#0001' },
      guild: {
        id: guildId,
        channels: {
          fetch: async (id) => ({ id, name: "Nick's Voice", send: async () => ({ id: 'msg-1' }) })
        }
      },
      voice: { channelId: null }
    };

    // 1. Not in any active temp voice
    const fallbackPanel = await service.buildOwnerPanel(fakeMember);
    assert.ok(fallbackPanel.embeds?.[0]);
    assert.ok(fallbackPanel.embeds[0].data.title.includes('Temporary Voice Control Dashboard'));

    // 2. Owns an active channel
    mockChannels = [{
      guild_id: guildId,
      channel_id: channelId,
      owner_user_id: ownerUserId,
      status: 'ACTIVE',
      name: "Nick's Voice",
      locked: false,
      hidden: false,
      user_limit: 0
    }];

    const activePanel = await service.buildOwnerPanel(fakeMember, channelId);
    assert.equal(activePanel.components?.length, 3);
    assert.equal(activePanel.content, undefined); // ephemeral shouldn't ping owner
  });

  await t.test('setHidden and setHiddenFromControl toggle channel visibility for @everyone', async () => {
    let tempChannel = {
      guild_id: guildId,
      channel_id: channelId,
      owner_user_id: ownerUserId,
      status: 'ACTIVE',
      name: "Nick's Room",
      hidden: false
    };

    mockDb.addHandler('FROM join_create_temp_channels', () => ({
      rows: [tempChannel],
      rowCount: 1
    }));

    mockDb.addHandler('UPDATE join_create_temp_channels SET hidden', (sql, params) => {
      tempChannel.hidden = params[1];
      return { rows: [tempChannel], rowCount: 1 };
    });

    let editOverwritesCalled = null;
    const fakeChannel = {
      id: channelId,
      name: "Nick's Room",
      permissionOverwrites: {
        edit: async (targetId, permissions) => {
          editOverwritesCalled = { targetId, permissions };
        }
      }
    };

    const fakeMember = {
      id: ownerUserId,
      user: { id: ownerUserId, tag: 'Nick#0001' },
      guild: {
        id: guildId,
        roles: { everyone: { id: 'everyone-role-id' } },
        channels: { fetch: async () => fakeChannel }
      },
      permissions: { has: () => false },
      voice: { channelId }
    };

    // Hide channel
    const res1 = await service.setHiddenFromControl(fakeMember, channelId, true);
    assert.equal(res1.hidden, true);
    assert.deepEqual(editOverwritesCalled, {
      targetId: 'everyone-role-id',
      permissions: { ViewChannel: false }
    });

    // Unhide channel
    const res2 = await service.setHiddenFromControl(fakeMember, channelId, false);
    assert.equal(res2.hidden, false);
    assert.deepEqual(editOverwritesCalled, {
      targetId: 'everyone-role-id',
      permissions: { ViewChannel: null }
    });
  });

  await t.test('setBitrate and setBitrateFromControl adjust audio quality with clamping', async () => {
    const tempChannel = {
      guild_id: guildId,
      channel_id: channelId,
      owner_user_id: ownerUserId,
      status: 'ACTIVE'
    };

    mockDb.addHandler('FROM join_create_temp_channels', () => ({
      rows: [tempChannel],
      rowCount: 1
    }));

    let setBitrateCalled = null;
    const fakeChannel = {
      id: channelId,
      setBitrate: async (bps) => {
        setBitrateCalled = bps;
      }
    };

    const fakeMember = {
      id: ownerUserId,
      user: { id: ownerUserId, tag: 'Nick#0001' },
      guild: {
        id: guildId,
        channels: { fetch: async () => fakeChannel }
      },
      permissions: { has: () => false },
      voice: { channelId }
    };

    // Set 128 kbps (128,000 bps)
    const res = await service.setBitrateFromControl(fakeMember, channelId, 128);
    assert.equal(res.kbps, 128);
    assert.equal(setBitrateCalled, 128000);

    // Test clamp (e.g. 500 kbps clamped to 384)
    const clamped = await service.setBitrateFromControl(fakeMember, channelId, 500);
    assert.equal(clamped.kbps, 384);
    assert.equal(setBitrateCalled, 384000);
  });

  await t.test('kickUser and kickUserFromControl disconnects target member and blocks self-kick', async () => {
    const tempChannel = {
      guild_id: guildId,
      channel_id: channelId,
      owner_user_id: ownerUserId,
      status: 'ACTIVE'
    };

    mockDb.addHandler('FROM join_create_temp_channels', () => ({
      rows: [tempChannel],
      rowCount: 1
    }));

    let disconnectCalled = false;
    const targetMember = {
      id: targetUserId,
      user: { id: targetUserId, tag: 'Troll#9999' },
      voice: {
        channelId,
        disconnect: async () => {
          disconnectCalled = true;
        }
      }
    };

    const ownerMember = {
      id: ownerUserId,
      user: { id: ownerUserId, tag: 'Nick#0001' },
      guild: {
        id: guildId,
        channels: { fetch: async () => ({ id: channelId }) }
      },
      permissions: { has: () => false },
      voice: { channelId }
    };

    // Kick target user
    await service.kickUserFromControl(ownerMember, channelId, targetMember);
    assert.equal(disconnectCalled, true);

    // Self-kick should throw
    await assert.rejects(
      async () => service.kickUserFromControl(ownerMember, channelId, ownerMember),
      /cannot kick yourself/i
    );
  });

  await t.test('banUser and unbanUser manage channel overwrites and member disconnection', async () => {
    const tempChannel = {
      guild_id: guildId,
      channel_id: channelId,
      owner_user_id: ownerUserId,
      status: 'ACTIVE'
    };

    mockDb.addHandler('FROM join_create_temp_channels', () => ({
      rows: [tempChannel],
      rowCount: 1
    }));

    let editOverwritesCalled = null;
    let deleteOverwritesCalled = null;
    let disconnectCalled = false;

    const fakeChannel = {
      id: channelId,
      permissionOverwrites: {
        edit: async (targetId, perms) => {
          editOverwritesCalled = { targetId, perms };
        },
        delete: async (targetId) => {
          deleteOverwritesCalled = targetId;
        }
      }
    };

    const targetMember = {
      id: targetUserId,
      user: { id: targetUserId, tag: 'Disruptive#0001' },
      voice: {
        channelId,
        disconnect: async () => {
          disconnectCalled = true;
        }
      }
    };

    const ownerMember = {
      id: ownerUserId,
      user: { id: ownerUserId, tag: 'Nick#0001' },
      guild: {
        id: guildId,
        channels: { fetch: async () => fakeChannel }
      },
      permissions: { has: () => false },
      voice: { channelId }
    };

    // 1. Ban target
    await service.banUserFromControl(ownerMember, channelId, targetMember);
    assert.equal(disconnectCalled, true);
    assert.deepEqual(editOverwritesCalled, {
      targetId: targetUserId,
      perms: { ViewChannel: false, Connect: false }
    });

    // 2. Unban target
    await service.unbanUserFromControl(ownerMember, channelId, targetMember);
    assert.equal(deleteOverwritesCalled, targetUserId);

    // 3. Self-ban should throw
    await assert.rejects(
      async () => service.banUserFromControl(ownerMember, channelId, ownerMember),
      /cannot block\/ban yourself/i
    );
  });

  await t.test('buildUserSelectPayload supports permit, kick, ban, remove, and transfer', () => {
    for (const action of ['permit', 'kick', 'ban', 'remove', 'transfer']) {
      const payload = service.buildUserSelectPayload(channelId, action);
      assert.ok(payload.embeds?.[0]);
      assert.equal(payload.components.length, 1);
      const menu = payload.components[0].components[0];
      assert.ok(menu.data.custom_id.includes(channelId));
    }
  });

  await t.test('Modals build correctly with pre-filled or placeholder values', () => {
    const bitrateModal = service.buildBitrateModal(channelId, 128);
    assert.equal(bitrateModal.data.title, 'Set Audio Bitrate (kbps)');

    const renameModal = service.buildRenameModal(channelId, 'My Room');
    assert.equal(renameModal.data.title, 'Rename Voice Channel');

    const limitModal = service.buildLimitModal(channelId, 10);
    assert.equal(limitModal.data.title, 'Set User Limit');

    const deleteModal = service.buildDeleteConfirmModal(channelId);
    assert.equal(deleteModal.data.title, 'Delete Voice Channel');
  });

  await t.test('/vc slash command routes actions appropriately', async () => {
    const tempChannel = {
      guild_id: guildId,
      channel_id: channelId,
      owner_user_id: ownerUserId,
      status: 'ACTIVE',
      name: "Nick's VC",
      locked: false,
      hidden: false,
      user_limit: 0
    };

    mockDb.addHandler('FROM join_create_temp_channels', () => ({
      rows: [tempChannel],
      rowCount: 1
    }));

    mockDb.addHandler('UPDATE join_create_temp_channels SET name', (sql, params) => {
      tempChannel.name = params[1];
      return { rows: [tempChannel], rowCount: 1 };
    });

    const fakeChannel = {
      id: channelId,
      name: "Nick's VC",
      setName: async (name) => { fakeChannel.name = name; }
    };

    let replyResult = null;
    const fakeInteraction = {
      guildId,
      user: { id: ownerUserId, tag: 'Nick#0001' },
      guild: {
        id: guildId,
        channels: { fetch: async () => fakeChannel },
        members: {
          fetch: async (id) => ({
            id,
            user: { id, tag: 'Nick#0001' },
            guild: { id: guildId, channels: { fetch: async () => fakeChannel } },
            voice: { channelId }
          })
        }
      },
      options: {
        getSubcommand: () => 'rename',
        getString: (name) => name === 'name' ? 'Awesome Study Space' : null
      },
      deferred: false,
      replied: false,
      deferReply: async function() { this.deferred = true; },
      editReply: async function(payload) { replyResult = payload; },
      reply: async function(payload) { replyResult = payload; this.replied = true; }
    };

    const fakeCtx = {
      logger: { log: async () => {} }
    };

    await vcCmd.execute(fakeInteraction, fakeCtx);
    assert.ok(replyResult?.embeds?.[0]);
    assert.equal(replyResult.embeds[0].data.title, 'Temporary Voice Renamed');
  });
});
