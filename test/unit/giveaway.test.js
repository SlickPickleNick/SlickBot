const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GiveawayService,
  buildGiveawayPayload,
  buildGiveawayStartModal,
  buildGiveawayConfigModal
} = require('../../src/modules/community/giveawayService');
const { MockDatabase } = require('../helpers/mockDb');
const { ModuleKeys } = require('../../src/modules/moduleRegistry');
const { ActionKeys } = require('../../src/modules/permissions/actionKeys');
const giveawayCmd = require('../../src/commands/giveaway');
const { commands, commandMap } = require('../../src/commands');
const { validateCommandPayloads } = require('../../src/utils/commandValidation');
const { CustomIds } = require('../../src/modules/ui/customIds');

const mockDb = new MockDatabase();

test('Giveaways Engine & Entry Gates Tests', async (t) => {
  t.beforeEach(() => {
    mockDb.install();
  });

  t.afterEach(() => {
    mockDb.uninstall();
  });

  const guildId = '100000000000000001';
  const channelId = '200000000000000001';
  const roleVip = '400000000000000001';
  const roleBlocked = '400000000000000002';

  await t.test('pickWinners selects specified count of unique winners', () => {
    const service = new GiveawayService();
    const entries = [
      { user_id: 'user-1' },
      { user_id: 'user-2' },
      { user_id: 'user-3' },
      { user_id: 'user-4' },
      { user_id: 'user-5' }
    ];

    const winners = service.pickWinners(entries, 3);
    assert.equal(winners.length, 3);
    const unique = new Set(winners);
    assert.equal(unique.size, 3);
    for (const w of winners) {
      assert.ok(entries.some((e) => e.user_id === w));
    }
  });

  await t.test('pickWinners handles pools smaller than requested winner count', () => {
    const service = new GiveawayService();
    const entries = [{ user_id: 'user-1' }, { user_id: 'user-2' }];
    const winners = service.pickWinners(entries, 5);
    assert.equal(winners.length, 2);
  });

  await t.test('pickWinners respects excluded user IDs for rerolls', () => {
    const service = new GiveawayService();
    const entries = [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: 'user-3' }];
    const winners = service.pickWinners(entries, 1, ['user-1', 'user-2']);
    assert.deepEqual(winners, ['user-3']);
  });

  await t.test('checkEligibility evaluates minimum account age gate', async () => {
    const service = new GiveawayService();
    const giveaway = { min_account_age_days: 7 };

    // 1. Account created 10 days ago -> eligible
    const memberOld = {
      user: { id: 'u1', createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }
    };
    const resOld = await service.checkEligibility(guildId, memberOld, giveaway);
    assert.equal(resOld.eligible, true);

    // 2. Account created 2 days ago -> ineligible
    const memberNew = {
      user: { id: 'u2', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }
    };
    const resNew = await service.checkEligibility(guildId, memberNew, giveaway);
    assert.equal(resNew.eligible, false);
    assert.match(resNew.reason, /at least \*\*7 day\(s\)\*\* old/i);
  });

  await t.test('checkEligibility evaluates required role and blocked role gates', async () => {
    const service = new GiveawayService();
    const giveaway = {
      required_role_id: roleVip,
      blocked_role_ids: [roleBlocked]
    };

    // 1. Member with required VIP role -> eligible
    const memberVip = {
      user: { id: 'u1' },
      roles: { cache: new Map([[roleVip, { id: roleVip }]]) }
    };
    const resVip = await service.checkEligibility(guildId, memberVip, giveaway);
    assert.equal(resVip.eligible, true);

    // 2. Member without required VIP role -> ineligible
    const memberNormal = {
      user: { id: 'u2' },
      roles: { cache: new Map() }
    };
    const resNormal = await service.checkEligibility(guildId, memberNormal, giveaway);
    assert.equal(resNormal.eligible, false);
    assert.match(resNormal.reason, /must have the <@&400000000000000001> role/i);

    // 3. Member with VIP role but ALSO holding blocked role -> ineligible
    const memberBoth = {
      user: { id: 'u3' },
      roles: {
        cache: new Map([
          [roleVip, { id: roleVip }],
          [roleBlocked, { id: roleBlocked }]
        ])
      }
    };
    const resBoth = await service.checkEligibility(guildId, memberBoth, giveaway);
    assert.equal(resBoth.eligible, false);
    assert.match(resBoth.reason, /excluded from entering/i);
  });

  await t.test('checkEligibility evaluates server leveling level gate against database', async () => {
    const service = new GiveawayService();
    const giveaway = { min_level: 5 };

    // 1. Member with Level 7 in leveling_profiles -> eligible
    mockDb.addHandler('SELECT level FROM leveling_profiles', (sql, params) => {
      if (params[1] === 'u-high') return { rows: [{ level: 7 }], rowCount: 1 };
      return { rows: [{ level: 2 }], rowCount: 1 };
    });

    const memberHigh = { user: { id: 'u-high' } };
    const resHigh = await service.checkEligibility(guildId, memberHigh, giveaway);
    assert.equal(resHigh.eligible, true);

    // 2. Member with Level 2 in leveling_profiles -> ineligible
    const memberLow = { user: { id: 'u-low' } };
    const resLow = await service.checkEligibility(guildId, memberLow, giveaway);
    assert.equal(resLow.eligible, false);
    assert.match(resLow.reason, /must be at least \*\*Level 5\*\*.*\(Your current level: \*\*Level 2\*\*\)/i);
  });

  await t.test('enterGiveaway checks gate eligibility before recording entry', async () => {
    const service = new GiveawayService();
    let recordedEntry = null;

    mockDb.addHandler('SELECT * FROM giveaways', () => ({
      rows: [{
        id: 'g-1',
        guild_id: guildId,
        giveaway_number: 1,
        prize: 'Nitro',
        status: 'OPEN',
        ends_at: new Date(Date.now() + 3600000),
        min_level: 3
      }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT level FROM leveling_profiles', () => ({
      rows: [{ level: 5 }],
      rowCount: 1
    }));

    mockDb.addHandler('INSERT INTO giveaway_entries', (sql, params) => {
      recordedEntry = { giveaway_id: params[0], user_id: params[1], user_tag: params[2] };
      return { rows: [recordedEntry], rowCount: 1 };
    });

    const mockInteraction = {
      guildId,
      user: { id: 'user-winner', tag: 'Winner#0001' },
      member: { user: { id: 'user-winner', tag: 'Winner#0001' } }
    };

    const enterRes = await service.enterGiveaway({ interaction: mockInteraction, giveawayId: 'g-1' });
    assert.equal(enterRes.ok, true);
    assert.equal(enterRes.alreadyEntered, false);
    assert.ok(recordedEntry);
    assert.equal(recordedEntry.user_id, 'user-winner');
  });

  await t.test('buildGiveawayPayload renders requirements badges and entry status', () => {
    const giveaway = {
      id: 'g-10',
      giveaway_number: 10,
      prize: 'Discord Nitro Year',
      winner_count: 3,
      ends_at: new Date(Date.now() + 86400000),
      host_user_id: 'host-1',
      status: 'OPEN',
      required_role_id: roleVip,
      min_level: 5,
      min_account_age_days: 14
    };

    const payload = buildGiveawayPayload(giveaway, 25, { panel_color: '#00FFAA' });
    assert.equal(payload.embeds.length, 1);
    const embed = payload.embeds[0].data;
    assert.match(embed.title, /Discord Nitro Year/i);
    assert.match(embed.description, /Winners: \*\*3\*\*/i);
    assert.match(embed.description, /🔒 \*\*Entry Requirements:\*\*/i);
    assert.match(embed.description, /Required Role: <@&400000000000000001>/i);
    assert.match(embed.description, /Server Level: \*\*Level 5\+\*\*/i);
    assert.match(embed.description, /Account Age: \*\*14\+ days old\*\*/i);
    assert.equal(payload.components.length, 1);
  });

  await t.test('endGiveaway and rerollGiveaway handle multi-winner selections', async () => {
    const service = new GiveawayService();
    let updatedWinners = null;

    mockDb.addHandler('SELECT * FROM giveaways', () => ({
      rows: [{
        id: 'g-10',
        guild_id: guildId,
        giveaway_number: 10,
        prize: 'Gift Card',
        channel_id: channelId,
        message_id: 'msg-10',
        winner_count: 2,
        status: 'OPEN',
        winners: ['user-1', 'user-2']
      }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM giveaway_entries', () => ({
      rows: [
        { user_id: 'user-1' },
        { user_id: 'user-2' },
        { user_id: 'user-3' },
        { user_id: 'user-4' }
      ],
      rowCount: 4
    }));

    mockDb.addHandler('UPDATE giveaways', (sql, params) => {
      updatedWinners = JSON.parse(params[1]);
      return { rows: [{ id: 'g-10', winners: updatedWinners }], rowCount: 1 };
    });

    const mockChannel = {
      id: channelId,
      messages: { fetch: async () => ({ edit: async () => {} }) },
      send: async () => {}
    };

    const mockClient = {
      channels: { fetch: async () => mockChannel }
    };

    // 1. End giveaway -> picks 2 winners
    const endRes = await service.endGiveaway({ client: mockClient, guildId, giveawayNumber: 10 });
    assert.equal(endRes.ok, true);
    assert.equal(endRes.winners.length, 2);

    // 2. Reroll 1 winner -> picks a new winner
    const rerollRes = await service.endGiveaway({
      client: mockClient,
      guildId,
      giveawayNumber: 10,
      reroll: true,
      rerollCount: 1
    });
    assert.equal(rerollRes.ok, true);
    assert.equal(rerollRes.winners.length, 2);
  });

  await t.test('/giveaway command metadata, action keys, and validation', () => {
    assert.equal(giveawayCmd.data.name, 'giveaway');
    assert.equal(giveawayCmd.moduleKey, ModuleKeys.GIVEAWAYS);

    const makeInteraction = (subcommand) => ({
      options: { getSubcommand: () => subcommand }
    });

    assert.equal(giveawayCmd.getActionKey(makeInteraction('start')), ActionKeys.GiveawaysCreate);
    assert.equal(giveawayCmd.getActionKey(makeInteraction('end')), ActionKeys.GiveawaysEnd);
    assert.equal(giveawayCmd.getActionKey(makeInteraction('reroll')), ActionKeys.GiveawaysReroll);
    assert.equal(giveawayCmd.getActionKey(makeInteraction('setup')), ActionKeys.GiveawaysConfigure);
    assert.equal(giveawayCmd.getActionKey(makeInteraction('manager')), ActionKeys.GiveawaysView);

    assert.equal(commandMap.has('giveaway'), true);
    const payloads = commands.map((c) => c.data.toJSON());
    const errors = validateCommandPayloads(payloads);
    assert.deepEqual(errors, []);
  });

  await t.test('/giveaway setup and start command execution with entry gates', async () => {
    let savedConfig = null;
    let savedGiveaway = null;

    mockDb.addHandler('INSERT INTO giveaway_configs', (sql, params) => {
      savedConfig = {
        default_channel_id: params[1],
        default_min_account_age_days: params[6],
        default_min_level: params[7],
        default_required_role_id: params[8]
      };
      return { rows: [savedConfig], rowCount: 1 };
    });

    mockDb.addHandler('SELECT COALESCE(MAX(giveaway_number), 0) + 1 AS next FROM giveaways', () => ({
      rows: [{ next: 1 }],
      rowCount: 1
    }));

    mockDb.addHandler('SELECT * FROM giveaway_configs', () => ({
      rows: [],
      rowCount: 0
    }));

    mockDb.addHandler('INSERT INTO giveaways', (sql, params) => {
      savedGiveaway = {
        prize: params[3],
        winner_count: params[5],
        required_role_id: params[8],
        min_account_age_days: params[11],
        min_level: params[12]
      };
      return { rows: [{ id: 'g-1', giveaway_number: 1, ...savedGiveaway }], rowCount: 1 };
    });

    mockDb.addHandler('UPDATE giveaways', () => ({
      rows: [{ id: 'g-1', giveaway_number: 1 }],
      rowCount: 1
    }));

    const mockChannel = {
      id: channelId,
      send: async () => ({ id: 'msg-g-1' })
    };

    let replyPayload = null;
    const mockInteraction = {
      guildId,
      user: { id: 'admin-1', tag: 'Admin#0001' },
      options: {
        getSubcommand: () => 'start',
        getString: (name) => (name === 'prize' ? 'Nitro 1 Month' : name === 'duration' ? '1h' : null),
        getInteger: (name) => (name === 'winners' ? 2 : name === 'min_level' ? 5 : name === 'min_account_age' ? 14 : null),
        getRole: (name) => (name === 'required_role' ? { id: roleVip } : null),
        getChannel: () => mockChannel
      },
      reply: async (p) => { replyPayload = p; }
    };

    const ctx = {
      permissions: { ensureGuildConfig: async () => {} },
      client: { channels: { fetch: async () => mockChannel } },
      logger: { log: async () => {} }
    };

    await giveawayCmd.execute(mockInteraction, ctx);
    assert.ok(replyPayload);
    assert.match(replyPayload.embeds[0].data.title, /Giveaway Started/i);
    assert.equal(savedGiveaway.prize, 'Nitro 1 Month');
    assert.equal(savedGiveaway.winner_count, 2);
    assert.equal(savedGiveaway.required_role_id, roleVip);
    assert.equal(savedGiveaway.min_level, 5);
    assert.equal(savedGiveaway.min_account_age_days, 14);
  });
});
