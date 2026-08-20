const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionService, PermissionLevels } = require('../../src/modules/permissions/permissionService');
const { MockDatabase } = require('../helpers/mockDb');

const mockDb = new MockDatabase();

test('PermissionService caching and hierarchy', async (t) => {
  let service;
  const guildId = '400000000000000001';
  const userId = '100000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new PermissionService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('PermissionLevels enum is defined with ranks', () => {
    assert.ok(PermissionLevels.EVERYONE);
    assert.ok(PermissionLevels.MODERATOR);
    assert.ok(PermissionLevels.SENIOR_MODERATOR);
    assert.ok(PermissionLevels.OWNER);
  });

  await t.test('isIgnored caches query result in memory', async () => {
    let queryCount = 0;
    mockDb.addHandler('permission_ignored_users', () => {
      queryCount++;
      return { rows: [{ user_id: userId, active: true }], rowCount: 1 };
    });

    const first = await service.isIgnored(guildId, userId);
    assert.equal(first, true);
    assert.equal(queryCount, 1);

    const second = await service.isIgnored(guildId, userId);
    assert.equal(second, true);
    assert.equal(queryCount, 1); // Served from cache

    service.invalidateIgnoredUsers(guildId);
    const third = await service.isIgnored(guildId, userId);
    assert.equal(third, true);
    assert.equal(queryCount, 2); // Refetched after cache invalidation
  });

  await t.test('isModuleEnabled caches enabled module status', async () => {
    let queryCount = 0;
    mockDb.addHandler('module_configs', () => {
      queryCount++;
      return { rows: [{ module_key: 'LEVELING', enabled: true }], rowCount: 1 };
    });

    const first = await service.isModuleEnabled(guildId, 'LEVELING');
    assert.equal(first, true);
    assert.equal(queryCount, 1);

    const second = await service.isModuleEnabled(guildId, 'LEVELING');
    assert.equal(second, true);
    assert.equal(queryCount, 1); // Served from cache
  });
});
