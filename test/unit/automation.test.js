const test = require('node:test');
const assert = require('node:assert/strict');
const { repeatSeconds, parseDelay } = require('../../src/modules/automation/scheduledMessageService');

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
});
