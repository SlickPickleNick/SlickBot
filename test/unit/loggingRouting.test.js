const test = require('node:test');
const assert = require('node:assert/strict');
const { LoggingService, LogDeliveryMode, resolveLogColor } = require('../../src/modules/logging/loggingService');
const {
  LogModuleCatalog,
  LogEventCatalog,
  LOG_GROUPS,
  getLogModule,
  getLogEvent,
  getLogGroup
} = require('../../src/modules/logging/logEventCatalog');

test('resolveLogColor returns expected color for various event types', () => {
  // Explicit override
  assert.equal(resolveLogColor('anything', 0x123456), 0x123456);

  // Red for deletes, leaves, bans, errors
  assert.equal(resolveLogColor('message-delete'), 0xed4245);
  assert.equal(resolveLogColor('member-leave'), 0xed4245);
  assert.equal(resolveLogColor('guild-ban-add'), 0xed4245);
  assert.equal(resolveLogColor('channel-delete'), 0xed4245);

  // Green for creates, joins, unlocks, additions
  assert.equal(resolveLogColor('member-join'), 0x57f287);
  assert.equal(resolveLogColor('channel-create'), 0x57f287);
  assert.equal(resolveLogColor('role-create'), 0x57f287);
  assert.equal(resolveLogColor('achievement-unlock'), 0x57f287);

  // Yellow / Amber for edits, updates, roles
  assert.equal(resolveLogColor('message-edit'), 0xfee75c);
  assert.equal(resolveLogColor('channel-update'), 0xfee75c);
  assert.equal(resolveLogColor('role-update'), 0xfee75c);
  assert.equal(resolveLogColor('member-nickname'), 0xfee75c);

  // Default blurple
  assert.equal(resolveLogColor('system'), 0x5865f2);
});

test('LogEventCatalog contains all expected server, channel, role, and moderation events', () => {
  assert.ok(getLogModule('channels'));
  assert.ok(getLogModule('roles'));
  assert.ok(getLogModule('server'));
  assert.ok(getLogModule('moderation'));

  assert.ok(getLogEvent('channel-create'));
  assert.ok(getLogEvent('channel-delete'));
  assert.ok(getLogEvent('channel-update'));
  assert.ok(getLogEvent('role-create'));
  assert.ok(getLogEvent('role-delete'));
  assert.ok(getLogEvent('role-update'));
  assert.ok(getLogEvent('guild-ban-add'));
  assert.ok(getLogEvent('guild-ban-remove'));
  assert.ok(getLogEvent('automod-execution'));
  assert.ok(getLogEvent('invite-create'));
  assert.ok(getLogEvent('emoji-create'));
  assert.ok(getLogEvent('sticker-create'));
});

test('LoggingService methods and cache lifecycle', () => {
  const service = new LoggingService();
  assert.equal(typeof service.getLogRouting, 'function');
  assert.equal(typeof service.log, 'function');
  assert.equal(typeof service.setModuleChannel, 'function');
  assert.equal(typeof service.setupLogGroup, 'function');
  assert.equal(typeof service.getLogGroupChannels, 'function');
  assert.equal(typeof service.autoCreateAllLogChannels, 'function');
  assert.equal(typeof service.testAllHubs, 'function');
  assert.equal(typeof service.setEventChannel, 'function');
  assert.equal(typeof service.resetGuildLogging, 'function');

  // Invalidate cache
  service.routingCache.set('g1:member-join', { test: true });
  service.routingCache.set('g2:member-join', { test: true });
  service.invalidateRouting('g1');
  assert.equal(service.routingCache.has('g1:member-join'), false);
  assert.equal(service.routingCache.has('g2:member-join'), true);

  service.clearAllCaches();
  assert.equal(service.routingCache.size, 0);
});

test('LoggingService buildChannelGuideEmbed formats overview, active modules and quick management', () => {
  const service = new LoggingService();
  const { getLogGroup, getLogModule } = require('../../src/modules/logging/logEventCatalog');
  const group = getLogGroup('CORE_SYSTEM');
  const modules = group.moduleKeys.map((k) => getLogModule(k)).filter(Boolean);

  const embed = service.buildChannelGuideEmbed({ group, modules });
  assert.ok(embed);
  assert.match(embed.data.title, /Core & System Logs • Channel Setup/);
  assert.match(embed.data.description, /Active Log Modules/);
  assert.match(embed.data.description, /Core \/ System/);
  assert.match(embed.data.description, /Quick Management/);
  assert.match(embed.data.footer.text, /Pinned for easy reference/);
});
