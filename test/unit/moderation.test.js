const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDurationToMs,
  formatDuration
} = require('../../src/modules/moderation/tempRoleService');

test('Temporary Role Duration Parsing and Formatting', async (t) => {
  await t.test('parseDurationToMs parses composite duration strings reliably across multiple calls', () => {
    assert.equal(parseDurationToMs('10m'), 10 * 60 * 1000);
    assert.equal(parseDurationToMs('2h'), 2 * 60 * 60 * 1000);
    assert.equal(parseDurationToMs('1d 2h 30m'), (24 * 60 * 60 * 1000) + (2 * 60 * 60 * 1000) + (30 * 60 * 1000));
    assert.equal(parseDurationToMs('1w'), 7 * 24 * 60 * 60 * 1000);
    assert.equal(parseDurationToMs('invalid'), 0);
    assert.equal(parseDurationToMs(''), 0);
  });

  await t.test('formatDuration formats milliseconds into human-readable text', () => {
    assert.equal(formatDuration(60000), '1m');
    assert.equal(formatDuration(3600000), '1h');
    assert.equal(formatDuration(86400000), '1d');
    assert.equal(formatDuration(86400000 + 3600000 + 120000), '1d 1h 2m');
  });
});
