const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatBirthday,
  isValidDate,
  safeTimezone
} = require('../../src/modules/community/birthdayService');

test('Birthday Date Validation and Timezone Handling', async (t) => {
  await t.test('isValidDate validates calendar days', () => {
    assert.equal(isValidDate(4, 15), true);
    assert.equal(isValidDate(2, 29), true);
    assert.equal(isValidDate(2, 30), false);
    assert.equal(isValidDate(13, 1), false);
    assert.equal(isValidDate(0, 5), false);
    assert.equal(isValidDate(11, 31), false);
  });

  await t.test('formatBirthday formats month and day', () => {
    assert.equal(formatBirthday(4, 15), 'April 15');
    assert.equal(formatBirthday(12, 25), 'December 25');
  });

  await t.test('safeTimezone handles valid and fallback timezones', () => {
    assert.equal(safeTimezone('America/New_York'), 'America/New_York');
    assert.equal(safeTimezone('UTC'), 'UTC');
    assert.equal(safeTimezone('invalid/timezone'), 'America/New_York');
    assert.equal(safeTimezone(null), 'America/New_York');
  });
});
