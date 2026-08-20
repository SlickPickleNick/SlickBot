const test = require('node:test');
const assert = require('node:assert/strict');
const { LoggingService, LogDeliveryMode } = require('../../src/modules/logging/loggingService');
const { MockDatabase } = require('../helpers/mockDb');

const mockDb = new MockDatabase();

test('LoggingService Routing and Caching', async (t) => {
  let service;
  const guildId = '400000000000000001';
  const mockClient = { channels: { fetch: async () => null } };

  t.beforeEach(() => {
    mockDb.install();
    service = new LoggingService(mockClient);
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('LogDeliveryMode enum defines delivery strategies', () => {
    assert.equal(LogDeliveryMode.IMMEDIATE, 'IMMEDIATE');
    assert.equal(LogDeliveryMode.BATCHED, 'BATCHED');
    assert.equal(LogDeliveryMode.DISABLED, 'DISABLED');
  });

  await t.test('getLogRouting returns null when module or event is disabled', async () => {
    mockDb.addHandler('log_module_settings', {
      rows: [{ module_key: 'messages', enabled: false, delivery_mode: 'DISABLED' }],
      rowCount: 1
    });
    mockDb.addHandler('log_settings', {
      rows: [],
      rowCount: 0
    });

    const routing = await service.getLogRouting(guildId, 'message-delete');
    assert.equal(routing, null);
  });

  await t.test('getLogRouting caches resolved routing and parallelizes queries', async () => {
    let queryCount = 0;
    mockDb.addHandler('log_module_settings', () => {
      queryCount++;
      return { rows: [{ module_key: 'messages', channel_id: '300000000000000001', enabled: true, delivery_mode: 'IMMEDIATE' }], rowCount: 1 };
    });
    mockDb.addHandler('log_settings', () => {
      queryCount++;
      return { rows: [], rowCount: 0 };
    });

    const first = await service.getLogRouting(guildId, 'message-delete');
    assert.ok(first);
    assert.equal(first.channelId, '300000000000000001');
    assert.equal(queryCount, 2);

    const second = await service.getLogRouting(guildId, 'message-delete');
    assert.ok(second);
    assert.equal(queryCount, 2); // Cached!

    service.invalidateRouting(guildId);
    const third = await service.getLogRouting(guildId, 'message-delete');
    assert.ok(third);
    assert.equal(queryCount, 4); // Refetched after invalidation
  });
});
