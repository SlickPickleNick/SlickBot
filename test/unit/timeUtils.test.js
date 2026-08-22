const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDurationToMs,
  formatDuration,
  formatDiscordTimestamp,
  SECOND_MS,
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  WEEK_MS
} = require('../../src/utils/time');

test('timeUtils: parseDurationToMs parses standard units', () => {
  assert.equal(parseDurationToMs('30s'), 30 * SECOND_MS);
  assert.equal(parseDurationToMs('45sec'), 45 * SECOND_MS);
  assert.equal(parseDurationToMs('10m'), 10 * MINUTE_MS);
  assert.equal(parseDurationToMs('15min'), 15 * MINUTE_MS);
  assert.equal(parseDurationToMs('2h'), 2 * HOUR_MS);
  assert.equal(parseDurationToMs('4hours'), 4 * HOUR_MS);
  assert.equal(parseDurationToMs('1d'), DAY_MS);
  assert.equal(parseDurationToMs('3days'), 3 * DAY_MS);
  assert.equal(parseDurationToMs('2w'), 2 * WEEK_MS);
  assert.equal(parseDurationToMs('1week'), WEEK_MS);
});

test('timeUtils: parseDurationToMs parses compound multi-unit strings', () => {
  assert.equal(parseDurationToMs('1d 2h 30m'), DAY_MS + (2 * HOUR_MS) + (30 * MINUTE_MS));
  assert.equal(parseDurationToMs('1w 3d 4h 15m 30s'), WEEK_MS + (3 * DAY_MS) + (4 * HOUR_MS) + (15 * MINUTE_MS) + (30 * SECOND_MS));
});

test('timeUtils: parseDurationToMs handles invalid inputs with configurable fallbacks', () => {
  assert.equal(parseDurationToMs(''), null);
  assert.equal(parseDurationToMs(null), null);
  assert.equal(parseDurationToMs('invalid-string'), null);
  assert.equal(parseDurationToMs('invalid-string', { fallback: 0 }), 0);
  assert.equal(parseDurationToMs('', { fallback: 1000 }), 1000);
});

test('timeUtils: formatDuration formats duration nicely', () => {
  assert.equal(formatDuration(30 * SECOND_MS, { short: true }), '30s');
  assert.equal(formatDuration(10 * MINUTE_MS, { short: true }), '10m');
  assert.equal(formatDuration(2 * HOUR_MS + 15 * MINUTE_MS, { short: true }), '2h 15m');
  assert.equal(formatDuration(DAY_MS + 4 * HOUR_MS, { short: true }), '1d 4h');

  assert.equal(formatDuration(DAY_MS + 2 * HOUR_MS, { short: false }), '1 day, 2 hours');
  assert.equal(formatDuration(0, { short: true }), '0s');
  assert.equal(formatDuration(0, { short: false }), '0 seconds');
});

test('timeUtils: formatDiscordTimestamp formats valid discord timestamps', () => {
  const date = new Date('2026-08-22T00:00:00Z');
  const expectedTs = Math.floor(date.getTime() / 1000);
  assert.equal(formatDiscordTimestamp(date, 'R'), `<t:${expectedTs}:R>`);
  assert.equal(formatDiscordTimestamp(date, 'F'), `<t:${expectedTs}:F>`);
  assert.equal(formatDiscordTimestamp(null), 'N/A');
});
