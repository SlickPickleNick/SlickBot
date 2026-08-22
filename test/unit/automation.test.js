const test = require('node:test');
const assert = require('node:assert/strict');
const { repeatSeconds, parseDelay } = require('../../src/modules/automation/scheduledMessageService');
const { BotUpdatesService } = require('../../src/modules/status/botUpdatesService');

test('Scheduled Message Repeat Intervals and Delay Parsing', async (t) => {
  await t.test('repeatSeconds converts recurring schedule modes to seconds', () => {
    assert.equal(repeatSeconds('DAILY'), 86400);
    assert.equal(repeatSeconds('WEEKLY'), 604800);
    assert.equal(repeatSeconds('NONE'), 0);
    assert.equal(repeatSeconds('UNKNOWN'), 0);
  });

  await t.test('parseDelay parses human readable delays into seconds', () => {
    assert.equal(parseDelay('10m'), 600);
    assert.equal(parseDelay('2h'), 7200);
    assert.equal(parseDelay('1d'), 86400);
    assert.equal(parseDelay('1w'), 604800);
    assert.equal(parseDelay('invalid'), null);
  });

  await t.test('BotUpdatesService loads structured release patch notes for v0.9.6', () => {
    const service = new BotUpdatesService();
    const release = service.getRelease('0.9.6');
    assert.equal(release.title, 'SlickBot v0.9.6');
    assert.ok(release.summary.includes('Utility'));
    assert.ok(release.notes.length > 5);
    assert.ok(release.commands.includes('/purge'));
    assert.ok(release.commands.includes('/userinfo'));
    assert.ok(release.commands.includes('/poll create'));
  });

  await t.test('BotUpdatesService loads structured release patch notes for current v0.9.7', () => {
    const service = new BotUpdatesService();
    const release = service.getRelease('0.9.7');
    assert.equal(release.title, 'SlickBot v0.9.7');
    assert.ok(release.summary.includes('Setup Center'));
    assert.ok(release.notes.length > 5);
    assert.ok(release.commands.includes('/help'));
    assert.ok(release.commands.includes('/setup'));
  });
});
