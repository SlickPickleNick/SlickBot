const test = require('node:test');
const assert = require('node:assert/strict');
const { MockDatabase } = require('../helpers/mockDb');
const {
  CustomCommandService,
  cleanTrigger,
  normalizePrefix,
  replaceVariables
} = require('../../src/modules/custom/customCommandService');

const mockDb = new MockDatabase();

test('Custom Command String Parsing and Variable Replacement', async (t) => {
  await t.test('cleanTrigger trims and validates triggers', () => {
    assert.equal(cleanTrigger('!rules', '!'), 'rules');
    assert.equal(cleanTrigger('!help-me', '!'), 'help-me');
    assert.equal(cleanTrigger('hello', '!'), 'hello');
    assert.equal(cleanTrigger('invalid trigger with spaces', '!'), 'invalid-trigger-with-spaces');
    assert.equal(cleanTrigger('$$$$', '!'), null);
  });

  await t.test('normalizePrefix sets safe prefix length', () => {
    assert.equal(normalizePrefix('!'), '!');
    assert.equal(normalizePrefix('?'), '?');
    assert.equal(normalizePrefix(''), '!');
    assert.equal(normalizePrefix('1234567890'), '12345678');
  });

  await t.test('replaceVariables performs substitution on tokens', () => {
    const message = {
      author: { id: '100', username: 'TestUser' },
      guild: { name: 'My Server' },
      channelId: '300'
    };
    const command = { name: 'ping', prefix: '!', usage_count: 5 };
    const text = 'Hey {user}! Welcome to {server} in {channel}. Command {trigger} used {uses} times.';
    const result = replaceVariables(text, message, command);
    assert.equal(result, 'Hey <@100>! Welcome to My Server in <#300>. Command !ping used 6 times.');
  });
});

test('CustomCommandService Caching', async (t) => {
  let service;
  const guildId = '400000000000000001';

  t.beforeEach(() => {
    mockDb.install();
    service = new CustomCommandService();
  });

  t.afterEach(() => {
    mockDb.uninstall();
    service.clearAllCaches();
  });

  await t.test('getConfig caches guild prefix configuration', async () => {
    let queryCount = 0;
    mockDb.addHandler('custom_command_configs', () => {
      queryCount++;
      return { rows: [{ guild_id: guildId, prefix: '!', enabled: true }], rowCount: 1 };
    });

    const first = await service.getConfig(guildId);
    assert.equal(first.prefix, '!');
    assert.equal(queryCount, 1);

    const second = await service.getConfig(guildId);
    assert.equal(second.prefix, '!');
    assert.equal(queryCount, 1); // Served from cache
  });
});
