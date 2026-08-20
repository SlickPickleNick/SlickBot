const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const {
  LevelingService,
  totalXpForLevel,
  levelFromXp,
  progressForProfile,
  formatMultiplier
} = require('../../src/modules/community/levelingService');

const mockDb = new MockDatabase();

test('Leveling Math and Profile Progress', async (t) => {
  await t.test('XP curves calculate level thresholds accurately', () => {
    assert.equal(totalXpForLevel(0), 0);
    assert.equal(totalXpForLevel(1), 125);
    assert.equal(totalXpForLevel(2), 300);
    assert.equal(levelFromXp(0), 0);
    assert.equal(levelFromXp(124), 0);
    assert.equal(levelFromXp(125), 1);
    assert.equal(levelFromXp(300), 2);
  });

  await t.test('progressForProfile calculates current level progress', () => {
    const progress = progressForProfile({ xp: 50, level: 0 });
    assert.equal(progress.level, 0);
    assert.equal(progress.xp, 50);
    assert.equal(progress.currentXp, 50);
    assert.equal(progress.neededXp, 125);
  });

  await t.test('formatMultiplier formats multiplier text', () => {
    assert.equal(formatMultiplier(2), '2×');
    assert.equal(formatMultiplier(1.5), '1.5×');
    assert.equal(formatMultiplier(1), '1×');
  });
});

test('LevelingService Caching and Multiplier Roles', async (t) => {
  let service;
  const guildId = '400000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new LevelingService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('getConfig caches guild leveling configuration', async () => {
    let queryCount = 0;
    mockDb.addHandler('leveling_configs', () => {
      queryCount++;
      return { rows: [{ guild_id: guildId, enabled: true, xp_min: 15, xp_max: 25, cooldown_seconds: 60 }], rowCount: 1 };
    });

    const first = await service.getConfig(guildId);
    assert.equal(first.enabled, true);
    assert.equal(queryCount, 1);

    const second = await service.getConfig(guildId);
    assert.equal(second.enabled, true);
    assert.equal(queryCount, 1); // Served from cache
  });

  await t.test('getApplicableMultiplier selects highest multiplier from member roles', async () => {
    const role1 = '200000000000000001';
    const role2 = '200000000000000002';
    mockDb.addHandler('leveling_multiplier_roles', {
      rows: [
        { role_id: role1, multiplier: 2.0, active: true },
        { role_id: role2, multiplier: 1.5, active: true }
      ],
      rowCount: 2
    });

    const highest = await service.getApplicableMultiplier(guildId, [role2, role1]);
    assert.equal(highest.multiplier, 2.0);
    assert.equal(highest.roleId, role1);

    const none = await service.getApplicableMultiplier(guildId, []);
    assert.equal(none.multiplier, 1.0);
    assert.equal(none.roleId, null);
  });
});
